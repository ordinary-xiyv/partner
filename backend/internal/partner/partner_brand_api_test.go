package partner

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

/*
HTTP 层测试：验证请求体/响应体的形状和参数校验，不依赖真实登录。

会话由这里手动注入（直接 c.Set("partner_merchant_id")），跳过 PartnerAuth —
鉴权本身已有自己的测试，这里要验的是「接口收到什么样的 JSON 会返回什么」。
*/
func brandRouter(merchantID int64) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	group := r.Group("/api/partner")
	group.Use(func(c *gin.Context) {
		c.Set("partner_merchant_id", merchantID)
		c.Next()
	})
	group.GET("/brand", MerchantBrandAPI)
	group.PUT("/brand", MerchantBrandUpdateAPI)
	group.GET("/brand/domains", MerchantDomainsAPI)
	group.POST("/brand/domains/:host/check", MerchantDomainCheckAPI)
	return r
}

func doBrandRequest(r *gin.Engine, method, path, body string) *httptest.ResponseRecorder {
	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader("")
	} else {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// 响应必须是 { success, data } 的形状 —— 前端 request() 只从 data 里取值，
// 少包一层会让页面拿到 undefined 却不报错。
func TestBrandAPIResponseShape(t *testing.T) {
	setupBrandDB(t)
	w := doBrandRequest(brandRouter(1), "GET", "/api/partner/brand", "")
	if w.Code != http.StatusOK {
		t.Fatalf("状态码 %d，body=%s", w.Code, w.Body.String())
	}
	var body struct {
		Success bool          `json:"success"`
		Data    MerchantBrand `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if !body.Success {
		t.Fatalf("success 应为 true：%s", w.Body.String())
	}
	if body.Data.MerchantID != 1 || body.Data.Name != "自运营平台" {
		t.Fatalf("返回内容不对：%+v", body.Data)
	}
	if body.Data.PrimaryColor == "" {
		t.Fatal("主色不应为空，前端会拿它直接上色")
	}
}

func TestBrandUpdateAPIPartialPatch(t *testing.T) {
	setupBrandDB(t)
	r := brandRouter(1)

	w := doBrandRequest(r, "PUT", "/api/partner/brand", `{"name":"云启智能","primary_color":"#16a34a"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("首次保存失败：%d %s", w.Code, w.Body.String())
	}

	// 第二次只改标题，不该动上一轮存进去的品牌名和主色
	w = doBrandRequest(r, "PUT", "/api/partner/brand", `{"page_title":"云启智能 · 控制台"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("二次保存失败：%d %s", w.Code, w.Body.String())
	}
	var body struct {
		Data MerchantBrand `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Data.Name != "云启智能" || body.Data.PrimaryColor != "#16a34a" {
		t.Fatalf("未提交的字段被覆盖：%+v", body.Data)
	}
	if body.Data.PageTitle != "云启智能 · 控制台" {
		t.Fatalf("标题没保存：%q", body.Data.PageTitle)
	}
}

// 非法输入要 400 且带可读中文提示，而不是 500。
// 500 在前端会被当成「服务挂了」，用户不会想到是自己填错了颜色。
func TestBrandUpdateAPIValidationStatus(t *testing.T) {
	setupBrandDB(t)
	cases := []struct{ name, body string }{
		{"空品牌名", `{"name":"   "}`},
		{"非法品牌色", `{"primary_color":"not-a-color"}`},
		{"客服信息非对象", `{"support":[]}`},
		{"字段超长", `{"tagline":"` + strings.Repeat("长", 300) + `"}`},
	}
	for _, tc := range cases {
		w := doBrandRequest(brandRouter(1), "PUT", "/api/partner/brand", tc.body)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("%s 应返回 400，实际 %d：%s", tc.name, w.Code, w.Body.String())
		}
		var body struct {
			Success bool   `json:"success"`
			Message string `json:"message"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if body.Success || body.Message == "" {
			t.Fatalf("%s 的错误响应不完整：%s", tc.name, w.Body.String())
		}
	}
}

// 域名接口返回数组（不是 envelope 里的对象），前端 map 一下就能用。
func TestBrandDomainsAPI(t *testing.T) {
	setupBrandDB(t)
	w := doBrandRequest(brandRouter(1), "GET", "/api/partner/brand/domains", "")
	if w.Code != http.StatusOK {
		t.Fatalf("状态码 %d", w.Code)
	}
	var body struct {
		Data []PartnerDomain `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Data) != 1 || body.Data[0].Host != "localhost" {
		t.Fatalf("域名列表不对：%+v", body.Data)
	}
	if body.Data[0].Status != "active" {
		t.Fatalf("已绑定域名应为 active，得到 %q", body.Data[0].Status)
	}

	// 没绑定域名的商户应拿到空数组而不是 null，前端才不用判空
	w = doBrandRequest(brandRouter(2), "GET", "/api/partner/brand/domains", "")
	var empty struct {
		Data []PartnerDomain `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &empty); err != nil {
		t.Fatal(err)
	}
	if empty.Data == nil || len(empty.Data) != 0 {
		t.Fatalf("未绑定域名应返回空数组，得到 %s", w.Body.String())
	}
}

// 只接受自己绑定的那个域名，别家的域名要拒绝 —— 否则这个接口就成了
// 「任意域名是否存在的探测工具」。
func TestBrandDomainCheckRejectsForeignHost(t *testing.T) {
	setupBrandDB(t)
	if w := doBrandRequest(brandRouter(1), "POST", "/api/partner/brand/domains/localhost/check", ""); w.Code != http.StatusOK {
		t.Fatalf("自己的域名应通过：%d %s", w.Code, w.Body.String())
	}
	if w := doBrandRequest(brandRouter(1), "POST", "/api/partner/brand/domains/other.example.com/check", ""); w.Code != http.StatusBadRequest {
		t.Fatalf("别家域名应被拒绝：%d %s", w.Code, w.Body.String())
	}
	// 大小写不该影响匹配
	if w := doBrandRequest(brandRouter(1), "POST", "/api/partner/brand/domains/LOCALHOST/check", ""); w.Code != http.StatusOK {
		t.Fatalf("域名匹配应忽略大小写：%d %s", w.Code, w.Body.String())
	}
}
