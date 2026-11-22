package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
)

/*
loginAsMerchant 自己签一个伙伴会话 cookie。

为什么不调登录接口：那需要商户真实密码，而测试不该为了拿一个 cookie
去改用户数据库里的密码。这里复用生产代码完全相同的 cookie store 配置
（同样的密钥派生、同样的 cookie 名、同样的 Path），PartnerAuth 收到之后
仍会去库里核对 merchant_id 和 partner_session_version —— 所以这就是
「真实登录之后」的那个请求，只差密码校验这一步，而那一步已有独立测试。
*/
func loginAsMerchant(t *testing.T, merchantID, sessionVersion int64) *http.Cookie {
	t.Helper()
	gin.SetMode(gin.TestMode)
	secret := os.Getenv("PARTNER_SESSION_SECRET")
	store := cookie.NewStore([]byte(secret))
	store.Options(sessions.Options{
		Path: "/api/partner", MaxAge: 604800, HttpOnly: true,
		Secure: false, SameSite: http.SameSiteStrictMode,
	})

	engine := gin.New()
	engine.Use(sessions.Sessions("lynxton_partner_session", store))
	engine.GET("/seed", func(c *gin.Context) {
		session := sessions.Default(c)
		session.Set("merchant_id", merchantID)
		session.Set("partner_session_version", sessionVersion)
		if err := session.Save(); err != nil {
			t.Fatalf("保存会话失败：%v", err)
		}
		c.Status(http.StatusOK)
	})

	w := httptest.NewRecorder()
	engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/seed", nil))
	for _, c := range w.Result().Cookies() {
		if c.Name == "lynxton_partner_session" {
			// 显式给一个有效期，避免 cookie 因为零值被当成会话 cookie 丢掉
			c.Expires = time.Now().Add(time.Hour)
			return c
		}
	}
	t.Fatalf("没有拿到会话 cookie，响应头：%v", w.Header())
	return nil
}
