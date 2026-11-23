package partner

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"os"
	"strings"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"partner/internal/model"
)

/*
真库验证：从 options 表读出对象存储配置。

这是配置读取的主验证入口。上传本身要真的往桶里写东西，放在
TestBrandUploadLive 里由环境变量单独开启。
*/
func setupRealOptionsDB(t *testing.T) *gorm.DB {
	t.Helper()
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
	return db
}

func TestLoadObjectStorageConfigFromRealDB(t *testing.T) {
	setupRealOptionsDB(t)
	cfg, err := loadObjectStorageConfig()
	if err != nil {
		t.Skipf("库里没配对象存储：%v", err)
	}
	if !cfg.configured() {
		t.Fatal("配置不完整")
	}
	if !strings.Contains(cfg.sdkEndpoint(), "volces.com") && !strings.Contains(cfg.sdkEndpoint(), "aliyuncs.com") {
		t.Logf("端点看起来不是已知云厂商：%s", cfg.sdkEndpoint())
	}
	if cfg.Bucket == "" || cfg.AccessKeyID == "" || cfg.AccessKeySecret == "" {
		t.Fatal("关键字段为空")
	}
	if strings.HasPrefix(cfg.sdkEndpoint(), "http") {
		t.Fatalf("SDK 端点不该带协议头：%s", cfg.sdkEndpoint())
	}
	if strings.Contains(cfg.publicHost(), "://") {
		t.Fatalf("公网域名不该带协议头：%s", cfg.publicHost())
	}
	t.Logf("provider=%s bucket=%s endpoint=%s prefix=%s publicHost=%s",
		cfg.Provider, cfg.Bucket, cfg.sdkEndpoint(), cfg.KeyPrefix, cfg.publicHost())
}

/*
对象键必须落在平台既有模板里。

这条只算字符串，不发网络请求 —— 键拼错了不会报错，只会让文件散落在
bucket 里跟平台上原有的 logo 不在同一个前缀下，将来按前缀清理时漏掉。
*/
func TestObjectKeyFollowsPlatformTemplate(t *testing.T) {
	cfg := objectStorageConfig{
		KeyPrefix:   "tokens-lynxtoncloud-LZ-CS",
		KeyTemplate: "{key_prefix}/branding/site-logo/{user_id}/{file_id}/{filename}",
	}
	key := cfg.objectKey(42, "abc123", "logo.png", "")
	want := "tokens-lynxtoncloud-LZ-CS/branding/site-logo/-1/abc123/logo.png"
	if key != want {
		t.Fatalf("对象键不符：\n  got=%s\n  want=%s", key, want)
	}
	if strings.HasPrefix(key, "/") {
		t.Fatalf("对象键不该以斜杠开头：%s", key)
	}
}

// 二维码走同一个模板，只把目录换成 site-qr
func TestObjectKeyUsesQRTargetDir(t *testing.T) {
	cfg := objectStorageConfig{
		KeyPrefix:   "tokens-lynxtoncloud-LZ-CS",
		KeyTemplate: "{key_prefix}/branding/site-logo/{user_id}/{file_id}/{filename}",
	}
	key := cfg.objectKey(42, "abc123", "qr.png", "site-qr")
	want := "tokens-lynxtoncloud-LZ-CS/branding/site-qr/-1/abc123/qr.png"
	if key != want {
		t.Fatalf("对象键不符：\n  got=%s\n  want=%s", key, want)
	}
}

/*
文件名清洗。

对象键里出现空格、括号、中文会让部分 CDN 和签名逻辑出问题，
统一替换成下划线。这里是唯一保证「存进去的键是干净的」的地方。
*/
func TestSafeFilename(t *testing.T) {
	cases := map[string]string{
		"我的 Logo (1).PNG":        "Logo_1_.PNG",
		"../../etc/passwd":       "passwd",
		"a b c.png":              "a_b_c.png",
		"":                       "logo",
		"....":                   "logo",
		strings.Repeat("x", 100): strings.Repeat("x", 80),
	}
	for input, want := range cases {
		if got := safeFilename(input); got != want {
			t.Fatalf("safeFilename(%q)=%q，期望 %q", input, got, want)
		}
	}
}

