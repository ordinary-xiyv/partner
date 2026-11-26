package partner

import (
	"os"
	"testing"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"partner/internal/model"
)

/*
真实库验证：用量聚合改成标量相关子查询后，
 1. 结果与旧写法（派生表聚合）逐行一致 —— 口径没漂
 2. 耗时不再随「查询区间跨度」暴涨

为什么需要这个：单测用的是 sqlite，样本是我自己造的 7 条日志。
真正让它慢的是 Postgres 的**执行计划选择**（子查询一律 Seq Scan，
不走 logs.user_id 索引），那个行为 sqlite 根本没有。所以必须对着
真实 Postgres 跑一次，否则「改成标量相关子查询有效」这句话没有证据。

★ 只做 SELECT，不写任何数据。
*/
func TestRealDBPartnerUsersUsageMatchesOnDerivedTable(t *testing.T) {
	dsn := os.Getenv("PARTNER_VERIFY_DSN")
	if dsn == "" {
		t.Skip("未设置 PARTNER_VERIFY_DSN，跳过真实库验证")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatal(err)
	}
	prevDB, prevLog := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() { model.DB, model.LOG_DB = prevDB, prevLog })

	const merchantID int64 = 1

	// 先确认这个商户真的有数据，否则后面全是空跑
	var userCount int64
	if err := db.Table("users").
		Where("merchant_id = ? AND deleted_at IS NULL AND role IN ?",
			merchantID, []int{0, 1}).
		Count(&userCount).Error; err != nil {
		t.Fatal(err)
	}
	if userCount == 0 {
		t.Skip("该商户没有客户，跳过")
	}
	t.Logf("商户 %d 有 %d 个客户", merchantID, userCount)

	now := time.Now()
	start, end, err := partnerBillingDates("", "", now)
	if err != nil {
		t.Fatal(err)
	}
	lo, hi := start.Unix(), end.AddDate(0, 0, 1).Unix()

	type row struct {
		UserID       int64
		UsedQuota    *int64
		RequestCount *int64
	}

	// 旧写法：派生表全量聚合再 LEFT JOIN（这次修掉的形态）
	var oldRows []row
	if err := db.Table("users").
		Select(`users.id AS user_id, usage.used_quota, usage.request_count`).
		Joins(`LEFT JOIN (SELECT user_id,
			SUM(CASE WHEN type IN (?, ?, ?) THEN quota WHEN type = ? THEN -quota ELSE 0 END) AS used_quota,
			SUM(CASE WHEN type IN (?, ?) THEN 1 ELSE 0 END) AS request_count
			FROM logs WHERE created_at >= ? AND created_at < ? GROUP BY user_id) AS usage
			ON usage.user_id = users.id`,
			model.LogTypeConsume, model.LogTypePreConsume, model.LogTypeAdditionalCharge, model.LogTypeRefund,
			model.LogTypeConsume, model.LogTypePreConsume, lo, hi).
		Where("users.merchant_id = ? AND users.deleted_at IS NULL AND users.role IN ?",
			merchantID, []int{0, 1}).
		Order("users.id").Scan(&oldRows).Error; err != nil {
		t.Fatal(err)
	}

	// 新写法：标量相关子查询（生产代码现在用的）
	var newRows []row
	if err := db.Table("users").
		Select(`users.id AS user_id,
			(SELECT SUM(CASE WHEN type IN (?, ?, ?) THEN quota WHEN type = ? THEN -quota ELSE 0 END)
			 FROM logs WHERE logs.user_id = users.id AND created_at >= ? AND created_at < ?) AS used_quota,
			(SELECT SUM(CASE WHEN type IN (?, ?) THEN 1 ELSE 0 END)
			 FROM logs WHERE logs.user_id = users.id AND created_at >= ? AND created_at < ?) AS request_count`,
			model.LogTypeConsume, model.LogTypePreConsume, model.LogTypeAdditionalCharge, model.LogTypeRefund,
			lo, hi,
			model.LogTypeConsume, model.LogTypePreConsume, lo, hi).
		Where("users.merchant_id = ? AND users.deleted_at IS NULL AND users.role IN ?",
			merchantID, []int{0, 1}).
		Order("users.id").Scan(&newRows).Error; err != nil {
		t.Fatal(err)
	}

	if len(oldRows) != len(newRows) {
		t.Fatalf("行数不一致：旧写法 %d，新写法 %d", len(oldRows), len(newRows))
	}

	var nonNull int
	for i := range oldRows {
		if oldRows[i].UserID != newRows[i].UserID {
			t.Fatalf("第 %d 行 user_id 不一致：旧 %d，新 %d",
				i, oldRows[i].UserID, newRows[i].UserID)
		}
		// NULL 必须两边都是 NULL（这是「—」的语义，不能被 COALESCE 成 0）
		if (oldRows[i].UsedQuota == nil) != (newRows[i].UsedQuota == nil) {
			t.Fatalf("user %d 的 used_quota NULL 性不一致：旧 %v，新 %v",
				oldRows[i].UserID, oldRows[i].UsedQuota, newRows[i].UsedQuota)
		}
		if (oldRows[i].RequestCount == nil) != (newRows[i].RequestCount == nil) {
			t.Fatalf("user %d 的 request_count NULL 性不一致：旧 %v，新 %v",
				oldRows[i].UserID, oldRows[i].RequestCount, newRows[i].RequestCount)
		}
		if oldRows[i].UsedQuota != nil && *oldRows[i].UsedQuota != *newRows[i].UsedQuota {
			t.Fatalf("user %d 的 used_quota 不一致：旧 %d，新 %d",
				oldRows[i].UserID, *oldRows[i].UsedQuota, *newRows[i].UsedQuota)
		}
		if oldRows[i].RequestCount != nil && *oldRows[i].RequestCount != *newRows[i].RequestCount {
			t.Fatalf("user %d 的 request_count 不一致：旧 %d，新 %d",
				oldRows[i].UserID, *oldRows[i].RequestCount, *newRows[i].RequestCount)
		}
		if oldRows[i].UsedQuota != nil {
			nonNull++
		}
	}
	t.Logf("逐行比对通过：共 %d 行，其中 %d 行本月有用量（其余为 NULL 显示「—」）",
		len(oldRows), nonNull)
}

