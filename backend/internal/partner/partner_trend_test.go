package partner

import (
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"partner/internal/model"
)

func TestPartnerDailyTrendScopesUsersAndFillsFourteenDays(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:partner_trend_test?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TABLE users (id integer primary key, merchant_id integer, role integer, deleted_at datetime)`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TABLE lc_log_daily_summaries (summary_date text, user_id integer,
		prompt_tokens_sum integer, completion_tokens_sum integer, request_count integer, quota_sum integer)`).Error; err != nil {
		t.Fatal(err)
	}
	for _, sql := range []string{
		"INSERT INTO users (id, merchant_id, role) VALUES (1, 11, 1)",
		"INSERT INTO users (id, merchant_id, role) VALUES (2, 22, 1)",
		"INSERT INTO users (id, merchant_id, role) VALUES (3, 11, 10)",
		"INSERT INTO users (id, merchant_id, role, deleted_at) VALUES (4, 11, 1, current_timestamp)",
	} {
		if err := db.Exec(sql).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, row := range []struct {
		date                                     string
		userID, prompt, completion, count, quota int
	}{
		{"2026-11-05", 1, 3, 2, 1, 50},
		{"2026-11-18", 1, 10, 5, 1, 100},
		{"2026-11-18", 1, 4, 6, 2, 80},
		{"2026-11-18", 2, 999, 999, 99, 9999},
		{"2026-11-18", 3, 999, 999, 99, 9999},
		{"2026-11-18", 4, 999, 999, 99, 9999},
		{"2026-11-19", 1, 999, 999, 99, 9999},
		{"2026-11-04", 1, 999, 999, 99, 9999},
	} {
		if err := db.Exec(`INSERT INTO lc_log_daily_summaries
			(summary_date, user_id, prompt_tokens_sum, completion_tokens_sum, request_count, quota_sum)
			VALUES (?, ?, ?, ?, ?, ?)`, row.date, row.userID, row.prompt, row.completion, row.count, row.quota).Error; err != nil {
			t.Fatal(err)
		}
	}
	previousDB, previousLogDB := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() { model.DB, model.LOG_DB = previousDB, previousLogDB })

	now := time.Date(2026, 11, 19, 12, 0, 0, 0, time.FixedZone("CST", 8*3600))
	points, err := QueryPartnerDailyTrend(11, now)
	if err != nil {
		t.Fatal(err)
	}
	if len(points) != 14 || points[0].SummaryDate != "2026-11-05" || points[13].SummaryDate != "2026-11-18" {
		t.Fatalf("date range: %+v", points)
	}
	if points[0].RequestCount != 1 || points[0].Quota != 50 || points[1].RequestCount != 0 {
		t.Fatalf("early points: %+v", points[:2])
	}
	if points[13].PromptTokens != 14 || points[13].CompletionTokens != 11 || points[13].RequestCount != 3 || points[13].Quota != 180 {
		t.Fatalf("tenant totals leaked or incomplete: %+v", points[13])
	}
	if points[13].AmountCNY != partnerQuotaCNY(180) || points[1].AmountCNY != 0 {
		t.Fatalf("trend CNY conversion: %+v", points[13])
	}
	model.LOG_DB, err = gorm.Open(sqlite.Open("file:partner_trend_separate?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := QueryPartnerDailyTrend(11, now); err == nil {
		t.Fatal("separate log database must fail closed")
	}
}
