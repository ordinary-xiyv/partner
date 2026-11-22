package partner

import (
	"encoding/json"
	"os"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"partner/internal/model"
)

/*
对着真实 PostgreSQL 验证 jsonb 扫描。

SQLite 会把 jsonb 列扫成 string，PostgreSQL 扫成 []byte —— brandJSON 的 Scan
两种都接；但只有连真库才能证明这一点。这个测试不强求执行：设置
PARTNER_TEST_PG_DSN 才会跑，默认跳过，避免 CI 或本地没库时红一片。

只读，不写入任何数据。
*/
func TestMerchantBrandReadsRealPostgres(t *testing.T) {
	dsn := os.Getenv("PARTNER_TEST_PG_DSN")
	if dsn == "" {
		t.Skip("未设置 PARTNER_TEST_PG_DSN，跳过真库验证")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	previousDB := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })

	var ids []int64
	if err := db.Table("lc_distribution_merchants").Pluck("id", &ids).Error; err != nil {
		t.Fatal(err)
	}
	if len(ids) == 0 {
		t.Skip("库里没有商户，跳过")
	}
	for _, id := range ids {
		brand, err := GetMerchantBrand(id)
		if err != nil {
			t.Fatalf("商户 %d 读取失败：%v", id, err)
		}
		// 扫描成功还不够，必须能当对象解析 —— 否则前端拿到的是一串字符串
		if len(brand.Support) > 0 {
			var probe map[string]any
			if err := json.Unmarshal(brand.Support, &probe); err != nil {
				t.Fatalf("商户 %d 的 brand_support 不是合法 JSON 对象：%v (%s)", id, err, brand.Support)
			}
		}
		if brand.Name == "" || brand.PrimaryColor == "" {
			t.Fatalf("商户 %d 的兜底值缺失：name=%q color=%q", id, brand.Name, brand.PrimaryColor)
		}
		t.Logf("商户 %d: name=%s color=%s support=%s", id, brand.Name, brand.PrimaryColor, brand.Support)
	}
}
