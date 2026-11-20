package partner

import (
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"partner/internal/model"
)

func TestListPartnerUsersScopesCountSearchAndRows(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:partner_users_test?mode=memory&cache=private"), &gorm.Config{})
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
	for _, sql := range []string{
		"INSERT INTO users (id, merchant_id, username, display_name, email, phone, role, status) VALUES (1, 11, 'alice', 'Alice', 'alice@a.test', '13800138001', 1, 1)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, phone, role, status) VALUES (2, 11, 'bob', 'Bob', 'bob@a.test', '13800138002', 1, 1)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, phone, role, status) VALUES (3, 22, 'alice-other', 'Alice', 'alice@b.test', '13800138003', 1, 1)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, phone, role, status, deleted_at) VALUES (4, 11, 'deleted', 'Deleted', 'deleted@a.test', '13800138004', 1, 1, current_timestamp)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, phone, role, status) VALUES (5, 11, 'platform-admin', 'Admin', 'admin@a.test', '13800138005', 10, 1)",
	} {
		if err := db.Exec(sql).Error; err != nil {
			t.Fatal(err)
		}
	}
	previous := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = previous })

	page, err := ListPartnerUsers(11, "", 1, 1)
	if err != nil || page.Total != 2 || len(page.Items) != 1 || page.Items[0].ID != 2 {
		t.Fatalf("first page: %+v, %v", page, err)
	}
	page, err = ListPartnerUsers(11, "alice", 1, 20)
	if err != nil || page.Total != 1 || len(page.Items) != 1 || page.Items[0].ID != 1 {
		t.Fatalf("scoped search: %+v, %v", page, err)
	}
	if page.Items[0].Phone == nil || *page.Items[0].Phone != "138****8001" {
		t.Fatalf("phone not masked: %+v", page.Items[0])
	}
	page, err = ListPartnerUsers(11, "alice@b.test", 1, 20)
	if err != nil || page.Total != 0 || len(page.Items) != 0 {
		t.Fatalf("other merchant ID leaked: %+v, %v", page, err)
	}
	page, err = ListPartnerUsers(22, "alice", 1, 20)
	if err != nil || page.Total != 1 || page.Items[0].ID != 3 {
		t.Fatalf("second merchant search: %+v, %v", page, err)
	}
}
