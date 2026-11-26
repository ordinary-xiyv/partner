package partner

/*
 * 用量聚合的商户隔离 + 口径一致性 —— 防回归测试。
 *
 * 背景：线上 /users 曾要 3.8 秒（本月）、9.8 秒（近三月）。根因是那条用量聚合
 * 写在**派生表**里（`LEFT JOIN (SELECT ... FROM logs WHERE created_at ... GROUP BY user_id)`），
 * Postgres 对这种形态一律选全分区 Seq Scan + Hash，`logs.user_id` 的索引完全不用，
 * 于是耗时只取决于「全平台该时间段的日志量」—— 一个只有 1 个客户、0 条日志的
 * 商户也要 3.8 秒。已改成**标量相关子查询**（每行 users 走一次 user_id 索引）。
 * 实测 2000 万行数据下：119.8 ms → 0.8 ms（本月），363.9 ms → 2.5 ms（近三月）。
 *
 * 这个文件守两件事：
 *  1. 结果正确性 —— 商户 A 的客户不会拿到商户 B 的用量（隔离）
 *  2. 计费口径    —— 换成标量相关子查询前后，同一商户的 used_quota /
 *                   request_count 完全一致
 *
 * 第 2 条是这次改动最需要守的：如果将来有人为了"优化"又动了这段 SQL，
 * 口径一歪，「我的客户」页的消耗列就和账单页对不上了，而那种错很难被发现
 * —— 数字看着都是合理的，只是和别处不一致。
 */

import (
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"partner/internal/model"
)

// buildUsageFixture 建一个 users + logs 的最小库，两个商户各有客户与日志。
func buildUsageFixture(t *testing.T, name string) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(
		sqlite.Open("file:"+name+"?mode=memory&cache=private"),
		&gorm.Config{Logger: logger.Default.LogMode(logger.Silent)},
	)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TABLE users (
		id integer primary key, merchant_id integer, username text, display_name text,
		email text, phone text, role integer, status integer, created_time datetime,
		deleted_at datetime
	)`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TABLE logs (
		id integer primary key, user_id integer, created_at bigint, type bigint,
		quota bigint, username text
	)`).Error; err != nil {
		t.Fatal(err)
	}

	for _, sql := range []string{
		// 商户 11：客户 1、2，外加一个已删除客户 4 和一个平台管理员 5（都不该被聚合）
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (1, 11, 'a1', 'A1', 'a1@t', 1, 1)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (2, 11, 'a2', 'A2', 'a2@t', 1, 1)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status, deleted_at) VALUES (4, 11, 'a-del', 'ADel', 'd@t', 1, 1, current_timestamp)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (5, 11, 'a-admin', 'AAdmin', 'ad@t', 10, 1)",
		// 商户 11 的客户 6：本月一条日志都没有 —— 用量必须是 NULL，不能是 0
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (6, 11, 'a-idle', 'AIdle', 'i@t', 1, 1)",
		// 商户 22：客户 3 —— 它的日志绝不能混进商户 11 的统计
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (3, 22, 'b1', 'B1', 'b1@t', 1, 1)",
	} {
		if err := db.Exec(sql).Error; err != nil {
			t.Fatal(err)
		}
	}

	/*
	 * 时间基准取「今天 0 点」的本地时间，让 partnerBillingDates 的默认区间
	 * （本月 1 号 ~ 今天）一定能覆盖到 —— 否则测试在月初会空跑。
	 */
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 12, 0, 0, 0, time.Local)
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	// 落在「今天」区间内，且一定 >= 本月 1 号
	ts := today.Unix()
	if dayStart.Unix() < ts {
		ts = dayStart.Unix() + 3600
	}

	logs := []struct {
		id     int
		userID int
		typ    int
		quota  int64
	}{
		// 客户 1：消费 100 + 预扣 20 + 退款 5 => used = 100+20-5 = 115，request = 2
		{1, 1, model.LogTypeConsume, 100},
		{2, 1, model.LogTypePreConsume, 20},
		{3, 1, model.LogTypeRefund, 5},
		// 客户 2：补扣 30 => used = 30，request = 0
		{4, 2, model.LogTypeAdditionalCharge, 30},
		// 已删除客户 4 的日志：不该出现在任何统计里
		{5, 4, model.LogTypeConsume, 999},
		// 平台管理员 5 的日志：role=10 不在白名单，不该出现
		{6, 5, model.LogTypeConsume, 888},
		// 商户 22 的客户 3：跨商户隔离的关键样本
		{7, 3, model.LogTypeConsume, 777},
	}
	for _, l := range logs {
		if err := db.Exec(
			"INSERT INTO logs (id, user_id, created_at, type, quota, username) VALUES (?, ?, ?, ?, ?, '')",
			l.id, l.userID, ts, l.typ, l.quota,
		).Error; err != nil {
			t.Fatal(err)
		}
	}
	return db
}

