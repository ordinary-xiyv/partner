package partner

import (
	"errors"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"partner/internal/model"
)

/*
 * ★ 两段数据源（日汇总表 + logs 现算）合并正确性。
 *
 * billing/summary 已改为：完结天读 lc_log_daily_summaries（主站凌晨 2 点
 * 维护的按日汇总，线上 1500 万行 logs 现算 4.4~4.9 秒的修复），缺口天现算。
 * 这个测试守住三件事：
 *  1. 汇总段 + 现算段的金额/请求数必须等于全区间现算（口径不漂、不重不漏）
 *  2. 同一用户在两段都有数据时要合并成一行（不能出现重复 user）
 *  3. 覆盖有「中间缺口」时，缺口天必须现算补上（宁多算不少算）
 */
func TestPartnerBillingSummaryMergesDailySummaryAndLiveLogs(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:partner_billing_merge?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TABLE users (id integer primary key, username text, merchant_id integer, role integer, deleted_at datetime)`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TABLE logs (id integer primary key, user_id integer, type integer, created_at integer, quota integer)`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TABLE lc_log_daily_summaries (id integer primary key, summary_date datetime,
		user_id integer, username text, model_name text, channel_id integer, prompt_tokens_sum integer,
		completion_tokens_sum integer, cache_read_sum integer, request_count integer, quota_sum integer)`).Error; err != nil {
		t.Fatal(err)
	}
	for _, sql := range []string{
		"INSERT INTO users (id, username, merchant_id, role) VALUES (1, 'alice', 11, 1)",
		"INSERT INTO users (id, username, merchant_id, role) VALUES (2, 'bob', 11, 1)",
		"INSERT INTO users (id, username, merchant_id, role) VALUES (3, 'mallory', 22, 1)",
	} {
		if err := db.Exec(sql).Error; err != nil {
			t.Fatal(err)
		}
	}

	loc := time.FixedZone("CST", 8*3600)
	stamp := func(day, hour int) int64 { return time.Date(2026, 11, day, hour, 0, 0, 0, loc).Unix() }
	dayTS := func(day int) time.Time { return time.Date(2026, 11, day, 0, 0, 0, 0, loc) }

	/*
	 * 区间 2026-11-01 ~ 2026-11-05（now = 11-05 18:00）。
	 * 汇总表覆盖 11-01、11-02、11-03（11-04 缺 —— 模拟凌晨任务失败），11-05 是今天。
	 * 用户 1 在汇总段和现算段都有数据（验证合并）；用户 2 只在现算段；用户 3 是别家商户。
	 */
	sumRows := []struct {
		day    int
		userID int64
		req    int64
		quota  int64
	}{
		{1, 1, 2, 100},
		{1, 1, 1, 20}, // 同日多行（不同模型/渠道），验证跨行 SUM
		{2, 1, 3, 60},
		{3, 1, 1, 40},
		{1, 3, 5, 9999}, // 别家商户，绝不能混进来
	}
	for _, r := range sumRows {
		if err := db.Exec(`INSERT INTO lc_log_daily_summaries
			(summary_date, user_id, username, model_name, channel_id, prompt_tokens_sum,
			 completion_tokens_sum, cache_read_sum, request_count, quota_sum)
			VALUES (?, ?, 'alice', 'm', 0, 0, 0, 0, ?, ?)`,
			dayTS(r.day), r.userID, r.req, r.quota).Error; err != nil {
			t.Fatal(err)
		}
	}
	// 现算段：11-04（缺口天）用户 1 退款 10（quota 口径 -10、请求数 +0）；
	// 11-05（今天）用户 1 消费 30（+1 请求）、用户 2 消费 200（+1 请求）。
	liveLogs := []struct {
		day, hour int
		userID    int64
		typ       int
		quota     int64
	}{
		{4, 10, 1, model.LogTypeRefund, 10},
		{5, 9, 1, model.LogTypeConsume, 30},
		{5, 9, 2, model.LogTypeConsume, 200},
		{5, 9, 3, model.LogTypeConsume, 9999}, // 别家商户
	}
	for i, l := range liveLogs {
		if err := db.Exec("INSERT INTO logs (id, user_id, type, created_at, quota) VALUES (?, ?, ?, ?, ?)",
			i+1, l.userID, l.typ, stamp(l.day, l.hour), l.quota).Error; err != nil {
			t.Fatal(err)
		}
	}

	previousDB, previousLogDB := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() { model.DB, model.LOG_DB = previousDB, previousLogDB })

	now := time.Date(2026, 11, 5, 18, 0, 0, 0, loc)
	result, err := QueryPartnerBillingSummary(11, "2026-11-01", "2026-11-05", 1, 10, now)
	if err != nil {
		t.Fatal(err)
	}

	// 期望：用户 1 = 汇总(100+20+60+40=220, 请求2+1+3+1=7) + 现算(-10+30=20, 请求1) = 240 / 8
	//       用户 2 = 200 / 1
	// 总额 = 440，请求数 = 9，总用户 = 2（用户 3 是商户 22 的，两段都必须被商户过滤挡住）
	if result.TotalUsers != 2 {
		t.Fatalf("总用户期望 2（商户 11 的 1 和 2），实际 %d：%+v", result.TotalUsers, result)
	}
	if result.TotalQuota != 440 {
		t.Fatalf("总额期望 440（汇总 220 + 退款-10 + 今天 30+200），实际 %d", result.TotalQuota)
	}
	if result.TotalRequests != 9 {
		t.Fatalf("请求数期望 9（汇总 7 + 今天 2），实际 %d", result.TotalRequests)
	}
	// 排序 quota DESC：用户 1(240) 在前，用户 2(200) 在后
	if len(result.Items) != 2 || result.Items[0].UserID != 1 || result.Items[1].UserID != 2 {
		t.Fatalf("行序期望 [1(240), 2(200)]，实际 %+v", result.Items)
	}
	if result.Items[0].Quota != 240 || result.Items[0].RequestCount != 8 {
		t.Fatalf("用户 1 期望 240/8，实际 %d/%d", result.Items[0].Quota, result.Items[0].RequestCount)
	}
	if result.Items[1].Quota != 200 || result.Items[1].RequestCount != 1 {
		t.Fatalf("用户 2 期望 200/1，实际 %d/%d", result.Items[1].Quota, result.Items[1].RequestCount)
	}
}

func TestPartnerBillingSummaryMerchantScopeAndNetQuota(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:partner_billing_test?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TABLE users (id integer primary key, username text, merchant_id integer, role integer, deleted_at datetime)`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TABLE logs (id integer primary key, user_id integer, type integer, created_at integer, quota integer)`).Error; err != nil {
		t.Fatal(err)
	}
	// 新查询先探 lc_log_daily_summaries 的覆盖范围；空表 = 无覆盖 = 全部现算，
	// 与旧行为等价（这条测试原本验证的口径不变）。
	if err := db.Exec(`CREATE TABLE lc_log_daily_summaries (id integer primary key, summary_date datetime,
		user_id integer, username text, model_name text, channel_id integer, prompt_tokens_sum integer,
		completion_tokens_sum integer, cache_read_sum integer, request_count integer, quota_sum integer)`).Error; err != nil {
		t.Fatal(err)
	}
	for _, sql := range []string{
		"INSERT INTO users (id, username, merchant_id, role) VALUES (1, 'alice', 11, 1)",
		"INSERT INTO users (id, username, merchant_id, role, deleted_at) VALUES (2, 'deleted', 11, 1, current_timestamp)",
		"INSERT INTO users (id, username, merchant_id, role) VALUES (3, 'other', 22, 1)",
		"INSERT INTO users (id, username, merchant_id, role) VALUES (4, 'admin', 11, 10)",
	} {
		if err := db.Exec(sql).Error; err != nil {
			t.Fatal(err)
		}
	}
	loc := time.FixedZone("CST", 8*3600)
	stamp := func(day int) int64 { return time.Date(2026, 11, day, 12, 0, 0, 0, loc).Unix() }
	for _, row := range []struct{ userID, logType, day, quota int }{
		{1, 2, 5, 100}, {1, 7, 5, 50}, {1, 8, 5, 25}, {1, 6, 5, 40},
		{1, 2, 19, 30}, {1, 5, 5, 500}, {2, 2, 5, 200},
		{3, 2, 5, 9999}, {4, 2, 5, 9999}, {1, 2, 1, 10},
	} {
		if err := db.Exec("INSERT INTO logs (user_id, type, created_at, quota) VALUES (?, ?, ?, ?)",
			row.userID, row.logType, stamp(row.day), row.quota).Error; err != nil {
			t.Fatal(err)
		}
	}
	previousDB, previousLogDB := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() { model.DB, model.LOG_DB = previousDB, previousLogDB })

	now := time.Date(2026, 11, 19, 18, 0, 0, 0, loc)
	result, err := QueryPartnerBillingSummary(11, "", "", 1, 1, now)
	if err != nil {
		t.Fatal(err)
	}
	if result.StartDate != "2026-11-01" || result.EndDate != "2026-11-19" || result.TotalUsers != 2 || result.TotalRequests != 5 || result.TotalQuota != 375 {
		t.Fatalf("default totals: %+v", result)
	}
	if len(result.Items) != 1 || result.Items[0].UserID != 2 || !result.Items[0].Deleted || result.Items[0].Quota != 200 {
		t.Fatalf("first page: %+v", result.Items)
	}
	if result.TotalAmountUSD != float64(375)/result.QuotaPerUnit {
		t.Fatalf("USD conversion: %+v", result)
	}
	if result.TotalAmountCNY != partnerQuotaCNY(375) || result.Items[0].AmountCNY != partnerQuotaCNY(200) {
		t.Fatalf("CNY conversion: %+v", result)
	}
	result, err = QueryPartnerBillingSummary(11, "2026-11-05", "2026-11-05", 2, 1, now)
	if err != nil || result.TotalQuota != 335 || len(result.Items) != 1 || result.Items[0].UserID != 1 || result.Items[0].Quota != 135 {
		t.Fatalf("filtered page: %+v, %v", result, err)
	}
	if _, err := QueryPartnerBillingSummary(11, "2026-11-05", "2026-11-20", 1, 20, now); !errors.Is(err, errInvalidPartnerBillingRange) {
		t.Fatalf("future range allowed: %v", err)
	}
	otherDB, err := gorm.Open(sqlite.Open("file:partner_billing_separate?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	model.LOG_DB = otherDB
	if _, err := QueryPartnerBillingSummary(11, "", "", 1, 20, now); !errors.Is(err, errPartnerBillingSeparateDB) {
		t.Fatalf("separate DB allowed: %v", err)
	}
}
