package partner

import (
	"testing"
	"time"

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

/*
 * ★ 全库排序 —— 本次修复的核心。
 *
 * 修复前的样子：三个用量列用 antd 的 sorter 比较函数排序，只排当前页那几条。
 * 翻页后又是新一批数据各自排一遍，「全站消耗最高的客户」永远排不出来。
 *
 * 这里造的场景就是那个 bug 的最小复现：5 个客户，消耗最高的那个 id 最小、
 * 但按 id DESC 排在最后一页。如果排序只在页内做，第 1 页根本看不到它。
 *
 * 断言方式是「直接取 page_size=2 的第 1 页，第一名必须是消耗最高的人」——
 * 只要 ORDER BY 没作用在全量结果集上，这条就一定失败。
 */
func TestListPartnerUsersSortByUsageAcrossAllPages(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:partner_users_sort_test?mode=memory&cache=private"), &gorm.Config{})
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

	/*
	 * 计费口径：消费 2 / 预扣 7 / 补扣 8 加，退款 6 减。
	 *
	 * 消耗分布特意做成「与 id 顺序相反」：
	 *   id=1 消耗最高（400），id=5 消耗最低（100）
	 * 这样「按 id DESC 的默认顺序」和「按消耗 DESC」结果完全不同，
	 * 一旦排序没生效，两者不会碰巧一样而让测试假通过。
	 */
	for _, sql := range []string{
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (1, 11, 'u1', 'U1', 'u1@a.test', 1, 1)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (2, 11, 'u2', 'U2', 'u2@a.test', 1, 1)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (3, 11, 'u3', 'U3', 'u3@a.test', 1, 1)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (4, 11, 'u4', 'U4', 'u4@a.test', 1, 1)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (5, 11, 'u5', 'U5', 'u5@a.test', 1, 1)",
		// id=6 本月一条日志都没有：必须显示「没有数据」，且排序时沉底
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (6, 11, 'u6', 'U6', 'u6@a.test', 1, 1)",
	} {
		if err := db.Exec(sql).Error; err != nil {
			t.Fatal(err)
		}
	}

	if err := db.Exec(`CREATE TABLE logs (
		id integer primary key, user_id integer, created_at integer, type integer, quota integer
	)`).Error; err != nil {
		t.Fatal(err)
	}
	// 全部落在本月内。partnerBillingDates 默认区间是「本月 1 号 ~ 今天」。
	now := time.Now().Unix()
	for _, sql := range []string{
		// u1: 消费 300 + 预扣 200 + 补扣 -100 = 400（补扣是正的加项，这里用退款验减法）
		"INSERT INTO logs (user_id, created_at, type, quota) VALUES (1, " + itoa(now) + ", 2, 300)",
		"INSERT INTO logs (user_id, created_at, type, quota) VALUES (1, " + itoa(now) + ", 7, 200)",
		"INSERT INTO logs (user_id, created_at, type, quota) VALUES (1, " + itoa(now) + ", 6, 100)",
		// u2: 350
		"INSERT INTO logs (user_id, created_at, type, quota) VALUES (2, " + itoa(now) + ", 2, 350)",
		// u3: 300
		"INSERT INTO logs (user_id, created_at, type, quota) VALUES (3, " + itoa(now) + ", 2, 300)",
		// u4: 200
		"INSERT INTO logs (user_id, created_at, type, quota) VALUES (4, " + itoa(now) + ", 2, 200)",
		// u5: 100
		"INSERT INTO logs (user_id, created_at, type, quota) VALUES (5, " + itoa(now) + ", 2, 100)",
	} {
		if err := db.Exec(sql).Error; err != nil {
			t.Fatal(err)
		}
	}

	prevDB, prevLogDB := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() { model.DB, model.LOG_DB = prevDB, prevLogDB })

	// 第 1 页只要 2 条：消耗最高的 u1 必须在里面，且排第一。
	page, err := ListPartnerUsersWith(PartnerUserQuery{
		MerchantID: 11, Page: 1, PageSize: 2, Sort: "used_quota", Order: "desc",
	})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 6 {
		t.Fatalf("total=%d，期望 6（排序不该改变总数）", page.Total)
	}
	if len(page.Items) != 2 {
		t.Fatalf("第 1 页 %d 条，期望 2 条", len(page.Items))
	}
	if page.Items[0].ID != 1 {
		t.Fatalf("按消耗降序第 1 名是 id=%d，期望 id=1（消耗最高的客户必须在第一页第一行）",
			page.Items[0].ID)
	}
	if page.Items[0].UsedQuota == nil || *page.Items[0].UsedQuota != 400 {
		t.Fatalf("id=1 消耗 = %v，期望 400（消费300+预扣200-退款100）", page.Items[0].UsedQuota)
	}
	if page.Items[1].ID != 2 {
		t.Fatalf("第 2 名是 id=%d，期望 id=2", page.Items[1].ID)
	}

	// 消耗金额由 quota 换算，两个字段不能各算一套。
	if page.Items[0].UsedAmountCNY == nil {
		t.Fatal("有消耗的行必须带 used_amount_cny")
	}
	if got, want := *page.Items[0].UsedAmountCNY, partnerQuotaCNY(400); got != want {
		t.Fatalf("金额 = %v，期望 %v", got, want)
	}

	// 升序：消耗最低的 u5 排第一，没有数据的 u6 沉底而不是冒充「0 消耗」排最前。
	asc, err := ListPartnerUsersWith(PartnerUserQuery{
		MerchantID: 11, Page: 1, PageSize: 6, Sort: "used_quota", Order: "asc",
	})
	if err != nil {
		t.Fatal(err)
	}
	if asc.Items[0].ID != 5 {
		t.Fatalf("升序第 1 名是 id=%d，期望 id=5（消耗 100 最低）", asc.Items[0].ID)
	}
	if asc.Items[len(asc.Items)-1].ID != 6 {
		t.Fatalf("升序最后一名是 id=%d，期望 id=6（本月无数据，应沉底）",
			asc.Items[len(asc.Items)-1].ID)
	}
	if asc.Items[len(asc.Items)-1].UsedQuota != nil {
		t.Fatal("本月无日志的客户，used_quota 必须是 null 而不是 0")
	}

	// 请求数排序：u1 有 2 条（消费+预扣），其余各 1 条。退款不算请求数。
	byReq, err := ListPartnerUsersWith(PartnerUserQuery{
		MerchantID: 11, Page: 1, PageSize: 6, Sort: "request_count", Order: "desc",
	})
	if err != nil {
		t.Fatal(err)
	}
	if byReq.Items[0].ID != 1 || byReq.Items[0].RequestCount == nil || *byReq.Items[0].RequestCount != 2 {
		t.Fatalf("按请求数降序第 1 名 id=%d count=%v，期望 id=1 count=2",
			byReq.Items[0].ID, byReq.Items[0].RequestCount)
	}

	// 默认（不传 sort）仍然是 id DESC，翻页稳定性不变。
	def, err := ListPartnerUsers(11, "", 0, 1, 6)
	if err != nil {
		t.Fatal(err)
	}
	if def.Items[0].ID != 6 {
		t.Fatalf("默认顺序第 1 条是 id=%d，期望 id=6（保持原来的 id DESC）", def.Items[0].ID)
	}

	// 非白名单列必须被忽略，回落 id 排序 —— 绝不能拼进 ORDER BY。
	bad, err := ListPartnerUsersWith(PartnerUserQuery{
		MerchantID: 11, Page: 1, PageSize: 6, Sort: "password; DROP TABLE users", Order: "desc",
	})
	if err != nil {
		t.Fatalf("非法排序列应当被忽略而不是报错: %v", err)
	}
	if bad.Items[0].ID != 6 {
		t.Fatalf("非法排序列应回落 id DESC，第 1 条是 id=%d", bad.Items[0].ID)
	}
}