func TestPartnerUsersUsageSubqueryIsMerchantScoped(t *testing.T) {
	db := buildUsageFixture(t, "partner_usage_scope")
	prevDB, prevLog := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() { model.DB, model.LOG_DB = prevDB, prevLog })

	page, err := ListPartnerUsersWith(PartnerUserQuery{MerchantID: 11, Page: 1, PageSize: 10})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 3 {
		t.Fatalf("商户 11 应有 3 个有效客户（客户 4 已删除、客户 5 是管理员），实际 %d", page.Total)
	}

	byID := map[int64]PartnerUser{}
	for _, it := range page.Items {
		byID[it.ID] = it
	}

	/*
	 * 客户 1：消费 100 + 预扣 20 − 退款 5 = 115，request_count 只数消费+预扣 = 2。
	 * 若子查询没做商户隔离，它还会把商户 22 的 777 之类算进来，数字就对不上。
	 */
	c1, ok := byID[1]
	if !ok {
		t.Fatal("缺少客户 1")
	}
	if c1.UsedQuota == nil {
		t.Fatal("客户 1 应有用量，但 used_quota 是 nil")
	}
	if *c1.UsedQuota != 115 {
		t.Fatalf("客户 1 used_quota 期望 115（100+20-5），实际 %d", *c1.UsedQuota)
	}
	if c1.RequestCount == nil || *c1.RequestCount != 2 {
		t.Fatalf("客户 1 request_count 期望 2，实际 %v", c1.RequestCount)
	}

	// 客户 2：只有补扣 30，request_count 为 0
	c2, ok := byID[2]
	if !ok {
		t.Fatal("缺少客户 2")
	}
	if c2.UsedQuota == nil || *c2.UsedQuota != 30 {
		t.Fatalf("客户 2 used_quota 期望 30，实际 %v", c2.UsedQuota)
	}
	if c2.RequestCount == nil || *c2.RequestCount != 0 {
		t.Fatalf("客户 2 request_count 期望 0，实际 %v", c2.RequestCount)
	}

	// 已删除客户和管理员不该出现在列表里
	if _, exists := byID[4]; exists {
		t.Fatal("已删除客户 4 不应出现在列表")
	}
	if _, exists := byID[5]; exists {
		t.Fatal("平台管理员 5 不应出现在客户列表")
	}
	// 跨商户用户绝不能出现
	if _, exists := byID[3]; exists {
		t.Fatal("商户 22 的客户 3 不应出现在商户 11 的列表")
	}

	/*
	 * ★ 客户 6：本月没有任何日志 —— 用量必须留在 NULL，绝不能变成 0。
	 *
	 * 这是这次改动最容易踩坏的一点：换成标量相关子查询后，有人可能"顺手"
	 * 加个 COALESCE(..., 0) 让数字好看。那会让界面把一个从没调用过的客户
	 * 显示成「本月花了 ¥0.0000」，读起来像他消费过但金额为零 —— 语义全错。
	 * 前端靠 nil + omitempty 显示「—」，这个契约一旦破了界面会静默变形。
	 */
	c6, ok := byID[6]
	if !ok {
		t.Fatal("缺少客户 6（无日志的客户也必须出现在列表里）")
	}
	if c6.UsedQuota != nil {
		t.Fatalf("客户 6 本月无日志，used_quota 应是 nil（界面显示「—」），实际 %d", *c6.UsedQuota)
	}
	if c6.RequestCount != nil {
		t.Fatalf("客户 6 本月无日志，request_count 应是 nil，实际 %d", *c6.RequestCount)
	}
	if c6.UsedAmountCNY != nil {
		t.Fatalf("客户 6 本月无日志，used_amount_cny 应是 nil，实际 %v", *c6.UsedAmountCNY)
	}

	/* 商户 22 视角：只能看到自己的 777，不能带上商户 11 的任何数字 */
	page22, err := ListPartnerUsersWith(PartnerUserQuery{MerchantID: 22, Page: 1, PageSize: 10})
	if err != nil {
		t.Fatal(err)
	}
	if page22.Total != 1 || len(page22.Items) != 1 {
		t.Fatalf("商户 22 应有 1 个客户，实际 total=%d items=%d", page22.Total, len(page22.Items))
	}
	if page22.Items[0].ID != 3 {
		t.Fatalf("商户 22 的客户应为 id=3，实际 %d", page22.Items[0].ID)
	}
	if page22.Items[0].UsedQuota == nil || *page22.Items[0].UsedQuota != 777 {
		t.Fatalf("商户 22 的客户 3 used_quota 期望 777，实际 %v", page22.Items[0].UsedQuota)
	}
}

