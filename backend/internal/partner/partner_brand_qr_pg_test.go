package partner

import (
	"encoding/json"
	"errors"
	"os"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"partner/internal/model"
)

/*
验证「上传客服二维码」不会把商户已经填好的客服信息抹掉。

为什么这条必须单独测：

	brand_support 对后端是**整体替换**语义 —— UpdateMerchantBrand 传什么写什么。
	mergeSupportQR 是唯一一处对它有「读-改-写」的地方，它一旦退化成
	「直接构造 {"qr_code_url": url} 提交」，商户上传一张图就会丢掉邮箱、电话、
	微信、服务时间，而界面上看不出来（上传成功、图也显示出来了）。
	这种损失是静默的，所以要用真库把它钉住。

为什么走真 PostgreSQL：

	jsonb 的序列化、键序、null 处理都是 PG 特有行为。SQLite 上「读回来是对象」
	不代表 PG 上也是。整段包在事务里并主动回滚，不往库里留任何数据。
*/
func TestMergeSupportQRKeepsExistingContacts(t *testing.T) {
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

		/* ---------- 场景 1：已有四个文字联系方式，上传二维码 ---------- */
		_, err := UpdateMerchantBrand(merchantID, merchantBrandInput{
			Support: rawPtr(`{"email":"keep@example.com","phone":"400-111-2222","wechat":"keep-wx","note":"工作日 9:00-21:00"}`),
		})
		if err != nil {
			return err
		}

		if _, err := mergeSupportQR(merchantID, "https://cdn.example.com/qr-1.png"); err != nil {
			return err
		}

		got := readSupportMap(t, merchantID)
		/*
		 * 四个原有键必须原封不动 —— 这是本测试的核心断言。
		 */
		for key, want := range map[string]string{
			"email":       "keep@example.com",
			"phone":       "400-111-2222",
			"wechat":      "keep-wx",
			"note":        "工作日 9:00-21:00",
			"qr_code_url": "https://cdn.example.com/qr-1.png",
		} {
			if got[key] != want {
				t.Fatalf("键 %q 不符：got=%v want=%v（完整 support=%v）", key, got[key], want, got)
			}
		}
		if len(got) != 5 {
			t.Fatalf("support 键数应为 5，实际 %d：%v", len(got), got)
		}

		/* ---------- 场景 2：再传一张，地址被替换而不是叠加 ---------- */
		if _, err := mergeSupportQR(merchantID, "https://cdn.example.com/qr-2.png"); err != nil {
			return err
		}
		got = readSupportMap(t, merchantID)
		if got["qr_code_url"] != "https://cdn.example.com/qr-2.png" {
			t.Fatalf("重传后二维码未更新：%v", got["qr_code_url"])
		}
		if got["email"] != "keep@example.com" {
			t.Fatalf("重传把邮箱弄丢了：%v", got)
		}
		if len(got) != 5 {
			t.Fatalf("重传不应新增键，实际 %d 个：%v", len(got), got)
		}

		/* ---------- 场景 3：原来完全没有 support，上传二维码 ---------- */
		_, err = UpdateMerchantBrand(merchantID, merchantBrandInput{Support: rawPtr(`{}`)})
		if err != nil {
			return err
		}
		if _, err := mergeSupportQR(merchantID, "https://cdn.example.com/qr-3.png"); err != nil {
			return err
		}
		got = readSupportMap(t, merchantID)
		if len(got) != 1 || got["qr_code_url"] != "https://cdn.example.com/qr-3.png" {
			t.Fatalf("空 support 上应只多出二维码一个键，实际：%v", got)
		}

		/* ---------- 场景 4：库里是 NULL 时也不能崩 ---------- */
		_, err = UpdateMerchantBrand(merchantID, merchantBrandInput{Support: rawPtr(`null`)})
		if err != nil {
			return err
		}
		if _, err := mergeSupportQR(merchantID, "https://cdn.example.com/qr-4.png"); err != nil {
			return err
		}
		got = readSupportMap(t, merchantID)
		if got["qr_code_url"] != "https://cdn.example.com/qr-4.png" {
			t.Fatalf("NULL support 上传后未写入：%v", got)
		}

		return errRollback
	})
	if !errors.Is(txErr, errRollback) {
		t.Fatalf("事务应以回滚结束，实际：%v", txErr)
	}
}

/* readSupportMap 把当前商户的 brand_support 读成 map，方便逐键断言 */
func readSupportMap(t *testing.T, merchantID int64) map[string]any {
	t.Helper()
	brand, err := GetMerchantBrand(merchantID)
	if err != nil {
		t.Fatalf("读取品牌失败：%v", err)
	}
	out := map[string]any{}
	if len(brand.Support) == 0 {
		return out
	}
	if err := json.Unmarshal(brand.Support, &out); err != nil {
		t.Fatalf("解析 brand_support 失败：%v（原始值 %s）", err, brand.Support)
	}
	return out
}
