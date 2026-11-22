package partner

import (
	"encoding/json"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"partner/internal/model"
)

/*
测试用的表结构照抄 PostgreSQL 上的真实列定义（含 CHECK 约束里真正影响写入的部分），
这样「传空字符串会被数据库拦下」这类问题在单测阶段就能暴露，不必等到连真库时才发现。
*/
func setupBrandDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	statements := []string{
		`CREATE TABLE lc_distribution_merchants (
			id integer primary key,
			merchant_name text not null,
			merchant_code text not null,
			site_id text, site_domain text, site_last_seen_at datetime,
			brand_name text, brand_short_name text, brand_logo_url text,
			brand_primary_color text, brand_page_title text, brand_favicon_url text,
			brand_tagline text, brand_api_base_url text,
			brand_support text, brand_landing text,
			updated_at datetime,
			CHECK (brand_name IS NULL OR trim(brand_name) <> ''),
			CHECK (brand_primary_color IS NULL OR brand_primary_color GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]*')
		)`,
		`INSERT INTO lc_distribution_merchants (id, merchant_name, merchant_code, site_id, site_domain)
			VALUES (1, '自运营平台', 'self-operated', 'site-local', 'localhost')`,
		`INSERT INTO lc_distribution_merchants (id, merchant_name, merchant_code)
			VALUES (2, '本地商户1', 'test-number1')`,
	}
	for _, sql := range statements {
		if err := db.Exec(sql).Error; err != nil {
			t.Fatalf("%v: %s", err, sql)
		}
	}
	previousDB, previousLogDB := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() { model.DB, model.LOG_DB = previousDB, previousLogDB })
	return db
}

func strPtr(s string) *string { return &s }

// 没配过任何品牌的商户：品牌名回落商户名，首字标记取首字，主色给平台默认值。
// 这几条兜底必须放在后端统一做，否则伙伴后台和客户站各兜一套会出现显示不一致。
func TestGetMerchantBrandFallsBackToMerchantName(t *testing.T) {
	setupBrandDB(t)
	brand, err := GetMerchantBrand(2)
	if err != nil {
		t.Fatal(err)
	}
	if brand.Name != "本地商户1" {
		t.Fatalf("品牌名应回落商户名，得到 %q", brand.Name)
	}
	if brand.ShortName != "本" {
		t.Fatalf("首字标记应取品牌名首字，得到 %q", brand.ShortName)
	}
	if brand.PageTitle != "本地商户1" {
		t.Fatalf("浏览器标题应回落品牌名，得到 %q", brand.PageTitle)
	}
	if brand.PrimaryColor != "#6d51fe" {
		t.Fatalf("主色应给默认值，得到 %q", brand.PrimaryColor)
	}
	if string(brand.Support) != "{}" || string(brand.Landing) != "{}" {
		t.Fatalf("未配置的 json 列应返回空对象，得到 %s / %s", brand.Support, brand.Landing)
	}
}

// 只改一个字段不能顺手清掉别的字段 —— 前端「改标题」和「删 logo」是两次不同的意图。
func TestUpdateMerchantBrandOnlyTouchesProvidedFields(t *testing.T) {
	setupBrandDB(t)
	if _, err := UpdateMerchantBrand(1, merchantBrandInput{
		Name:         strPtr("云启智能"),
		LogoURL:      strPtr("https://cdn.example.com/logo.png"),
		PrimaryColor: strPtr("#0d9488"),
	}); err != nil {
		t.Fatal(err)
	}
	brand, err := UpdateMerchantBrand(1, merchantBrandInput{Tagline: strPtr("企业级大模型接入")})
	if err != nil {
		t.Fatal(err)
	}
	if brand.Name != "云启智能" || brand.LogoURL != "https://cdn.example.com/logo.png" {
		t.Fatalf("未传的字段被覆盖了：name=%q logo=%q", brand.Name, brand.LogoURL)
	}
	if brand.Tagline != "企业级大模型接入" {
		t.Fatalf("新字段没写进去：%q", brand.Tagline)
	}
}

// 传空串的语义是「清空这一列」，必须落成 NULL，否则 CHECK 约束会拦下空品牌名。
func TestUpdateMerchantBrandEmptyStringClearsColumn(t *testing.T) {
	db := setupBrandDB(t)
	if _, err := UpdateMerchantBrand(1, merchantBrandInput{LogoURL: strPtr("https://cdn.example.com/logo.png")}); err != nil {
		t.Fatal(err)
	}
	brand, err := UpdateMerchantBrand(1, merchantBrandInput{LogoURL: strPtr("  ")})
	if err != nil {
		t.Fatal(err)
	}
	if brand.LogoURL != "" {
		t.Fatalf("空白 logo 应清空，得到 %q", brand.LogoURL)
	}
	var nullCount int64
	if err := db.Table("lc_distribution_merchants").Where("id = 1 AND brand_logo_url IS NULL").Count(&nullCount).Error; err != nil {
		t.Fatal(err)
	}
	if nullCount != 1 {
		t.Fatal("清空应写入 NULL，而不是空字符串")
	}
}

