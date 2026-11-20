package partner

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"partner/internal/model"
)

func TestPartnerLogDefaultDateUsesShanghaiToday(t *testing.T) {
	start, end := partnerLogTodayRange(time.Date(2026, 11, 18, 16, 30, 0, 0, time.UTC))
	loc := time.FixedZone("Asia/Shanghai", 8*60*60)
	wantStart := time.Date(2026, 11, 19, 0, 0, 0, 0, loc).Unix()
	if start != wantStart || end != wantStart+24*60*60-1 {
		t.Fatalf("Shanghai today range: got %d..%d, want %d..%d", start, end, wantStart, wantStart+24*60*60-1)
	}

	parse := func(query string) PartnerLogFilter {
		t.Helper()
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodGet, "/api/partner/logs"+query, nil)
		filter, err := parsePartnerLogFilter(c)
		if err != nil {
			t.Fatal(err)
		}
		return filter
	}
	if filter := parse("?page=1"); filter.StartTimestamp == 0 || filter.EndTimestamp <= filter.StartTimestamp {
		t.Fatalf("missing default today: %+v", filter)
	}
	if filter := parse("?all_history=1"); filter.StartTimestamp != 0 || filter.EndTimestamp != 0 {
		t.Fatalf("all history still date-limited: %+v", filter)
	}
}

func TestPartnerLogsScopeAndResponseFields(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:partner_logs_test?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TABLE users (id integer primary key, username text, merchant_id integer,
		role integer, deleted_at datetime)`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TABLE logs (id integer primary key, created_at integer, user_id integer,
		type integer, model_name text, prompt_tokens integer, completion_tokens integer,
		cache_read integer, use_time integer, is_stream boolean, quota integer, request_id text,
		content text, channel_id integer, token_name text, ip text)`).Error; err != nil {
		t.Fatal(err)
	}
	now := time.Now().Unix()
	for _, sql := range []string{
		"INSERT INTO users (id, username, merchant_id, role) VALUES (1, 'alice', 11, 1)",
		"INSERT INTO users (id, username, merchant_id, role) VALUES (2, 'bob', 22, 1)",
		"INSERT INTO users (id, username, merchant_id, role) VALUES (3, 'admin', 11, 10)",
		"INSERT INTO users (id, username, merchant_id, role, deleted_at) VALUES (4, 'deleted', 11, 1, current_timestamp)",
		"INSERT INTO users (id, username, merchant_id, role) VALUES (5, 'charlie', 11, 1)",
	} {
		if err := db.Exec(sql).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, row := range []struct {
		id, userID, logType int
		requestID           string
		createdAt           int64
	}{
		{1, 1, 2, "own-request", now}, {2, 1, 5, "own-error", now},
		{3, 2, 2, "other-request", now}, {4, 3, 2, "admin-request", now},
		{5, 4, 2, "deleted-request", now}, {6, 1, 3, "manage-request", now},
		{7, 1, 2, "old-request", now - 90*24*60*60},
		{8, 5, 2, "same-merchant-other-user", now},
	} {
		if err := db.Exec(`INSERT INTO logs (id, created_at, user_id, type, model_name,
			prompt_tokens, completion_tokens, cache_read, use_time, is_stream, quota, request_id,
			content, channel_id, token_name, ip)
			VALUES (?, ?, ?, ?, 'test-model', 10, 5, 2, 900, false, 100, ?,
			'private prompt', 99, 'private token', '10.0.0.1')`,
			row.id, row.createdAt, row.userID, row.logType, row.requestID).Error; err != nil {
			t.Fatal(err)
		}
	}
	previousDB, previousLogDB := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() { model.DB, model.LOG_DB = previousDB, previousLogDB })
	defaultPage, err := ListPartnerLogs(11, PartnerLogFilter{PageSize: 20})
	if err != nil || defaultPage.Total != 4 || len(defaultPage.Items) != 4 || defaultPage.Items[0].RequestID != "same-merchant-other-user" || defaultPage.Items[3].RequestID != "old-request" {
		t.Fatalf("default should include all merchant users and old logs: %+v, %v", defaultPage, err)
	}
	if defaultPage.Items[0].AmountCNY != partnerQuotaCNY(100) {
		t.Fatalf("log CNY conversion: %+v", defaultPage.Items[0])
	}

	page, err := ListPartnerLogs(11, PartnerLogFilter{StartTimestamp: now - 60, PageSize: 1})
	if err != nil || page.Total != 3 || len(page.Items) != 1 || page.Items[0].ID != 8 {
		t.Fatalf("scoped page: %+v, %v", page, err)
	}
	page, err = ListPartnerLogs(11, PartnerLogFilter{StartTimestamp: now - 60, RequestID: "other-request"})
	if err != nil || page.Total != 0 || len(page.Items) != 0 {
		t.Fatalf("other merchant request leaked: %+v, %v", page, err)
	}
	page, err = ListPartnerLogs(11, PartnerLogFilter{StartTimestamp: now - 60, UserID: 2})
	if err != nil || page.Total != 0 {
		t.Fatalf("other merchant user leaked: %+v, %v", page, err)
	}
	page, err = ListPartnerLogs(11, PartnerLogFilter{StartTimestamp: now - 60, Type: 2, UserID: 1})
	if err != nil || page.Total != 1 || page.Items[0].RequestID != "own-request" {
		t.Fatalf("type filter: %+v, %v", page, err)
	}
	encoded, err := json.Marshal(page)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"content", "channel", "token_name", "ip", "upstream_request_id"} {
		if strings.Contains(string(encoded), `"`+forbidden+`"`) {
			t.Fatalf("private field %s leaked: %s", forbidden, encoded)
		}
	}
	otherDB, err := gorm.Open(sqlite.Open("file:partner_logs_other?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	model.LOG_DB = otherDB
	if _, err := ListPartnerLogs(11, PartnerLogFilter{}); err == nil {
		t.Fatal("separate log database must fail closed")
	}
}
