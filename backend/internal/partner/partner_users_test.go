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

	page, err := ListPartnerUsers(11, "", 0, 1, 1)
	if err != nil || page.Total != 2 || len(page.Items) != 1 || page.Items[0].ID != 2 {
		t.Fatalf("first page: %+v, %v", page, err)
	}
	page, err = ListPartnerUsers(11, "alice", 0, 1, 20)
	if err != nil || page.Total != 1 || len(page.Items) != 1 || page.Items[0].ID != 1 {
		t.Fatalf("scoped search: %+v, %v", page, err)
	}
	if page.Items[0].Phone == nil || *page.Items[0].Phone != "138****8001" {
		t.Fatalf("phone not masked: %+v", page.Items[0])
	}
	page, err = ListPartnerUsers(11, "alice@b.test", 0, 1, 20)
	if err != nil || page.Total != 0 || len(page.Items) != 0 {
		t.Fatalf("other merchant ID leaked: %+v, %v", page, err)
	}
	page, err = ListPartnerUsers(22, "alice", 0, 1, 20)
	if err != nil || page.Total != 1 || page.Items[0].ID != 3 {
		t.Fatalf("second merchant search: %+v, %v", page, err)
	}
}

/*
 * 状态筛选的核心断言：**Total 必须跟着筛选一起变**。
 *
 * 这就是那个 bug 的本质 —— 原来筛选只作用于当前页内存里的 10 条，
 * 后端返回的 total 是未过滤的全量，于是「表格 2 条 / 共 137 个客户」。
 * 所以这里不能只断言 Items 长度，必须断言 Total。
 */
func TestListPartnerUsersFilterByStatus(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:partner_users_status_test?mode=memory&cache=private"), &gorm.Config{})
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
		// 商户 11：3 个启用 + 2 个禁用
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (1, 11, 'u1', 'U1', 'u1@a.test', 1, 1)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (2, 11, 'u2', 'U2', 'u2@a.test', 1, 1)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (3, 11, 'u3', 'U3', 'u3@a.test', 1, 1)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (4, 11, 'u4', 'U4', 'u4@a.test', 1, 2)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (5, 11, 'u5', 'U5', 'u5@a.test', 1, 2)",
		// 商户 22 的禁用用户：不该出现在商户 11 的任何筛选结果里
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (6, 22, 'x1', 'X1', 'x1@b.test', 1, 2)",
		// 已删除 + 平台管理员：都不该被数进去
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status, deleted_at) VALUES (7, 11, 'del', 'Del', 'del@a.test', 1, 2, current_timestamp)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (8, 11, 'admin', 'Admin', 'admin@a.test', 10, 2)",
	} {
		if err := db.Exec(sql).Error; err != nil {
			t.Fatal(err)
		}
	}
	previous := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = previous })

	cases := []struct {
		name      string
		status    int
		wantTotal int64
		wantIDs   []int64
	}{
		{"全部", 0, 5, []int64{5, 4, 3, 2, 1}},
		{"只看启用", partnerUserStatusEnabled, 3, []int64{3, 2, 1}},
		{"只看禁用", partnerUserStatusDisabled, 2, []int64{5, 4}},
	}
	for _, tc := range cases {
		page, err := ListPartnerUsers(11, "", tc.status, 1, 20)
		if err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		if page.Total != tc.wantTotal {
			t.Fatalf("%s: total=%d，期望 %d（total 不跟着筛选变就是这个 bug）",
				tc.name, page.Total, tc.wantTotal)
		}
		if len(page.Items) != len(tc.wantIDs) {
			t.Fatalf("%s: 返回 %d 条，期望 %d 条", tc.name, len(page.Items), len(tc.wantIDs))
		}
		for i, wantID := range tc.wantIDs {
			if page.Items[i].ID != wantID {
				t.Fatalf("%s: 第 %d 条是 id=%d，期望 id=%d", tc.name, i, page.Items[i].ID, wantID)
			}
		}
	}
}

/*
 * 筛选 + 分页组合：禁用用户只有 2 个，第 2 页（每页 1 条）应该拿到 id=4。
 *
 * 这条守的是「offset 必须基于筛选后的结果集」—— 如果 Where 加在
 * Offset 之后的位置，分页会跳过错误的记录数。
 */
func TestListPartnerUsersFilterByStatusWithPaging(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:partner_users_status_page_test?mode=memory&cache=private"), &gorm.Config{})
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
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (1, 11, 'u1', 'U1', 'u1@a.test', 1, 1)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (2, 11, 'u2', 'U2', 'u2@a.test', 1, 1)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (3, 11, 'u3', 'U3', 'u3@a.test', 1, 2)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (4, 11, 'u4', 'U4', 'u4@a.test', 1, 2)",
	} {
		if err := db.Exec(sql).Error; err != nil {
			t.Fatal(err)
		}
	}
	previous := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = previous })

	page1, err := ListPartnerUsers(11, "", partnerUserStatusDisabled, 1, 1)
	if err != nil || page1.Total != 2 || len(page1.Items) != 1 || page1.Items[0].ID != 4 {
		t.Fatalf("禁用第 1 页: %+v, %v", page1, err)
	}
	page2, err := ListPartnerUsers(11, "", partnerUserStatusDisabled, 2, 1)
	if err != nil || page2.Total != 2 || len(page2.Items) != 1 || page2.Items[0].ID != 3 {
		t.Fatalf("禁用第 2 页: %+v, %v", page2, err)
	}
}

func TestValidPartnerUserStatus(t *testing.T) {
	for _, ok := range []int{0, partnerUserStatusEnabled, partnerUserStatusDisabled} {
		if !validPartnerUserStatus(ok) {
			t.Fatalf("status=%d 应该合法", ok)
		}
	}
	// -1 / 3 / 99 都非法。API 层要靠它返回 400，不能静默当「全部」。
	for _, bad := range []int{-1, 3, 99} {
		if validPartnerUserStatus(bad) {
			t.Fatalf("status=%d 不该通过校验", bad)
		}
	}
}
