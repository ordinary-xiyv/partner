package partner

import (
	"os"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"partner/internal/model"
)

/*
只读验证：对真实数据库跑 ListPartnerLogs 的筛选/分页组合。

为什么需要这个：页面上「筛选已禁用、分页数据不更新」的现象，
用接口测不出来（伙伴后台需要 cookie 登录，不能拿用户账号去登）。
这里直接调业务函数，把「到底是后端错还是前端错」这件事钉死。

★ 只做 SELECT，不写任何数据。
*/
func TestRealDBPartnerLogPagingAndFilter(t *testing.T) {
	dsn := os.Getenv("PARTNER_VERIFY_DSN")
	if dsn == "" {
		t.Skip("未设置 PARTNER_VERIFY_DSN，跳过真实库验证")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	prevDB, prevLogDB := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() { model.DB, model.LOG_DB = prevDB, prevLogDB })

	const merchantID int64 = 1

	// 全量
	all, err := ListPartnerLogs(merchantID, PartnerLogFilter{Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("全量查询失败: %v", err)
	}
	t.Logf("全量: total=%d 本页=%d", all.Total, len(all.Items))

	if all.Total == 0 {
		t.Skip("该商户没有日志，跳过")
	}

	// 分页：第 1 页和第 2 页必须返回不同的行，且 offset 正确
	p1, err := ListPartnerLogs(merchantID, PartnerLogFilter{Page: 1, PageSize: 5})
	if err != nil {
		t.Fatal(err)
	}
	p2, err := ListPartnerLogs(merchantID, PartnerLogFilter{Page: 2, PageSize: 5})
	if err != nil {
		t.Fatal(err)
	}
	if p1.Total != p2.Total {
		t.Fatalf("分页之间 total 应一致: %d vs %d", p1.Total, p2.Total)
	}
	if len(p1.Items) > 0 && len(p2.Items) > 0 {
		if p1.Items[0].ID == p2.Items[0].ID {
			t.Fatalf("第1页和第2页首行相同(%d)，offset 失效", p1.Items[0].ID)
		}
		t.Logf("分页正确: p1[0].id=%d p2[0].id=%d", p1.Items[0].ID, p2.Items[0].ID)
	}

	// 类型筛选必须收窄
	typed, err := ListPartnerLogs(merchantID, PartnerLogFilter{Page: 1, PageSize: 5, Type: 2})
	if err != nil {
		t.Fatal(err)
	}
	if typed.Total >= all.Total && all.Total > 0 {
		t.Fatalf("type=2 筛选没有收窄: %d >= %d", typed.Total, all.Total)
	}
	t.Logf("type=2 筛选生效: %d < %d", typed.Total, all.Total)

	// 模型筛选必须收窄
	modelName := ""
	for _, it := range all.Items {
		if it.ModelName != "" {
			modelName = it.ModelName
			break
		}
	}
	if modelName != "" {
		byModel, err := ListPartnerLogs(merchantID, PartnerLogFilter{Page: 1, PageSize: 5, ModelName: modelName})
		if err != nil {
			t.Fatal(err)
		}
		if byModel.Total > all.Total {
			t.Fatalf("模型筛选反而变多: %d > %d", byModel.Total, all.Total)
		}
		t.Logf("模型 %q 筛选生效: %d <= %d", modelName, byModel.Total, all.Total)
	}

	// 时间筛选必须收窄
	if len(all.Items) > 0 {
		newest := all.Items[0].CreatedAt
		byTime, err := ListPartnerLogs(merchantID, PartnerLogFilter{
			Page: 1, PageSize: 5, StartTimestamp: newest, EndTimestamp: newest + 86400,
		})
		if err != nil {
			t.Fatal(err)
		}
		if byTime.Total > all.Total {
			t.Fatalf("时间筛选反而变多: %d > %d", byTime.Total, all.Total)
		}
		t.Logf("时间筛选生效: %d <= %d", byTime.Total, all.Total)
	}

	// 检查耗时/缓存的真实量级，确认单位判断
	if len(all.Items) > 0 {
		maxUse := 0
		withCache := 0
		for _, it := range all.Items {
			if it.UseTime > maxUse {
				maxUse = it.UseTime
			}
			if it.CacheRead > 0 {
				withCache++
			}
		}
		t.Logf("本页耗时最大值=%d（单位秒）, 有缓存的记录=%d/%d", maxUse, withCache, len(all.Items))
	}
}