/*
 * 真实库验证：billing/summary 改成「完结天读 lc_log_daily_summaries + 缺口现算」后，
 * 新两段合并的结果必须与全区间现算（旧实现口径）逐行一致。
 *
 * 本地真实库的汇总表覆盖 2026-06-01 ~ 2026-11-23，而 logs 有到今天的数据 ——
 * 正好同时命中「汇总段」「缺口现算段（11-24/25 的空窗 + 今天）」两段路径。
 *
 * ★ 只做 SELECT，不写任何数据。
 */
func TestRealDBPartnerBillingSummaryMergesDailySummary(t *testing.T) {
	dsn := os.Getenv("PARTNER_VERIFY_DSN")
	if dsn == "" {
		t.Skip("未设置 PARTNER_VERIFY_DSN，跳过真实库验证")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatal(err)
	}
	prevDB, prevLog := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() { model.DB, model.LOG_DB = prevDB, prevLog })

	// 汇总表没数据就没法验证两段路径，直接跳过（CI 环境/干净库）
	var covered int64
	if err := db.Table("lc_log_daily_summaries").Count(&covered).Error; err != nil {
		t.Skipf("lc_log_daily_summaries 不可用：%v", err)
	}
	if covered == 0 {
		t.Skip("汇总表为空，跳过两段合并验证")
	}

	const merchantID int64 = 1
	now := time.Now()
	start, end, err := partnerBillingDates("", "", now)
	if err != nil {
		t.Fatal(err)
	}
	lo, hi := start.Unix(), end.AddDate(0, 0, 1).Unix()

	type row struct {
		UserID       int64
		RequestCount int64
		Quota        int64
	}
	// 基准：全区间现算（旧实现口径原样）
	var base []row
	if err := db.Table("logs").
		Joins("JOIN users ON users.id = logs.user_id").
		Where("users.merchant_id = ? AND users.role IN ?", merchantID, []int{0, 1}).
		Where("logs.type IN ? AND logs.created_at >= ? AND logs.created_at < ?",
			[]int{model.LogTypeConsume, model.LogTypeRefund, model.LogTypePreConsume, model.LogTypeAdditionalCharge}, lo, hi).
		Select(`logs.user_id AS user_id,
			COALESCE(SUM(CASE WHEN logs.type IN (?, ?) THEN 1 ELSE 0 END), 0) AS request_count,
			COALESCE(SUM(CASE WHEN logs.type IN (?, ?, ?) THEN logs.quota WHEN logs.type = ? THEN -logs.quota ELSE 0 END), 0) AS quota`,
			model.LogTypeConsume, model.LogTypePreConsume,
			model.LogTypeConsume, model.LogTypePreConsume, model.LogTypeAdditionalCharge, model.LogTypeRefund).
		Group("logs.user_id").Scan(&base).Error; err != nil {
		t.Fatal(err)
	}

	// 新实现
	result, err := QueryPartnerBillingSummary(merchantID, start.Format("2006-01-02"), end.Format("2006-01-02"), 1, 10000, now)
	if err != nil {
		t.Fatal(err)
	}
	got := map[int64]PartnerBillingUser{}
	for _, it := range result.Items {
		got[it.UserID] = it
	}
	// 现算里出现、但新结果没有的用户（quota=0 时可能出现行合并差异，逐行核对）
	byUser := map[int64]row{}
	for _, r := range base {
		byUser[r.UserID] = r
	}
	if len(got) != len(base) {
		t.Fatalf("用户数不一致：基准 %d，新实现 %d", len(base), len(got))
	}
	for uid, b := range byUser {
		g, ok := got[uid]
		if !ok {
			t.Fatalf("用户 %d 在新实现里缺失", uid)
		}
		if g.Quota != b.Quota || g.RequestCount != b.RequestCount {
			t.Fatalf("用户 %d 不一致：基准 quota=%d req=%d，新实现 quota=%d req=%d",
				uid, b.Quota, b.RequestCount, g.Quota, g.RequestCount)
		}
	}
	t.Logf("billing 两段合并与全量现算逐行一致：%d 个用户，总额 %d，请求数 %d",
		result.TotalUsers, result.TotalQuota, result.TotalRequests)
}

