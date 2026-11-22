package partner

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/png"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/volcengine/ve-tos-golang-sdk/v2/tos"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"partner/internal/model"
)

/*
真实上传全流程验证：走的就是 uploadBrandImage 这条线上路径。

默认跳过，需要同时设 PARTNER_TEST_PG_DSN 和 PARTNER_TEST_UPLOAD_LIVE=1。

它会真的做两件有副作用的事，所以两条都要能收回：

	· 往对象存储写一个文件 → 从返回值里反推对象键，用完立刻删
	· 改商户的 brand_* 列   → 整段包在事务里并主动回滚，库里不留痕迹

这两条约束是刻意的 —— 无人值守的测试不该在用户的桶里或库里留下东西。
*/
func TestBrandUploadLive(t *testing.T) {
	if os.Getenv("PARTNER_TEST_UPLOAD_LIVE") != "1" {
		t.Skip("未设置 PARTNER_TEST_UPLOAD_LIVE=1，跳过真实上传")
	}
	dsn := os.Getenv("PARTNER_TEST_PG_DSN")
	if dsn == "" {
		t.Skip("未设置 PARTNER_TEST_PG_DSN，跳过真库验证")
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := func() (objectStorageConfig, error) {
		previousDB := model.DB
		model.DB = db
		defer func() { model.DB = previousDB }()
		return loadObjectStorageConfig()
	}()
	if err != nil {
		t.Skipf("未配置对象存储：%v", err)
	}
	client, err := cfg.newClient()
	if err != nil {
		t.Fatal(err)
	}

	// 造一张 1x1 的 PNG，够小但的确是合法图片
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, color.RGBA{R: 109, G: 81, B: 254, A: 255})
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	payload := buf.Bytes()

	// 事务里跑完就回滚，只为了拿到上传真实生成的 publicURL
	errRollback := errors.New("rollback after assertions")
	var publicURL string
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

		brand, err := uploadBrandImage(
			merchantID,
			brandTargetLogo,
			"test-brand-upload.png",
			"image/png",
			bytes.NewReader(payload),
			int64(len(payload)),
		)
		if err != nil {
			return err
		}
		publicURL = brand.LogoURL
		if !strings.HasSuffix(publicURL, ".png") {
			t.Fatalf("回写的地址后缀不对：%s", publicURL)
		}
		if !strings.Contains(publicURL, "/branding/site-logo/-1/") {
			t.Fatalf("回写的地址没走平台既有模板：%s", publicURL)
		}
		t.Logf("回写 logo_url=%s", publicURL)
		return errRollback
	})
	if !errors.Is(txErr, errRollback) {
		t.Fatalf("事务应以回滚结束，实际：%v", txErr)
	}
	if publicURL == "" {
		t.Fatal("没有拿到上传后的地址")
	}

	// 从公网地址反推对象键，用完删掉
	objectKey := strings.TrimPrefix(publicURL, "https://"+cfg.publicHost()+"/")
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_, delErr := client.DeleteObjectV2(ctx, &tos.DeleteObjectV2Input{Bucket: cfg.Bucket, Key: objectKey})
		if delErr != nil {
			t.Logf("清理未完成（请手工删除 %s）：%v", objectKey, delErr)
		} else {
			t.Logf("已清理 %s", objectKey)
		}
	})

	// 对象必须真的存在，且大小与上传内容一致
	ctx, cancel := context.WithTimeout(context.Background(), uploadTimeout)
	defer cancel()
	meta, err := client.HeadObjectV2(ctx, &tos.HeadObjectV2Input{Bucket: cfg.Bucket, Key: objectKey})
	if err != nil {
		t.Fatalf("上传后核对失败：%v", err)
	}
	if meta.ContentLength != int64(len(payload)) {
		t.Fatalf("对象大小不符：期望 %d 实际 %d", len(payload), meta.ContentLength)
	}
	if meta.ContentType != "image/png" {
		t.Logf("注意：ContentType 被存成 %q（部分存储会归一化，不影响访问）", meta.ContentType)
	}

	/*
	 * 回滚之后库里的 logo_url 必须还是原来的。
	 * 这一条是整段测试真正的目的：证明「上传 + 落库」在同一个事务边界内，
	 * 不会出现「测试跑完商户 logo 变成测试图」这种事故。
	 */
	previousDB := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })
	var merchantID int64
	if err := db.Table("lc_distribution_merchants").Select("id").Order("id").Limit(1).Scan(&merchantID).Error; err != nil {
		t.Fatal(err)
	}
	brand, err := GetMerchantBrand(merchantID)
	if err != nil {
		t.Fatal(err)
	}
	if brand.LogoURL == publicURL {
		t.Fatalf("回滚失败，库里残留了测试 logo：%s", brand.LogoURL)
	}
	t.Logf("回滚后商户 %d 的 logo_url 仍是原来的：%s", merchantID, brand.LogoURL)
}