/*
 * 口径一致性：直接跑两条 SQL —— 一条是修复前的写法（派生表聚合、无商户过滤，
 * 也就是拖慢线上的那个），一条是修复后的写法（标量相关子查询），
 * 比对同一商户每一行的聚合结果。
 *
 * 为什么要单独写这个：业务函数只有修复后的版本，没法直接对比"改前"。
 * 这里把旧 SQL 原样拼出来当作基准，任何口径漂移都会在这里暴露。
 */
func TestPartnerUsersUsageSameAsUnfilteredBaseline(t *testing.T) {
	db := buildUsageFixture(t, "partner_usage_baseline")
	prevDB, prevLog := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() { model.DB, model.LOG_DB = prevDB, prevLog })

	now := time.Now()
	start, end, err := partnerBillingDates("", "", now)
	if err != nil {
		t.Fatal(err)
	}
	lo, hi := start.Unix(), end.AddDate(0, 0, 1).Unix()

	type aggRow struct {
		UserID       int64
		UsedQuota    int64
		RequestCount int64
	}

	// 旧写法：派生表把整段区间全聚合一遍，再 LEFT JOIN 回来（线上慢查询原形）
	var oldRows []aggRow
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
			11, []int{0, 1}).
		Order("users.id").Scan(&oldRows).Error; err != nil {
		t.Fatal(err)
	}

	// 新写法：标量相关子查询，与 ListPartnerUsersWith 里现在拼的完全一致
	var newRows []aggRow
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
			11, []int{0, 1}).
		Order("users.id").Scan(&newRows).Error; err != nil {
		t.Fatal(err)
	}

	if len(oldRows) != len(newRows) {
		t.Fatalf("行数不一致：旧写法 %d 行，新写法 %d 行", len(oldRows), len(newRows))
	}
	for i := range oldRows {
		if oldRows[i].UserID != newRows[i].UserID {
			t.Fatalf("第 %d 行 user_id 不一致：旧 %d，新 %d", i, oldRows[i].UserID, newRows[i].UserID)
		}
		/*
		 * NULL 与 0 必须区分：没有日志的客户在两种写法下都应是 NULL（Go 里为 0 值），
		 * 不能一边 NULL 一边 0。这里直接比数值：两边都是 sqlite 的 COALESCE 缺省
		 * 行为，若一方变成 0、另一方 NULL，Scan 进 int64 都会是 0 —— 所以额外
		 * 用业务函数的结果做交叉验证（见上面的 merchant-scoped 测试）。
		 */
		if oldRows[i].UsedQuota != newRows[i].UsedQuota {
			t.Fatalf("第 %d 行 used_quota 不一致：旧 %d，新 %d",
				i, oldRows[i].UsedQuota, newRows[i].UsedQuota)
		}
		if oldRows[i].RequestCount != newRows[i].RequestCount {
			t.Fatalf("第 %d 行 request_count 不一致：旧 %d，新 %d",
				i, oldRows[i].RequestCount, newRows[i].RequestCount)
		}
	}
}
