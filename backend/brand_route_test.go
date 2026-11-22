package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"partner/internal/common"
	"partner/internal/model"
)

/*
端到端验证：从真实路由 + 真实 session cookie 走到真实数据库。

重点是「路由有没有挂对」——单测里直接调 handler 函数是绕过 gin 的，
参数名写错（比如 :host 写成 :domain）、中间件顺序不对这类问题只有
走完整路由才会暴露。

需要 PARTNER_TEST_PG_DSN 才会跑；没有库时跳过，不污染常规测试。
全程只读，不写库。
*/
func TestPartnerBrandRouteEndToEnd(t *testing.T) {
	dsn := os.Getenv("PARTNER_TEST_PG_DSN")
	if dsn == "" {
		t.Skip("未设置 PARTNER_TEST_PG_DSN，跳过端到端验证")
	}
	t.Setenv("PARTNER_SESSION_SECRET", strings.Repeat("s", 40))
	common.SessionSecret = strings.Repeat("c", 32)

	db, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	model.DB, model.LOG_DB = db, db

	var merchant struct {
		ID             int64
		MerchantCode   string
		SessionVersion int64
	}
	if err := db.Table("lc_distribution_merchants").
		Select("id, merchant_code, partner_session_version AS session_version").
		Where("partner_login_enabled = ?", true).Order("id").Take(&merchant).Error; err != nil {
		t.Skipf("没有启用登录的商户：%v", err)
	}

	router := buildRouter()

	// 1) 未登录时四条品牌路由都必须拦住，一条都不能漏
	for _, route := range []struct{ method, path string }{
		{"GET", "/api/partner/brand"},
		{"PUT", "/api/partner/brand"},
		{"GET", "/api/partner/brand/domains"},
		{"POST", "/api/partner/brand/domains/localhost/check"},
	} {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(route.method, route.path, strings.NewReader("{}")))
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s 未登录时应 401，实际 %d：%s", route.method, route.path, w.Code, w.Body.String())
		}
	}

	// 2) 构造一个合法会话 cookie。
	//
	// 不走登录接口，是因为那需要商户真实密码——测试不该为了拿一个 cookie
	// 去改用户库里的密码。这里用同一个 cookie store 和同一个密钥自己签一个，
	// PartnerAuth 依旧会去库里核对 merchant_id 与 session_version，
	// 所以这条路径和真实登录之后的请求没有区别。
	cookie := loginAsMerchant(t, merchant.ID, merchant.SessionVersion)

	// 3) 带 cookie 读品牌：应拿到本商户的数据，且字段可解析
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/partner/brand", nil)
	req.AddCookie(cookie)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("已登录读取失败：%d %s", w.Code, w.Body.String())
	}
	var brandBody struct {
		Success bool `json:"success"`
		Data    struct {
			MerchantID   int64           `json:"merchant_id"`
			Name         string          `json:"name"`
			PrimaryColor string          `json:"primary_color"`
			Support      json.RawMessage `json:"support"`
			SiteDomain   *string         `json:"site_domain"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &brandBody); err != nil {
		t.Fatal(err)
	}
	if !brandBody.Success || brandBody.Data.MerchantID != merchant.ID {
		t.Fatalf("读到的不是本商户：%s", w.Body.String())
	}
	if brandBody.Data.Name == "" || brandBody.Data.PrimaryColor == "" {
		t.Fatalf("兜底字段缺失：%s", w.Body.String())
	}

	// 4) 域名列表
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/partner/brand/domains", nil)
	req.AddCookie(cookie)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("域名接口失败：%d %s", w.Code, w.Body.String())
	}

	// 5) 非法写入要 400 而不是 500
	w = httptest.NewRecorder()
	body := bytes.NewBufferString(`{"primary_color":"purple"}`)
	req = httptest.NewRequest(http.MethodPut, "/api/partner/brand", body)
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("非法品牌色应 400，实际 %d：%s", w.Code, w.Body.String())
	}

	// 6) NoRoute 对未知品牌子路径要返回 JSON，不能是 gin 默认的纯文本 404
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/partner/brand/unknown", nil)
	req.AddCookie(cookie)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound || !strings.Contains(w.Body.String(), "success") {
		t.Fatalf("未知子路径应返回 JSON 404，实际 %d：%s", w.Code, w.Body.String())
	}
}