/*
接口基地址：合法的几种写法都得能存进去。

这个测试和 TestUpdateMerchantBrandRejectsInvalidInput 里的负向用例是一对 ——
只测「错的被拒绝」不够，还得确认「对的没被误杀」。正则写窄了很容易把
带端口、带路径、带多级子域的正常地址挡在外面，而这种错误的表现是：
伙伴后台点保存提示格式不对，用户完全不知道哪里不对。
*/
func TestUpdateMerchantBrandAcceptsValidAPIBaseURL(t *testing.T) {
	setupBrandDB(t)
	cases := []string{
		"https://api.example.com",
		"https://api.example.com/v1",
		"http://115.191.65.124",
		"http://115.191.65.124:8080",
		"https://api.sub.example.com/openai/v1",
		"https://api.example.com:8443/v1/chat",
		"https://api.example.com/", // 尾部斜杠保留，前端用时会自己去掉
	}
	for _, want := range cases {
		brand, err := UpdateMerchantBrand(1, merchantBrandInput{APIBaseURL: strPtr(want)})
		if err != nil {
			t.Fatalf("%q 应被接受，实际报错：%v", want, err)
		}
		if brand.APIBaseURL != want {
			t.Fatalf("%q 存储后变成了 %q", want, brand.APIBaseURL)
		}
	}

	// 空串是「清空这一列」的正常语义，不能当成格式错误
	if _, err := UpdateMerchantBrand(1, merchantBrandInput{APIBaseURL: strPtr("")}); err != nil {
		t.Fatalf("空串应视为清空，实际报错：%v", err)
	}
	cleared, err := GetMerchantBrand(1)
	if err != nil {
		t.Fatal(err)
	}
	if cleared.APIBaseURL != "" {
		t.Fatalf("清空后应为空，得到 %q", cleared.APIBaseURL)
	}
}

func TestUpdateMerchantBrandRejectsInvalidInput(t *testing.T) {	setupBrandDB(t)
	cases := []struct {
		name  string
		input merchantBrandInput
	}{
		{"空品牌名", merchantBrandInput{Name: strPtr("   ")}},
		{"品牌色格式", merchantBrandInput{PrimaryColor: strPtr("red")}},
		{"客服信息不是对象", merchantBrandInput{Support: rawPtr(`["a"]`)}},
		/*
		 * 接口基地址的格式校验。
		 *
		 * 这一列会直接出现在客户站的首页示例和接入文档里，用户照着复制。
		 * 下面几种都是「看起来像地址、拼进去就是错的」：
		 *   · localhost / api.xxx.com  —— 漏协议，前端拼成相对路径
		 *   · javascript: / data:      —— 伪协议，拼进代码块或 href 有注入风险
		 *   · 带空格                   —— 复制出去 404，很难查
		 */
		{"接口基地址漏协议", merchantBrandInput{APIBaseURL: strPtr("api.example.com")}},
		{"接口基地址是 localhost", merchantBrandInput{APIBaseURL: strPtr("localhost:8080")}},
		{"接口基地址是伪协议", merchantBrandInput{APIBaseURL: strPtr("javascript:alert(1)")}},
		{"接口基地址带空格", merchantBrandInput{APIBaseURL: strPtr("https://api.example.com /v1")}},
	}
	for _, tc := range cases {
		if _, err := UpdateMerchantBrand(1, tc.input); err == nil {
			t.Fatalf("%s 应被拒绝", tc.name)
		}
	}
}

func rawPtr(s string) *json.RawMessage {
	raw := json.RawMessage(s)
	return &raw
}

// 读出来的 jsonb 必须能直接当对象用，前端不该再判断一次 null。
func TestMerchantBrandJSONRoundTrip(t *testing.T) {
	setupBrandDB(t)
	support := `{"email":"support@example.com","phone":"400-000-0000","note":"工作日 9:00-21:00"}`
	if _, err := UpdateMerchantBrand(1, merchantBrandInput{
		Support: rawPtr(support),
		Landing: rawPtr(`{"hero_title":"企业级大模型接入"}`),
	}); err != nil {
		t.Fatal(err)
	}
	brand, err := GetMerchantBrand(1)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]string
	if err := json.Unmarshal(brand.Support, &got); err != nil {
		t.Fatal(err)
	}
	if got["email"] != "support@example.com" || got["note"] != "工作日 9:00-21:00" {
		t.Fatalf("客服信息没存对：%v", got)
	}
	var landing map[string]any
	if err := json.Unmarshal(brand.Landing, &landing); err != nil {
		t.Fatal(err)
	}
	if landing["hero_title"] != "企业级大模型接入" {
		t.Fatalf("首页配置没存对：%v", landing)
	}
}

// 一个商户只能看到自己的品牌：ID 是会话里的，不能由请求参数指定。
func TestGetMerchantBrandIsMerchantScoped(t *testing.T) {
	setupBrandDB(t)
	if _, err := UpdateMerchantBrand(1, merchantBrandInput{Name: strPtr("自营品牌")}); err != nil {
		t.Fatal(err)
	}
	other, err := GetMerchantBrand(2)
	if err != nil {
		t.Fatal(err)
	}
	if other.Name == "自营品牌" {
		t.Fatal("商户 2 读到了商户 1 的品牌配置")
	}
	if _, err := GetMerchantBrand(0); err == nil {
		t.Fatal("非法商户 ID 应报错")
	}
}
