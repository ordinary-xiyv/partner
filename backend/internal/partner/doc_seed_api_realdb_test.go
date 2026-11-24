package partner

import (
	"crypto/sha256"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"partner/internal/model"
)

/*
导入默认文档的端到端验证（HTTP 层 + 真实 Postgres）。

为什么要在真库上再测一遍：
内存 sqlite 已经覆盖了业务逻辑（doc_seed_test.go），但这条链路上有两处
只有真库能测出来 —— session 中间件把 merchant_id 放进 context、以及
siteIDForMerchant 从 lc_distribution_merchants 里取 site_id。任何一处断掉，
表现都是「点按钮没反应」或「导入到别的站点去了」。

★ 只写 PARTNER_VERIFY_DSN 指向的库，绝不碰 SQL_DSN 指向的生产库。
  测试前后都会清掉自己造的 site_id 数据，跑完不留痕。
*/
func TestRealDBDocSeedImportHTTP(t *testing.T) {
	dsn := os.Getenv("PARTNER_VERIFY_DSN")
	if dsn == "" {
		t.Skip("未设置 PARTNER_VERIFY_DSN，跳过真实库验证")
	}
	secret := os.Getenv("PARTNER_SESSION_SECRET")
	if secret == "" {
		t.Skip("未设置 PARTNER_SESSION_SECRET，无法签发测试 session")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	prevDB := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = prevDB })

	const siteID = "site-seed-verify"
	const merchantID int64 = 9001
	/*
	 * 这个商户只是为了让 siteIDForMerchant 能查到 site_id，不做凭证校验，
	 * 但 site_credential_hash 必须非空且长度合法，见下面的 CHECK 约束说明。
	 *
	 * ★ 写入的必须是 sha256 原始 32 字节（bytea），不是 64 位十六进制字符串。
	 *
	 * 表上还有第二个约束 lc_distribution_merchants_credential_hash_length：
	 *   CHECK (site_credential_hash IS NULL OR octet_length(site_credential_hash) = 32)
	 *
	 * 直接塞 64 位 hex 字符串是 64 字节，会被这个约束拒掉（SQLSTATE 23514）。
	 * 真实写入路径（partner_site_brand.go）算的是：
	 *   sha256.Sum256([]byte(64 位十六进制明文串))  →  [:]，正好 32 字节。
	 *
	 * 注意哈希的是「hex 明文串本身」，不是 hex.Decode 之后的 32 字节 ——
	 * 这里照抄该算法，免得测试造出来的行和生产行的语义不一致。
	 */
	const verifySiteCredentialHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	verifySiteCredentialHash := sha256.Sum256([]byte(verifySiteCredentialHex))

	/*
	 * 先定义并立刻执行一次清理（把上一次残留删干净），再插数据。
	 *
	 * 顺序不能反：cleanup 里会删掉 merchantID 这行，如果先插后清，
	 * 数据刚造好就被自己的清理删了，PartnerAuth 拿到的是 record not found，
	 * 表现为 401「登录状态已失效」—— 排查起来会误以为是 session 的问题。
	 */
	cleanup := func() {
		db.Exec(`DELETE FROM lc_partner_doc_articles WHERE site_id = ?`, siteID)
		db.Exec(`DELETE FROM lc_partner_doc_categories WHERE site_id = ?`, siteID)
		db.Exec(`DELETE FROM lc_distribution_merchants WHERE id = ?`, merchantID)
	}
	cleanup()
	t.Cleanup(cleanup)

	/*
	 * 造一个商户，指向本次验证专用 site_id。
	 *
	 * ★ 必须带 site_credential_hash。
	 *
	 * 表上有 CHECK 约束 lc_distribution_merchants_site_binding_complete：
	 *   (site_id, site_domain, site_credential_hash) 要么三个全 NULL，
	 *   要么三个全非 NULL —— 不允许「绑了站点但没有凭证」的半绑定状态。
	 *
	 * 之前这条 INSERT 漏了 credential，在真实库上直接被约束拒掉
	 * （SQLSTATE 23514）。这个约束是对的：没有凭证的站点身份登不进来，
	 * 让它插进去只会让测试在更后面一步莫名其妙地失败。
	 *
	 * 值随便填，测试只走 session + siteIDForMerchant，不做凭证校验。
	 */
	if err := db.Exec(
		`INSERT INTO lc_distribution_merchants
		   (id, merchant_name, merchant_code, site_id, site_domain, site_credential_hash,
		    partner_login_enabled, partner_password_change_required, partner_session_version)
		 VALUES (?, '验证商户', 'seed-verify', ?, 'seed-verify.local', ?, TRUE, FALSE, 4)`,
		merchantID, siteID, verifySiteCredentialHash[:],
	).Error; err != nil {
		t.Fatalf("造商户失败（lc_distribution_merchants 存在吗）：%v", err)
	}

	gin.SetMode(gin.TestMode)

	// 自签一个和真实登录同构的 session cookie
	store := cookie.NewStore([]byte(secret))
	var sessionCookie string
	{
		r2 := gin.New()
		r2.Use(sessions.Sessions(partnerSessionCookieName, store))
		r2.GET("/seed", func(c *gin.Context) {
			s := sessions.Default(c)
			s.Set("merchant_id", merchantID)
			s.Set("partner_session_version", int64(4))
			if err := s.Save(); err != nil {
				t.Fatal(err)
			}
			c.JSON(200, gin.H{"ok": true})
		})
		w := httptest.NewRecorder()
		r2.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/seed", nil))
		for _, ck := range w.Result().Cookies() {
			if ck.Name == partnerSessionCookieName {
				sessionCookie = ck.Name + "=" + ck.Value
			}
		}
		if sessionCookie == "" {
			t.Fatal("没能签发测试 session cookie")
		}
	}

	r := gin.New()
	if err := r.SetTrustedProxies(nil); err != nil {
		t.Fatal(err)
	}
	r.Use(PartnerSession())
	r.POST("/api/partner/docs/import/seed", PartnerAuth(), AdminDocSeedImportAPI)
	r.GET("/api/partner/docs/tree", PartnerAuth(), AdminDocTreeAPI)

	do := func(method, path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, nil)
		req.Header.Set("Cookie", sessionCookie)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	// ---- 第一次导入 ----
	w := do(http.MethodPost, "/api/partner/docs/import/seed")
	if w.Code != http.StatusOK {
		t.Fatalf("导入应返回 200，实际 %d：%s", w.Code, w.Body.String())
	}
	var body struct {
		Success bool `json:"success"`
		Data    struct {
			SiteID  string         `json:"site_id"`
			Mode    string         `json:"mode"`
			Summary DocSeedSummary `json:"summary"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("响应不是合法 JSON：%v\n%s", err, w.Body.String())
	}
	if !body.Success {
		t.Fatalf("success 不为 true：%s", w.Body.String())
	}
	// ★ 这里最容易错：session 里的 merchant_id 必须映射到正确的 site_id
	if body.Data.SiteID != siteID {
		t.Fatalf("导入到了错误的站点：期望 %s，实际 %s", siteID, body.Data.SiteID)
	}
	if body.Data.Mode != DocSeedModeSkip {
		t.Fatalf("默认模式应是 skip，实际 %s", body.Data.Mode)
	}
	if body.Data.Summary.CategoriesCreated == 0 || body.Data.Summary.ArticlesCreated == 0 {
		t.Fatalf("第一次导入应有新增，实际 %+v", body.Data.Summary)
	}

	// ---- 第二次导入：必须幂等 ----
	w = do(http.MethodPost, "/api/partner/docs/import/seed")
	if w.Code != http.StatusOK {
		t.Fatalf("二次导入应返回 200，实际 %d：%s", w.Code, w.Body.String())
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Data.Summary.CategoriesCreated != 0 || body.Data.Summary.ArticlesCreated != 0 {
		t.Fatalf("二次导入不该新建，实际 %+v", body.Data.Summary)
	}

	// ---- 公网接口应该能读到这些文档 ----
	w = do(http.MethodGet, "/api/partner/docs/tree")
	if w.Code != http.StatusOK {
		t.Fatalf("后台树接口返回 %d：%s", w.Code, w.Body.String())
	}
	var tree struct {
		Data struct {
			Categories []any `json:"categories"`
			Articles   []any `json:"articles"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &tree); err != nil {
		t.Fatal(err)
	}
	if len(tree.Data.Categories) == 0 {
		t.Fatal("后台树里没有分类，页面上仍然是空的")
	}
	if len(tree.Data.Articles) == 0 {
		t.Fatal("后台树里没有文章")
	}

	// 落库条数应与种子一致
	seed, err := loadDocSeed()
	if err != nil {
		t.Fatal(err)
	}
	if len(tree.Data.Categories) != len(seed.Categories) {
		t.Fatalf("库里有 %d 个分类，种子有 %d 个",
			len(tree.Data.Categories), len(seed.Categories))
	}
	if len(tree.Data.Articles) != len(seed.Articles) {
		t.Fatalf("库里有 %d 篇文章，种子有 %d 篇",
			len(tree.Data.Articles), len(seed.Articles))
	}
}
