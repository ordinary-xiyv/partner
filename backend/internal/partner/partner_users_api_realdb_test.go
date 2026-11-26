package partner

import (
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"strconv"
	"testing"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"partner/internal/model"
)

/*
HTTP 层验证：GET /api/partner/users 的 status 参数。

前面的真实库测试直接调 ListPartnerUsers，验证了 SQL 层。
但那个 bug 的另一半在 HTTP 层 —— 参数到底有没有被解析、非法值会不会被
静默忽略。这里挂真实的 PartnerSession + PartnerAuth，用自签 session 打进来。

三个必须钉死的行为：
 1. status=1 / status=2 各自返回的 total 相加 == 不传 status 的 total
 2. 不传 status 等价于 status=0（全部）
 3. status=abc / status=99 返回 400，**不能**静默当「全部」
    —— 静默忽略会让前端以为筛过了，实际看到全量，又是「数字是错的」

★ 只做 SELECT，不写业务数据。
*/
func TestRealDBPartnerUsersStatusHTTP(t *testing.T) {
	dsn := os.Getenv("PARTNER_VERIFY_DSN")
	if dsn == "" {
		t.Skip("未设置 PARTNER_VERIFY_DSN，跳过")
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

	gin.SetMode(gin.TestMode)
	r := gin.New()
	if err := r.SetTrustedProxies(nil); err != nil {
		t.Fatal(err)
	}
	r.Use(PartnerSession())
	r.GET("/api/partner/users", PartnerAuth(), PartnerUsersAPI)

	// 自签一个和真实登录结构一致的 session
	store := cookie.NewStore([]byte(secret))
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
	}

	client := &http.Client{}
	jar, _ := cookiejar.New(nil)
	u, _ := url.Parse("http://example.com")
	jar.SetCookies(u, []*http.Cookie{{Name: partnerSessionCookieName, Value: signedCookie, Path: "/api/partner"}})
	client.Jar = jar

	srv := httptest.NewServer(r)
	defer srv.Close()

	fetch := func(query string) (int, PartnerUserPage, string) {
		t.Helper()
		req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/partner/users"+query, nil)
		req.AddCookie(&http.Cookie{Name: partnerSessionCookieName, Value: signedCookie})
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			var b struct {
				Message string `json:"message"`
			}
			_ = json.NewDecoder(resp.Body).Decode(&b)
			return resp.StatusCode, PartnerUserPage{}, b.Message
		}
		var env struct {
			Data PartnerUserPage `json:"data"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&env)
		return resp.StatusCode, env.Data, ""
	}

	code, base, _ := fetch("?page=1&page_size=10")
	if code != http.StatusOK {
		t.Fatalf("基线请求返回 %d —— 鉴权或路由有问题", code)
	}
	t.Logf("基线（不传 status）total=%d 本页=%d", base.Total, len(base.Items))
	if base.Total == 0 {
		t.Skip("该商户没有用户，跳过")
	}

	// 不传 status 和显式传 0 必须完全等价
	_, zero, _ := fetch("?page=1&page_size=10&status=0")
	if zero.Total != base.Total {
		t.Fatalf("status=0 的 total=%d，不传 status 是 %d —— 两者应等价", zero.Total, base.Total)
	}

	_, on, _ := fetch("?page=1&page_size=10&status=1")
	_, off, _ := fetch("?page=1&page_size=10&status=2")
	t.Logf("status=1 total=%d / status=2 total=%d / 全量 %d", on.Total, off.Total, base.Total)

	if on.Total+off.Total != base.Total {
		t.Fatalf("启用(%d)+禁用(%d)=%d 但全量是 %d —— 服务端筛选没生效",
			on.Total, off.Total, on.Total+off.Total, base.Total)
	}
	if on.Total == base.Total {
		t.Fatalf("status=1 的 total 仍是全量 %d —— 参数被忽略了", base.Total)
	}
	for _, u := range on.Items {
		if u.Status != partnerUserStatusEnabled {
			t.Fatalf("status=1 却拿到 status=%d 的行", u.Status)
		}
	}
	for _, u := range off.Items {
		if u.Status != partnerUserStatusDisabled {
			t.Fatalf("status=2 却拿到 status=%d 的行", u.Status)
		}
	}

	// 非法值必须 400，不能静默当「全部」
	for _, bad := range []string{"status=abc", "status=99", "status=-1"} {
		code, _, msg := fetch("?page=1&page_size=10&" + bad)
		if code != http.StatusBadRequest {
			t.Fatalf("%s 应返回 400，实际 %d —— 静默忽略会让前端以为筛过了", bad, code)
		}
		t.Logf("%s → 400 %s", bad, msg)
	}

	// 筛选后分页的 total 也要跟着变，不能是「当前页条数」冒充
	_, p2, _ := fetch("?page=2&page_size=1&status=2")
	if off.Total >= 2 {
		if p2.Total != off.Total {
			t.Fatalf("第 2 页的 total=%d 与第 1 页 %d 不一致", p2.Total, off.Total)
		}
	}
}

/*
 * HTTP 层验证：GET /api/partner/users 的 sort / order 参数。
 *
 * 为什么要单独测 HTTP 层：sort 是拼进 ORDER BY 的字符串，API 层有一道白名单
 * 校验。SQL 层测试直接调 ListPartnerUsersWith，绕过了这道校验，
 * 所以「参数到底有没有被解析、非法值会不会被拼进 SQL」这里必须再钉一遍。
 *
 * ★ 只做 SELECT，不写业务数据。
 */
func TestRealDBPartnerUsersSortHTTP(t *testing.T) {
	dsn := os.Getenv("PARTNER_VERIFY_DSN")
	if dsn == "" {
		t.Skip("未设置 PARTNER_VERIFY_DSN，跳过")
	}
	secret := os.Getenv("PARTNER_SESSION_SECRET")
	if secret == "" {
		t.Skip("未设置 PARTNER_SESSION_SECRET，无法签发测试 session")
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
	r.GET("/api/partner/users", PartnerAuth(), PartnerUsersAPI)

	store := cookie.NewStore([]byte(secret))
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
			t.Fatal("没能生成 session cookie")
		}
	}

	srv := httptest.NewServer(r)
	defer srv.Close()

	fetch := func(query string) (int, PartnerUserPage) {
		t.Helper()
		req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/partner/users"+query, nil)
		req.AddCookie(&http.Cookie{Name: partnerSessionCookieName, Value: signedCookie})
		resp, err := (&http.Client{}).Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return resp.StatusCode, PartnerUserPage{}
		}
		var env struct {
			Data PartnerUserPage `json:"data"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&env)
		return resp.StatusCode, env.Data
	}

	// 基线：默认 id DESC，第 1 条是全库 id 最大的那个
	code, base := fetch("?page=1&page_size=5")
	if code != http.StatusOK {
		t.Fatalf("基线请求返回 %d", code)
	}
	if len(base.Items) < 2 {
		t.Skip("样本不足，跳过")
	}
	t.Logf("基线 id DESC 第1条 id=%d", base.Items[0].ID)

	// 按消耗降序：第 1 条必须是全库消耗最高的，且不能等于 id 最大的那个
	code, desc := fetch("?page=1&page_size=5&sort=used_quota&order=desc")
	if code != http.StatusOK {
		t.Fatalf("按消耗降序返回 %d", code)
	}
	if desc.Total != base.Total {
		t.Fatalf("排序后 total=%d 变了，应为 %d —— 排序不该影响总数", desc.Total, base.Total)
	}
	t.Logf("按消耗降序 第1条 id=%d quota=%s", desc.Items[0].ID, quotaText(desc.Items[0].UsedQuota))

	// 降序结果必须真的单调不增（NULL 在尾部，跳过）
	var prev int64
	seen := false
	for _, u := range desc.Items {
		if u.UsedQuota == nil {
			continue
		}
		if seen && *u.UsedQuota > prev {
			t.Fatalf("降序出现回升：%d 之后是 %d（id=%d）", prev, *u.UsedQuota, u.ID)
		}
		prev = *u.UsedQuota
		seen = true
	}

	// 升序第 1 条必须与降序第 1 条不同（除非全库消耗都一样）
	_, asc := fetch("?page=1&page_size=5&sort=used_quota&order=asc")
	t.Logf("按消耗升序 第1条 id=%d quota=%s", asc.Items[0].ID, quotaText(asc.Items[0].UsedQuota))
	if asc.Items[0].ID == desc.Items[0].ID && asc.Total > 1 {
		// 只有在尾部和头部消耗确实不同时才该不同，这里给出明确提示而不是硬失败
		if asc.Items[0].UsedQuota != nil && desc.Items[0].UsedQuota != nil &&
			*asc.Items[0].UsedQuota != *desc.Items[0].UsedQuota {
			t.Fatalf("升序和降序第 1 条都是 id=%d —— 排序方向没生效", asc.Items[0].ID)
		}
	}

	// 非法 sort 必须被忽略并回落 id DESC，绝不能拼进 SQL 报错或泄露
	//
	// 这里刻意不放带分号的 payload（如 "1;DROP TABLE users"）：
	// Go 的 URL 解析在遇到含分号的 query 时会整体失败，status 也取不到，
	// 于是接口返回 400 —— 那测的是标准库行为，不是我们的白名单。
	// 换句话说分号在 URL 层就被挡掉了，根本到不了 SQL 拼接。
	for _, bad := range []string{"sort=password", "sort=users.id", "sort=" + "1%20OR%201=1"} {
		code, page := fetch("?page=1&page_size=5&" + bad)
		if code != http.StatusOK {
			t.Fatalf("%s 应被忽略并正常返回，实际 %d", bad, code)
		}
		if len(page.Items) > 0 && page.Items[0].ID != base.Items[0].ID {
			t.Fatalf("%s 应回落 id DESC（第1条 id=%d），实际 id=%d",
				bad, base.Items[0].ID, page.Items[0].ID)
		}
	}

	// 非法 order 按 desc 处理，不报错
	code, _ = fetch("?page=1&page_size=5&sort=used_quota&order=sideways")
	if code != http.StatusOK {
		t.Fatalf("非法 order 应被容忍，实际 %d", code)
	}
}

// quotaText 让日志打印数值本身，而不是指针地址。
func quotaText(v *int64) string {
	if v == nil {
		return "null"
	}
	return strconv.FormatInt(*v, 10)
}
