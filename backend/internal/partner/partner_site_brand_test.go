package partner

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"partner/internal/model"
)

func newSiteBrandRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/partner/public/site-brand", PublicSiteBrandAPI)
	return r
}

/*
这个接口是唯一一条匿名可访问的 /api/partner 路由，所以「谁能读到」这件事
必须测死。任何一处判断漏了，后果都是「任意人拿一个域名就能读到某商户的品牌」——
听起来不算严重，但它是白标体系信任的起点：既然身份能伪造，
后面按站点做的所有区分都不再有意义。
*/
func TestPublicSiteBrandRejectsBadIdentity(t *testing.T) {
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

	var merchant struct {
		SiteID     string
		SiteDomain string
	}
	if err := db.Table("lc_distribution_merchants").
		Select("site_id, site_domain").
		Where("site_id IS NOT NULL AND site_domain IS NOT NULL").Order("id").Take(&merchant).Error; err != nil {
		t.Skipf("库里没有绑定站点的商户：%v", err)
	}
	router := newSiteBrandRouter()

	call := func(headers map[string]string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/partner/public/site-brand", nil)
		for k, v := range headers {
			if v != "" {
				req.Header.Set(k, v)
			}
		}
		router.ServeHTTP(w, req)
		return w
	}

	// 一个长度合法但内容不对的凭证，用来测「格式对、值错」这一支
	wrongCred := strings.Repeat("a", 64)
	if strings.EqualFold(wrongCred, strings.Repeat("0", 64)) {
		t.Fatal("测试数据写错了")
	}

	cases := []struct {
		name    string
		headers map[string]string
	}{
		{"完全没带头", nil},
		{"只带 site_id", map[string]string{"X-Site-ID": merchant.SiteID}},
		{"缺凭证", map[string]string{"X-Site-ID": merchant.SiteID, "X-Site-Host": merchant.SiteDomain}},
		{"缺 host", map[string]string{"X-Site-ID": merchant.SiteID, "X-Site-Credential": wrongCred}},
		{"凭证长度不对", map[string]string{"X-Site-ID": merchant.SiteID, "X-Site-Host": merchant.SiteDomain, "X-Site-Credential": "abc"}},
		{"凭证不是十六进制", map[string]string{"X-Site-ID": merchant.SiteID, "X-Site-Host": merchant.SiteDomain, "X-Site-Credential": strings.Repeat("z", 64)}},
		{"凭证长度对但值错", map[string]string{"X-Site-ID": merchant.SiteID, "X-Site-Host": merchant.SiteDomain, "X-Site-Credential": wrongCred}},
		{"站点 ID 不存在", map[string]string{"X-Site-ID": "no-such-site", "X-Site-Host": merchant.SiteDomain, "X-Site-Credential": wrongCred}},
		{"域名与站点不匹配", map[string]string{"X-Site-ID": merchant.SiteID, "X-Site-Host": "evil.example.com", "X-Site-Credential": wrongCred}},
		{"三者全空字符串", map[string]string{"X-Site-ID": " ", "X-Site-Host": " ", "X-Site-Credential": " "}},
	}
	for _, tc := range cases {
		w := call(tc.headers)
		if w.Code != http.StatusForbidden {
			t.Fatalf("%s 应返回 403，实际 %d：%s", tc.name, w.Code, w.Body.String())
		}
		/*
		 * 错误信息不能泄漏「是哪一步失败的」。
		 *
		 * 如果凭证错时说「凭证错」、站点不存在时说「站点不存在」，
		 * 攻击者就能先枚举出有效的 site_id / domain 组合，再集中爆破凭证。
		 */
		if body := w.Body.String(); !strings.Contains(body, "站点身份无效") {
			t.Fatalf("%s 的提示应统一为「站点身份无效」，实际：%s", tc.name, body)
		}
	}
}

