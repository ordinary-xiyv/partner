package partner

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
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
模拟「前端翻页/筛选」的完整链路 —— 带真实签名 session，走真实 PartnerAuth。

为什么非要这么测：页面上报「筛选已禁用、分页数据不更新」，
但直接调业务函数和直接调 handler（前一个测试）结果都完全正常。
差别只剩下一个：**真实链路里前面挂着 PartnerAuth 中间件**。
如果 session 读不到，API 会返回 401，前端 axios 拦截器又会把页面踢到登录页，
用户看到的就是"点了没反应"。

★ 只做 SELECT 和读 session，不写业务数据。
*/
func TestRealDBPartnerLogsWithSessionMiddleware(t *testing.T) {
	dsn := os.Getenv("PARTNER_VERIFY_DSN")
	if dsn == "" {
		t.Skip("未设置 PARTNER_VERIFY_DSN，跳过")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	prevDB, prevLogDB := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() { model.DB, model.LOG_DB = prevDB, prevLogDB })

	gin.SetMode(gin.TestMode)
	r := gin.New()
	if err := r.SetTrustedProxies(nil); err != nil {
		t.Fatal(err)
	}
	r.Use(PartnerSession())

	// 只挂 PartnerAuth 的读路径，用一个自签 session 进站
	r.GET("/api/partner/logs", PartnerAuth(), PartnerLogsAPI)

	// 自己造一个合法 session cookie —— 和真实登录产出的结构一致
	secret := os.Getenv("PARTNER_SESSION_SECRET")
	if secret == "" {
		t.Skip("未设置 PARTNER_SESSION_SECRET，无法签发测试 session")
	}
	store := cookie.NewStore([]byte(secret))

	// 用 gin 的 session 机制生成写入 cookie 的响应
	var signedCookie string
	{
		r2 := gin.New()
		r2.Use(sessions.Sessions(partnerSessionCookieName, store))
		r2.GET("/seed", func(c *gin.Context) {
			s := sessions.Default(c)
			s.Set("merchant_id", int64(1))
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
				signedCookie = ck.Value
			}
		}
		if signedCookie == "" {
			t.Fatalf("没能生成 session cookie，响应头: %v", w.Header())
		}
		t.Logf("已签发测试 session cookie (长度 %d)", len(signedCookie))
	}

	client := &http.Client{}
	jar, _ := cookiejar.New(nil)
	u, _ := url.Parse("http://example.com")
	jar.SetCookies(u, []*http.Cookie{{Name: partnerSessionCookieName, Value: signedCookie, Path: "/api/partner"}})
	client.Jar = jar

	fetch := func(query string) (int, PartnerLogPage) {
		t.Helper()
		srv := httptest.NewServer(r)
		defer srv.Close()
		req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/partner/logs"+query, nil)
		req.AddCookie(&http.Cookie{Name: partnerSessionCookieName, Value: signedCookie})
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			var b map[string]any
			_ = json.NewDecoder(resp.Body).Decode(&b)
			t.Logf("HTTP %d: %v", resp.StatusCode, b)
			return resp.StatusCode, PartnerLogPage{}
		}
		var env struct {
			Data PartnerLogPage `json:"data"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&env)
		return resp.StatusCode, env.Data
	}

	code, base := fetch("?page=1&page_size=10&all_history=1")
	if code != http.StatusOK {
		t.Fatalf("带 session 仍返回 %d —— 说明鉴权链路有问题", code)
	}
	t.Logf("✓ 鉴权通过，基线 total=%d 本页=%d", base.Total, len(base.Items))

	_, pg2 := fetch("?page=2&page_size=10&all_history=1")
	if len(base.Items) > 0 && len(pg2.Items) > 0 {
		if base.Items[0].ID == pg2.Items[0].ID {
			t.Errorf("分页失效: 两页首行相同 id=%d", base.Items[0].ID)
		} else {
			t.Logf("✓ 翻页换数据: p1=%d → p2=%d", base.Items[0].ID, pg2.Items[0].ID)
		}
	}

	_, typed := fetch("?page=1&page_size=10&type=2&all_history=1")
	if typed.Total >= base.Total {
		t.Errorf("type 筛选未收窄: %d >= %d", typed.Total, base.Total)
	} else {
		t.Logf("✓ 筛选收窄: %d → %d", base.Total, typed.Total)
	}

	// 关键检查：返回的字段里有没有 cache_read（前端表格要用）
	encoded, _ := json.Marshal(base.Items[0])
	var m map[string]any
	_ = json.Unmarshal(encoded, &m)
	for _, f := range []string{"cache_read", "use_time", "amount_cny"} {
		if _, ok := m[f]; !ok {
			t.Errorf("响应缺少字段 %s —— 前端拿不到", f)
		}
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	t.Logf("响应字段: %v", keys)
	_ = base64.RawURLEncoding
}
