package partner

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"partner/internal/model"
)

/*
公网文档链路的端到端验证：导入之后，客户站能不能真的看到内容。

这是本次修复要回答的核心问题。截图上的现象是「左边有目录、右边写着
文档不存在」，所以只验证「导入成功」不够 —— 还必须验证：
  1. 公网站点身份能通过（X-Site-ID / X-Site-Host / X-Site-Credential 三头都对）
  2. /public/docs/tree 返回的分类非空（页面左侧有东西）
  3. /public/docs/articles/:slug 对目录里每个 slug 都能取到正文（点击不落空）

★ 只写 PARTNER_VERIFY_DSN 指向的库，跑完清理。
*/
func TestRealDBPublicDocsAfterSeed(t *testing.T) {
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

	const siteID = "site-public-verify"
	const siteDomain = "public-verify.local"
	const merchantID int64 = 9002
	// 与 siteIdentityFromRequest 的约定一致：库里存的是 sha256(64 位十六进制明文)
	const credential = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

	cleanup := func() {
		db.Exec(`DELETE FROM lc_partner_doc_articles WHERE site_id = ?`, siteID)
		db.Exec(`DELETE FROM lc_partner_doc_categories WHERE site_id = ?`, siteID)
		db.Exec(`DELETE FROM lc_distribution_merchants WHERE id = ?`, merchantID)
	}
	cleanup()
	t.Cleanup(cleanup)

	// 造站点 + 凭证（哈希算法以 siteIdentityFromRequest 的实现为准）
	if err := db.Exec(
		`INSERT INTO lc_distribution_merchants
		   (id, merchant_name, merchant_code, site_id, site_domain, site_credential_hash,
		    partner_login_enabled, partner_password_change_required, partner_session_version)
		 VALUES (?, '公网验证商户', 'public-verify', ?, ?, sha256(?::bytea), TRUE, FALSE, 4)`,
		merchantID, siteID, siteDomain, credential,
	).Error; err != nil {
		t.Fatalf("造站点失败：%v", err)
	}

	// 导入默认文档
	if _, err := ImportDocSeed(siteID, DocSeedModeSkip); err != nil {
		t.Fatalf("导入失败：%v", err)
	}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	if err := r.SetTrustedProxies(nil); err != nil {
		t.Fatal(err)
	}
	r.GET("/api/partner/public/docs/tree", PublicDocTreeAPI)
	r.GET("/api/partner/public/docs/articles/:slug", PublicDocArticleAPI)

	do := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("X-Site-ID", siteID)
		req.Header.Set("X-Site-Host", siteDomain)
		req.Header.Set("X-Site-Credential", credential)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	// ---- 1. 目录必须非空 ----
	w := do("/api/partner/public/docs/tree?lang=zh")
	if w.Code != http.StatusOK {
		t.Fatalf("公网树返回 %d：%s", w.Code, w.Body.String())
	}
	var tree struct {
		Success bool `json:"success"`
		Data    struct {
			Categories []struct {
				Slug  string `json:"slug"`
				Nodes []struct {
					Type string `json:"type"`
					Data struct {
						Slug  string `json:"slug"`
						Nodes []any  `json:"nodes"`
					} `json:"data"`
				} `json:"nodes"`
			} `json:"categories"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &tree); err != nil {
		t.Fatalf("响应不是合法 JSON：%v", err)
	}
	if !tree.Success {
		t.Fatalf("success 不为 true：%s", w.Body.String())
	}
	if len(tree.Data.Categories) == 0 {
		t.Fatal("公网树是空的 —— 客户站左侧仍然没有目录")
	}

	/*
	 * 收集目录里出现的所有文章 slug。
	 *
	 * ★ 必须递归。api-reference 下面还挂着 chat、real-person-portrait、
	 *   virtual-avatar-assets 等子分类，文章在第三层
	 *   （api-reference → real-person-portrait → article）。
	 *   只扫两层会漏掉这些，测试就会「通过」但实际有 8 篇没验过 ——
	 *   而漏掉的那 8 篇恰恰是最长、最可能出问题的那批。
	 */
	var slugs []string
	var walk func(nodes []any)
	walk = func(nodes []any) {
		for _, raw := range nodes {
			node, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			data, _ := node["data"].(map[string]any)
			switch node["type"] {
			case "article":
				if s, ok := data["slug"].(string); ok && s != "" {
					slugs = append(slugs, s)
				}
			case "category":
				if children, ok := data["nodes"].([]any); ok {
					walk(children)
				}
			}
		}
	}
	for _, cat := range tree.Data.Categories {
		// categories[].nodes 是 []struct，先转成 []any 交给递归
		nodes := make([]any, 0, len(cat.Nodes))
		for _, n := range cat.Nodes {
			child := map[string]any{"type": n.Type}
			data := map[string]any{"slug": n.Data.Slug}
			if len(n.Data.Nodes) > 0 {
				data["nodes"] = n.Data.Nodes
			}
			child["data"] = data
			nodes = append(nodes, child)
		}
		walk(nodes)
	}
	if len(slugs) == 0 {
		t.Fatal("目录里一篇文章都没有")
	}

	// 目录里的篇数必须等于库里已发布的篇数 —— 少一篇就说明树构建漏了分支
	seed, err := loadDocSeed()
	if err != nil {
		t.Fatal(err)
	}
	if len(slugs) != len(seed.Articles) {
		t.Fatalf("目录里只有 %d 篇，库里应该有 %d 篇（树构建漏了分支）",
			len(slugs), len(seed.Articles))
	}

	/*
	 * ---- 2. 目录里的每一篇都必须点得开 ----
	 *
	 * 这正是截图里的问题：目录有、正文取不到。所以这里不做抽样，
	 * 全量验证 —— 只要有一篇 404，页面上就会出现那个「文档不存在或未发布」。
	 */
	for _, slug := range slugs {
		aw := do("/api/partner/public/docs/articles/" + slug + "?lang=zh")
		if aw.Code != http.StatusOK {
			t.Fatalf("目录里的 %s 取不到正文：HTTP %d %s", slug, aw.Code, aw.Body.String())
		}
		var art struct {
			Success bool `json:"success"`
			Data    struct {
				Slug    string `json:"slug"`
				Title   string `json:"title"`
				Content string `json:"content"`
			} `json:"data"`
		}
		if err := json.Unmarshal(aw.Body.Bytes(), &art); err != nil {
			t.Fatalf("%s 响应不是合法 JSON：%v", slug, err)
		}
		if !art.Success || art.Data.Slug != slug {
			t.Fatalf("%s 响应内容不对：%s", slug, aw.Body.String())
		}
		if art.Data.Content == "" {
			t.Fatalf("%s 的正文是空的 —— 页面上会是一片空白", slug)
		}
		if art.Data.Title == "" {
			t.Fatalf("%s 没有标题", slug)
		}
	}

	t.Logf("公网验证通过：%d 个根分类、%d 篇文章全部可读",
		len(tree.Data.Categories), len(slugs))
}