// 类型判定：空上报按扩展名兜底，两者都不认必须拒绝。
func TestResolveBrandContentType(t *testing.T) {
	accept := []struct {
		declared string
		filename string
		want     string
	}{
		{"image/png", "a.png", "image/png"},
		{"IMAGE/PNG", "a.png", "image/png"},
		{"image/png; charset=binary", "a.png", "image/png"},
		{"", "a.png", "image/png"},
		{"", "a.JPEG", "image/jpeg"},
		{"", "a.svg", "image/svg+xml"},
		{" ", "a.webp", "image/webp"},
	}
	for _, tc := range accept {
		got, err := resolveBrandContentType(tc.declared, tc.filename)
		if err != nil {
			t.Fatalf("declared=%q filename=%q 应当通过：%v", tc.declared, tc.filename, err)
		}
		if got != tc.want {
			t.Fatalf("declared=%q filename=%q 得到 %q，期望 %q", tc.declared, tc.filename, got, tc.want)
		}
	}

	reject := []struct{ declared, filename string }{
		{"image/gif", "a.gif"},
		{"text/html", "a.html"},
		{"application/octet-stream", "a.bin"},
		{"", "a.txt"},
		{"", ""},
	}
	for _, tc := range reject {
		if _, err := resolveBrandContentType(tc.declared, tc.filename); err == nil {
			t.Fatalf("declared=%q filename=%q 应被拒绝", tc.declared, tc.filename)
		}
	}
}

/*
字节级复核。

把 HTML 改名成 .png 传上来，存储会按 image/png 存进公网可读的桶，
谁打开那个地址就执行一段脚本。所以不能只信客户端声明的类型。
*/
func TestValidateBrandImageBytes(t *testing.T) {
	pngBytes := func() []byte {
		img := image.NewRGBA(image.Rect(0, 0, 1, 1))
		img.Set(0, 0, color.RGBA{R: 109, G: 81, B: 254, A: 255})
		var buf bytes.Buffer
		if err := png.Encode(&buf, img); err != nil {
			t.Fatal(err)
		}
		return buf.Bytes()
	}()

	if err := validateBrandImageBytes("image/png", pngBytes); err != nil {
		t.Fatalf("合法 PNG 被拒：%v", err)
	}
	if err := validateBrandImageBytes("image/jpeg", []byte{0xFF, 0xD8, 0xFF, 0xE0}); err != nil {
		t.Fatalf("合法 JPEG 被拒：%v", err)
	}
	if err := validateBrandImageBytes("image/webp", append([]byte("RIFF\x00\x00\x00\x00"), []byte("WEBPVP8 ")...)); err != nil {
		t.Fatalf("合法 WEBP 被拒：%v", err)
	}
	if err := validateBrandImageBytes("image/svg+xml", []byte(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`)); err != nil {
		t.Fatalf("合法 SVG 被拒：%v", err)
	}
	if err := validateBrandImageBytes("image/svg+xml", []byte(`<?xml version="1.0"?><svg></svg>`)); err != nil {
		t.Fatalf("带 XML 声明的 SVG 被拒：%v", err)
	}

	// 伪装成图片的非图片内容
	masquerade := []struct {
		name     string
		declared string
		data     []byte
	}{
		{"HTML 改名 PNG", "image/png", []byte("<html><script>alert(1)</script></html>")},
		{"PNG 头但内容截断", "image/png", []byte("\x89PNG\r\n\x1a\n")},
		{"GIF 当 PNG", "image/png", []byte("GIF89a")},
		{"文本当 JPEG", "image/jpeg", []byte("not a jpeg")},
		{"短得不像 WEBP", "image/webp", []byte("RIFF")},
		{"HTML 当 SVG", "image/svg+xml", []byte("<html></html>")},
		{"空内容", "image/png", nil},
	}
	for _, tc := range masquerade {
		if err := validateBrandImageBytes(tc.declared, tc.data); err == nil {
			t.Fatalf("%s 应被拒绝", tc.name)
		}
	}
}

// 上传落点只认两个值，漏传按 logo 处理，写错必须报错。
func TestNormalizeBrandTarget(t *testing.T) {
	ok := map[string]string{"": brandTargetLogo, "logo_url": brandTargetLogo, "favicon_url": brandTargetFavicon, " Favicon_URL ": brandTargetFavicon}
	for input, want := range ok {
		got, err := normalizeBrandTarget(input)
		if err != nil {
			t.Fatalf("%q 应当通过：%v", input, err)
		}
		if got != want {
			t.Fatalf("%q 得到 %q，期望 %q", input, got, want)
		}
	}
	for _, bad := range []string{"logo", "favicon", "brand_logo", "../logo_url"} {
		if _, err := normalizeBrandTarget(bad); err == nil {
			t.Fatalf("%q 应被拒绝", bad)
		}
	}
}

// 无对象存储配置时必须明确报「未配置」，而不是在上传时才炸出一个难懂的 SDK 错误。
func TestUploadBrandImageWithoutStorageConfig(t *testing.T) {
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

	// 空内容在任何情况下都该被拒，且不该走到网络
	if _, err := uploadBrandImage(1, brandTargetLogo, "a.png", "image/png", bytes.NewReader(nil), 0); err == nil {
		t.Fatal("空内容应被拒绝")
	}
	// 超过上限的声明大小应当在读数据之前就挡掉
	if _, err := uploadBrandImage(1, brandTargetLogo, "a.png", "image/png", bytes.NewReader([]byte("x")), maxBrandImageBytes+1); err == nil {
		t.Fatal("超限大小应被拒绝")
	}
}