/*
 * 筛选 + 排序 + 分页三者叠加。
 *
 * 这条守的是「ORDER BY 必须在 WHERE 之后、OFFSET 之前生效」：
 * 只看启用的客户并按其消耗排序，第 2 页的第一条应当是启用集合里第 3 高的消耗。
 */
func TestListPartnerUsersSortWithStatusFilterAndPaging(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:partner_users_sort_filter_test?mode=memory&cache=private"), &gorm.Config{})
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
		id integer primary key, user_id integer, created_at integer, type integer, quota integer
	)`).Error; err != nil {
		t.Fatal(err)
	}
	now := time.Now().Unix()
	rows := []string{
		// 启用，消耗 300 / 200 / 100；另有一个禁用但消耗 999（不该进启用集合）
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (1, 11, 'a', 'A', 'a@a.test', 1, 1)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (2, 11, 'b', 'B', 'b@a.test', 1, 1)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (3, 11, 'c', 'C', 'c@a.test', 1, 1)",
		"INSERT INTO users (id, merchant_id, username, display_name, email, role, status) VALUES (4, 11, 'd', 'D', 'd@a.test', 1, 2)",
		"INSERT INTO logs (user_id, created_at, type, quota) VALUES (1, " + itoa(now) + ", 2, 300)",
		"INSERT INTO logs (user_id, created_at, type, quota) VALUES (2, " + itoa(now) + ", 2, 200)",
		"INSERT INTO logs (user_id, created_at, type, quota) VALUES (3, " + itoa(now) + ", 2, 100)",
		"INSERT INTO logs (user_id, created_at, type, quota) VALUES (4, " + itoa(now) + ", 2, 999)",
	}
	for _, sql := range rows {
		if err := db.Exec(sql).Error; err != nil {
			t.Fatal(err)
		}
	}
	prevDB, prevLogDB := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() { model.DB, model.LOG_DB = prevDB, prevLogDB })

	// 只看启用（3 个），每页 2 条，按消耗降序：第 2 页只剩第 3 名 id=3。
	p2, err := ListPartnerUsersWith(PartnerUserQuery{
		MerchantID: 11, Status: partnerUserStatusEnabled, Page: 2, PageSize: 2,
		Sort: "used_quota", Order: "desc",
	})
	if err != nil {
		t.Fatal(err)
	}
	if p2.Total != 3 {
		t.Fatalf("筛启用 total=%d，期望 3", p2.Total)
	}
	if len(p2.Items) != 1 || p2.Items[0].ID != 3 {
		t.Fatalf("筛启用按消耗降序第 2 页 = %+v，期望只有 id=3", p2.Items)
	}
	if p2.Items[0].UsedQuota == nil || *p2.Items[0].UsedQuota != 100 {
		t.Fatalf("id=3 消耗 = %v，期望 100", p2.Items[0].UsedQuota)
	}
}
