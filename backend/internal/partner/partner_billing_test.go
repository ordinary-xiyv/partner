package partner

import (
	"errors"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"partner/internal/model"
)

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
