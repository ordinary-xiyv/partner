package partner

import (
	"os"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"partner/internal/model"
)

/*
只读验证：对真实数据库跑 ListPartnerUsers 的状态筛选。

为什么需要这个：那个 bug 的本质是「表格里的条数和 total 对不上」，
单测用的是 sqlite 内存库，样本是我自己造的。这里拿真实数据再确认一遍
—— 真实库的 status 分布是 105 启用 / 2 禁用，正好能把「筛禁用时
total 必须变成 2 而不是 107」这件事钉死。

★ 只做 SELECT，不写任何数据。
*/
func TestRealDBPartnerUsersStatusFilter(t *testing.T) {
	dsn := os.Getenv("PARTNER_VERIFY_DSN")
	if dsn == "" {
		t.Skip("未设置 PARTNER_VERIFY_DSN，跳过真实库验证")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	prevDB := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = prevDB })

	const merchantID int64 = 1

	all, err := ListPartnerUsers(merchantID, "", 0, 1, 10)
	if err != nil {
		t.Fatalf("全量查询失败: %v", err)
	}
	enabled, err := ListPartnerUsers(merchantID, "", partnerUserStatusEnabled, 1, 10)
	if err != nil {
		t.Fatalf("筛启用失败: %v", err)
	}
	disabled, err := ListPartnerUsers(merchantID, "", partnerUserStatusDisabled, 1, 10)
	if err != nil {
		t.Fatalf("筛禁用失败: %v", err)
	}

	t.Logf("全量 total=%d（本页 %d）", all.Total, len(all.Items))
	t.Logf("启用 total=%d", enabled.Total)
	t.Logf("禁用 total=%d", disabled.Total)

	if all.Total == 0 {
		t.Skip("该商户没有用户，跳过")
	}

	// 核心断言：两个子集相加必须等于全量。不等就说明 Where 没加对，
	// 或者 Count 和 Find 用了不同的条件。
	if enabled.Total+disabled.Total != all.Total {
		t.Fatalf("启用(%d) + 禁用(%d) = %d，但全量是 %d —— 筛选条件不一致",
			enabled.Total, disabled.Total, enabled.Total+disabled.Total, all.Total)
	}
	if enabled.Total == all.Total {
		t.Fatalf("筛启用后 total 仍是全量 %d —— status 条件没生效", all.Total)
	}

	// 行内容也要对：筛出来的每一条 status 都必须是期望值。
	for _, u := range enabled.Items {
		if u.Status != partnerUserStatusEnabled {
			t.Fatalf("筛启用却拿到 status=%d 的行 (id=%d)", u.Status, u.ID)
		}
	}
	for _, u := range disabled.Items {
		if u.Status != partnerUserStatusDisabled {
			t.Fatalf("筛禁用却拿到 status=%d 的行 (id=%d)", u.Status, u.ID)
		}
	}

	// 空关键字 + 状态 + 分页：禁用只有 2 个，第 2 页（每页 1 条）不能为空。
	if disabled.Total >= 2 {
		p2, err := ListPartnerUsers(merchantID, "", partnerUserStatusDisabled, 2, 1)
		if err != nil {
			t.Fatalf("禁用第 2 页失败: %v", err)
		}
		if len(p2.Items) != 1 {
			t.Fatalf("禁用第 2 页应有 1 条，实际 %d 条", len(p2.Items))
		}
		if p2.Items[0].Status != partnerUserStatusDisabled {
			t.Fatalf("禁用第 2 页拿到 status=%d", p2.Items[0].Status)
		}
	}
}
