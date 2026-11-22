package partner

import (
	"errors"
	"os"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"partner/internal/model"
)

/*
验证写入路径在真实 PostgreSQL 上可用：jsonb 参数、varchar 长度、CHECK 约束
都是 PG 特有的行为，SQLite 上的「通过」不能代表线上能过。

整段包在事务里并主动回滚 —— 不往库里留任何数据。这是刻意的：
测试不该改变用户已有的商户配置，哪怕只是把同一个值再写一遍（updated_at 也会变）。
*/
func TestMerchantBrandWriteRollsBackOnRealPostgres(t *testing.T) {
	dsn := os.Getenv("PARTNER_TEST_PG_DSN")
	if dsn == "" {
		t.Skip("未设置 PARTNER_TEST_PG_DSN，跳过真库验证")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}

	errRollback := errors.New("rollback after assertions")
	txErr := db.Transaction(func(tx *gorm.DB) error {
		previousDB := model.DB
		model.DB = tx
		defer func() { model.DB = previousDB }()

		var merchantID int64
		if err := tx.Table("lc_distribution_merchants").Select("id").Order("id").Limit(1).Scan(&merchantID).Error; err != nil {
			return err
		}
		if merchantID == 0 {
			t.Skip("库里没有商户，跳过")
		}

		// 1) 写入完整的一组字段，确认 jsonb 与所有文本列都被 PG 接受
		written, err := UpdateMerchantBrand(merchantID, merchantBrandInput{
			Name:         strPtr("事务回滚测试品牌"),
			ShortName:    strPtr("测"),
			PageTitle:    strPtr("事务回滚测试品牌 · 控制台"),
			Tagline:      strPtr("这行数据会被回滚"),
			APIBaseURL:   strPtr("https://api.example.com/v1"),
			LogoURL:      strPtr("https://cdn.example.com/logo.png"),
			FaviconURL:   strPtr("https://cdn.example.com/favicon.png"),
			PrimaryColor: strPtr("#16a34a"),
			Support:      rawPtr(`{"email":"support@example.com","phone":"400-000-0000","wechat":"wechat-id","note":"工作日 9:00-21:00"}`),
			Landing:      rawPtr(`{"hero_title":"企业级大模型接入","highlights":["统一接口","按量计费"]}`),
		})
		if err != nil {
			return err
		}
		if written.Name != "事务回滚测试品牌" || written.PrimaryColor != "#16a34a" {
			t.Fatalf("写入后读回不一致：%+v", written)
		}
		if len(written.Support) == 0 || written.Support[0] != '{' {
			t.Fatalf("brand_support 回读不是对象：%s", written.Support)
		}

		// 2) 只改一个字段，其余保持上一轮的值
		patched, err := UpdateMerchantBrand(merchantID, merchantBrandInput{Tagline: strPtr("只改这一行")})
		if err != nil {
			return err
		}
		if patched.Name != "事务回滚测试品牌" || patched.LogoURL != "https://cdn.example.com/logo.png" {
			t.Fatalf("未提交的字段被覆盖：%+v", patched)
		}

		// 3) 非法值要被 PG 的 CHECK 约束或前置校验挡住，不能悄悄存进去
		if _, err := UpdateMerchantBrand(merchantID, merchantBrandInput{PrimaryColor: strPtr("red")}); err == nil {
			t.Fatal("非法品牌色应被拒绝")
		}
		if _, err := UpdateMerchantBrand(merchantID, merchantBrandInput{Name: strPtr("  ")}); err == nil {
			t.Fatal("空品牌名应被拒绝")
		}

		return errRollback
	})
	if !errors.Is(txErr, errRollback) {
		t.Fatalf("事务应以回滚结束，实际：%v", txErr)
	}

	// 4) 回滚之后，库里的数据必须和测试前完全一致
	model.DB = db
	t.Cleanup(func() { model.DB = nil })
	var merchantID int64
	if err := db.Table("lc_distribution_merchants").Select("id").Order("id").Limit(1).Scan(&merchantID).Error; err != nil {
		t.Fatal(err)
	}
	brand, err := GetMerchantBrand(merchantID)
	if err != nil {
		t.Fatal(err)
	}
	if brand.Name == "事务回滚测试品牌" || brand.Tagline == "只改这一行" {
		t.Fatalf("回滚失败，库里残留了测试数据：%+v", brand)
	}
	t.Logf("回滚后商户 %d 仍是：name=%s tagline=%q", merchantID, brand.Name, brand.Tagline)
}