/*
耗时对比：同一条业务路径，本月区间 vs 近三个月区间。

改动的意义在于「耗时不再随区间跨度暴涨」。旧写法两个区间都会把
整个区间的全平台日志扫一遍，跨度越大越慢；新写法按 user_id 走索引，
跨度只增加几个分区索引查找。

注意这个测试只做**提示**（t.Logf），不做硬断言 —— 本机库小、CI 机器负载
不定，把毫秒数写成断言会变成随机失败。真正要盯的是上面那条逐行一致性。
*/
func TestRealDBPartnerUsersUsageLatencyShape(t *testing.T) {
	dsn := os.Getenv("PARTNER_VERIFY_DSN")
	if dsn == "" {
		t.Skip("未设置 PARTNER_VERIFY_DSN，跳过真实库验证")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatal(err)
	}
	prevDB, prevLog := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() { model.DB, model.LOG_DB = prevDB, prevLog })

	const merchantID int64 = 1

	measure := func(label string, q PartnerUserQuery) {
		t.Helper()
		started := time.Now()
		page, err := ListPartnerUsersWith(q)
		cost := time.Since(started)
		if err != nil {
			t.Fatalf("%s 查询失败: %v", label, err)
		}
		t.Logf("%-24s %8.1f ms  total=%d 本页=%d",
			label, float64(cost.Microseconds())/1000, page.Total, len(page.Items))
	}

	now := time.Now()
	today := now.Format("2006-01-02")
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.Local).Format("2006-01-02")
	// 93 天前（接口允许的上限）
	long := now.AddDate(0, 0, -92).Format("2006-01-02")

	// 预热一次，避免把首次连接/编译的耗时算进去
	_, _ = ListPartnerUsersWith(PartnerUserQuery{MerchantID: merchantID, Page: 1, PageSize: 10})

	measure("默认(本月,按id)", PartnerUserQuery{MerchantID: merchantID, Page: 1, PageSize: 10})
	measure("本月 显式区间", PartnerUserQuery{
		MerchantID: merchantID, Page: 1, PageSize: 10,
		StartDate: monthStart, EndDate: today,
	})
	measure("93天 区间", PartnerUserQuery{
		MerchantID: merchantID, Page: 1, PageSize: 10,
		StartDate: long, EndDate: today,
	})
	measure("按消耗排序", PartnerUserQuery{
		MerchantID: merchantID, Page: 1, PageSize: 10,
		Sort: "used_quota", Order: "desc",
	})
	measure("93天+按消耗排序", PartnerUserQuery{
		MerchantID: merchantID, Page: 1, PageSize: 10,
		Sort: "used_quota", Order: "desc",
		StartDate: long, EndDate: today,
	})
}