/*
合法身份必须能读到品牌，且返回的是「裁剪后」的字段集。

后半句同样重要：如果哪天有人把 MerchantBrand 直接塞进响应，
MerchantCode、MerchantID 这些内部信息就会出现在公网接口上，而这类问题
在 code review 里极难被注意到。

关于 APIBaseURL：它**曾经**列在「内部字段」里、不允许下发。后来改了主意 ——
客户站的首页示例和接入文档必须展示一个地址，不下发就只能回落到主站的
server_address，分销商的客户照着复制出来看到的是主站的 IP，那才是真正
要避免的泄漏。现在它属于公网字段，但在写入侧做了格式校验
（见 partner_brand.go 的 brandBaseURLPattern）。
*/
func TestPublicSiteBrandReturnsPublicFieldsOnly(t *testing.T) {
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

	var merchant struct {
		ID         int64
		SiteID     string
		SiteDomain string
	}
	if err := db.Table("lc_distribution_merchants").
		Select("id, site_id, site_domain").
		Where("site_id IS NOT NULL AND site_domain IS NOT NULL").Order("id").Take(&merchant).Error; err != nil {
		t.Skipf("库里没有绑定站点的商户：%v", err)
	}

	/*
	 * 算凭证的方式必须和线上一致：sha256(64 位 hex 字符串)。
	 *
	 * 这里反向构造 —— 先随机取一个 hex 串，算出它的 sha256，临时写进库里，
	 * 再拿这个 hex 串当请求头。走的是和真实链路完全相同的比对路径，
	 * 而不是「跳过校验直接读品牌」那种测了等于没测的做法。
	 *
	 * 写库包事务并回滚，不改商户真实凭证。
	 */
	errRollback := errStopForRollback
	var body []byte
	var status int
	txErr := db.Transaction(func(tx *gorm.DB) error {
		previousInner := model.DB
		model.DB = tx
		defer func() { model.DB = previousInner }()

		credential := strings.Repeat("5", 64)
		sum := sha256.Sum256([]byte(credential))
		if err := tx.Table("lc_distribution_merchants").Where("id = ?", merchant.ID).
			Update("site_credential_hash", sum[:]).Error; err != nil {
			return err
		}

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/partner/public/site-brand", nil)
		req.Header.Set("X-Site-ID", merchant.SiteID)
		req.Header.Set("X-Site-Host", merchant.SiteDomain)
		req.Header.Set("X-Site-Credential", credential)
		newSiteBrandRouter().ServeHTTP(w, req)
		status, body = w.Code, w.Body.Bytes()
		return errRollback
	})
	if txErr != errRollback {
		t.Fatalf("事务应以回滚结束，实际：%v", txErr)
	}
	if status != http.StatusOK {
		t.Fatalf("合法身份应 200，实际 %d：%s", status, body)
	}

	var resp struct {
		Success bool           `json:"success"`
		Data    map[string]any `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatal(err)
	}
	if !resp.Success {
		t.Fatalf("success 应为 true：%s", body)
	}
	// 8 个核心字段里必有的几个
	for _, key := range []string{"name", "short_name", "logo_url", "primary_color", "page_title", "favicon_url", "tagline", "support"} {
		if _, ok := resp.Data[key]; !ok {
			t.Fatalf("响应缺少字段 %q：%s", key, body)
		}
	}
	/*
	 * api_base_url 必须存在，哪怕是空串。
	 *
	 * 判「存在」而不是判「非空」：绝大多数商户没配这一项，空串是正常状态，
	 * 客户站看到空串会自己回落到 window.location.origin。但字段本身必须
	 * 出现 —— 缺字段和空串在前端是不同的分支，缺字段会让 TS 侧的类型约定
	 * 和真实响应脱节，排查时看不出是「后端没发」还是「前端没读」。
	 */
	if _, ok := resp.Data["api_base_url"]; !ok {
		t.Fatalf("响应缺少 api_base_url（可以为空串，但字段必须存在）：%s", body)
	}
	// 内部字段一个都不能出现
	for _, key := range []string{"merchant_id", "merchant_code", "landing", "site_id", "site_domain"} {
		if _, ok := resp.Data[key]; ok {
			t.Fatalf("响应泄漏了内部字段 %q：%s", key, body)
		}
	}
	// support 必须是对象，不能是字符串或 null，否则前端遍历会炸
	if _, ok := resp.Data["support"].(map[string]any); !ok {
		t.Fatalf("support 应是 JSON 对象，实际 %T：%s", resp.Data["support"], body)
	}
	if name, _ := resp.Data["name"].(string); strings.TrimSpace(name) == "" {
		t.Fatalf("品牌名不该为空（有兜底规则）：%s", body)
	}
	t.Logf("读到的公网品牌：%s", body)

	// 回滚后凭证必须恢复成原值，不能把测试凭证留在库里
	var hexHash string
	if err := db.Table("lc_distribution_merchants").Select("encode(site_credential_hash,'hex')").
		Where("id = ?", merchant.ID).Scan(&hexHash).Error; err != nil {
		t.Fatal(err)
	}
	testHash := sha256.Sum256([]byte(strings.Repeat("5", 64)))
	if strings.EqualFold(hexHash, hex.EncodeToString(testHash[:])) {
		t.Fatal("回滚失败，库里残留了测试凭证")
	}
}

// 各测试共用的回滚哨兵，避免每个测试各定一个。
var errStopForRollback = &rollbackSentinel{}

type rollbackSentinel struct{}

func (*rollbackSentinel) Error() string { return "rollback after assertions" }
