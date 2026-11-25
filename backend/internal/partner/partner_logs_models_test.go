package partner

import (
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"partner/internal/model"
)

// 模型名清单必须是「该商户可见的、trim 过的、去重排序」的原始名。
// 特别验证两点：跨商户不泄露；带前导空格的模型名被归一化成一个选项。
func TestListPartnerLogModelsScopedAndTrimmed(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:partner_logs_models?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TABLE users (id integer primary key, username text, merchant_id integer,
		role integer, deleted_at datetime)`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TABLE logs (id integer primary key, created_at integer, user_id integer,
		type integer, model_name text, quota integer)`).Error; err != nil {
		t.Fatal(err)
	}
	for _, sql := range []string{
		"INSERT INTO users (id, username, merchant_id, role) VALUES (1, 'alice', 11, 1)",
		"INSERT INTO users (id, username, merchant_id, role) VALUES (2, 'bob', 22, 1)",
		"INSERT INTO users (id, username, merchant_id, role) VALUES (3, 'admin', 11, 10)",
		"INSERT INTO users (id, username, merchant_id, role, deleted_at) VALUES (4, 'gone', 11, 1, current_timestamp)",
	} {
		if err := db.Exec(sql).Error; err != nil {
			t.Fatal(err)
		}
	}
	now := time.Now().Unix()
	rows := []struct {
		id, userID, logType int
		model               string
	}{
		{1, 1, 2, "gpt-4o"},
		{2, 1, 2, " gpt-4o"},   // 前导空格：trim 后应与上面的合并成一个
		{3, 1, 2, "claude-3"},  //
		{4, 2, 2, "other-only"}, // 别的商户，不能出现
		{5, 3, 2, "admin-only"}, // 管理员角色，不属于 visible role
		{6, 4, 2, "deleted-only"},
		{7, 1, 3, "manage-only"}, // type 3 不在 partnerLogTypes
		{8, 1, 2, ""},            // 空名应被过滤
	}
	for _, row := range rows {
		if err := db.Exec(`INSERT INTO logs (id, created_at, user_id, type, model_name, quota)
			VALUES (?, ?, ?, ?, ?, 100)`, row.id, now, row.userID, row.logType, row.model).Error; err != nil {
			t.Fatal(err)
		}
	}
	previousDB, previousLogDB := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() { model.DB, model.LOG_DB = previousDB, previousLogDB })

	names, err := ListPartnerLogModels(11)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := []string{"claude-3", "gpt-4o"}
	if len(names) != len(want) {
		t.Fatalf("got %v, want %v", names, want)
	}
	for i := range want {
		if names[i] != want[i] {
			t.Fatalf("got %v, want %v", names, want)
		}
	}

	// 没有用户的商户应当返回空切片而不是 nil —— 前端会直接拿它当 options 用
	empty, err := ListPartnerLogModels(999)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if empty == nil || len(empty) != 0 {
		t.Fatalf("empty merchant should return empty slice, got %#v", empty)
	}

	if _, err := ListPartnerLogModels(0); err == nil {
		t.Fatal("merchant 0 must be rejected")
	}
}
