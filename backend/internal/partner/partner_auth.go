package partner

import (
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"partner/internal/common"
	"partner/internal/model"
)

var codePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)

const partnerSessionCookieName = "lynxton_partner_session"

func clearLegacyPartnerCookies(c *gin.Context) {
	for _, path := range []string{"/api/partner", "/"} {
		http.SetCookie(c.Writer, &http.Cookie{
			Name: "partner_session", Value: "", Path: path, MaxAge: -1,
			HttpOnly: true, Secure: os.Getenv("SESSION_COOKIE_SECURE") == "true",
			SameSite: http.SameSiteStrictMode,
		})
	}
}

// PartnerSession keeps the partner cookie separate from the platform admin cookie.
func PartnerSession() gin.HandlerFunc {
	secret := os.Getenv("PARTNER_SESSION_SECRET")
	if secret == "" {
		sum := sha256.Sum256([]byte("lynxtonapi-partner-session:" + common.SessionSecret))
		secret = base64.RawURLEncoding.EncodeToString(sum[:])
	}
	store := cookie.NewStore([]byte(secret))
	store.Options(sessions.Options{
		Path: "/api/partner", MaxAge: 604800, HttpOnly: true,
		Secure: os.Getenv("SESSION_COOKIE_SECURE") == "true", SameSite: http.SameSiteStrictMode,
	})
	return sessions.Sessions(partnerSessionCookieName, store)
}

func partnerError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"success": false, "message": message})
}

type partnerLoginInput struct {
	MerchantCode string `json:"merchant_code"`
	Password     string `json:"password"`
}

func PartnerLoginAPI(c *gin.Context) {
	var input partnerLoginInput
	if err := c.ShouldBindJSON(&input); err != nil || !codePattern.MatchString(strings.TrimSpace(input.MerchantCode)) || input.Password == "" || len(input.Password) > 72 {
		partnerError(c, http.StatusBadRequest, "请输入商户编码和密码")
		return
	}
	var merchant Merchant
	err := model.DB.Select("id, merchant_name, merchant_code, partner_password_hash, partner_login_enabled, partner_password_change_required, partner_session_version").Where("merchant_code = ?", strings.TrimSpace(input.MerchantCode)).First(&merchant).Error
	// Keep unknown, disabled and wrong-password responses indistinguishable.
	if err != nil || !merchant.PartnerLoginEnabled || merchant.PartnerPasswordHash == nil || !common.ValidatePasswordAndHash(input.Password, *merchant.PartnerPasswordHash) {
		partnerError(c, http.StatusUnauthorized, "商户编码或密码错误")
		return
	}
	session := sessions.Default(c)
	session.Clear()
	session.Set("merchant_id", merchant.ID)
	session.Set("partner_session_version", merchant.PartnerSessionVersion)
	if err := session.Save(); err != nil {
		partnerError(c, http.StatusInternalServerError, "保存登录状态失败")
		return
	}
	clearLegacyPartnerCookies(c)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": partnerInfo(&merchant)})
}

func partnerInfo(merchant *Merchant) gin.H {
	return gin.H{"merchant_id": merchant.ID, "merchant_name": merchant.MerchantName,
		"merchant_code": merchant.MerchantCode, "password_change_required": merchant.PartnerPasswordChangeRequired}
}

// PartnerAuth reloads the merchant on every request so disabling or resetting login revokes old sessions.
func PartnerAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		session := sessions.Default(c)
		id, okID := session.Get("merchant_id").(int64)
		version, okVersion := session.Get("partner_session_version").(int64)
		if !okID || !okVersion || id <= 0 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"success": false, "message": "请登录伙伴后台"})
			return
		}
		var merchant Merchant
		if err := model.DB.Select("id, merchant_name, merchant_code, partner_login_enabled, partner_password_change_required, partner_session_version").First(&merchant, id).Error; err != nil || !merchant.PartnerLoginEnabled || merchant.PartnerSessionVersion != version {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"success": false, "message": "伙伴登录状态已失效"})
			return
		}
		c.Set("partner_merchant_id", merchant.ID)
		c.Set("partner_merchant", &merchant)
		c.Next()
	}
}

func PartnerReady() gin.HandlerFunc {
	return func(c *gin.Context) {
		merchant := c.MustGet("partner_merchant").(*Merchant)
		if merchant.PartnerPasswordChangeRequired {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"success": false, "message": "请先修改初始密码"})
			return
		}
		c.Next()
	}
}

func PartnerMeAPI(c *gin.Context) {
	merchant := c.MustGet("partner_merchant").(*Merchant)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": partnerInfo(merchant)})
}

func PartnerLogoutAPI(c *gin.Context) {
	session := sessions.Default(c)
	session.Clear()
	session.Options(sessions.Options{Path: "/api/partner", MaxAge: -1, HttpOnly: true,
		Secure: os.Getenv("SESSION_COOKIE_SECURE") == "true", SameSite: http.SameSiteStrictMode})
	if err := session.Save(); err != nil {
		partnerError(c, http.StatusInternalServerError, "退出登录失败")
		return
	}
	clearLegacyPartnerCookies(c)
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func PartnerChangePasswordAPI(c *gin.Context) {
	var input struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || len(input.NewPassword) < 12 || len(input.NewPassword) > 72 || input.CurrentPassword == input.NewPassword {
		partnerError(c, http.StatusBadRequest, "新密码须为 12 到 72 个字符，且不能与旧密码相同")
		return
	}
	merchant := c.MustGet("partner_merchant").(*Merchant)
	var stored Merchant
	if err := model.DB.Select("id, partner_password_hash").First(&stored, merchant.ID).Error; err != nil || stored.PartnerPasswordHash == nil || !common.ValidatePasswordAndHash(input.CurrentPassword, *stored.PartnerPasswordHash) {
		partnerError(c, http.StatusBadRequest, "当前密码错误")
		return
	}
	hash, err := common.Password2Hash(input.NewPassword)
	if err != nil {
		partnerError(c, http.StatusInternalServerError, "修改密码失败")
		return
	}
	result := model.DB.Model(&Merchant{}).Where("id = ? AND partner_session_version = ?", merchant.ID, merchant.PartnerSessionVersion).Updates(map[string]any{
		"partner_password_hash": hash, "partner_password_change_required": false,
		"partner_session_version": gorm.Expr("partner_session_version + 1"), "updated_at": time.Now(),
	})
	if result.Error != nil || result.RowsAffected != 1 {
		partnerError(c, http.StatusConflict, "登录状态已变化，请重新登录")
		return
	}
	session := sessions.Default(c)
	session.Set("partner_session_version", merchant.PartnerSessionVersion+1)
	if err := session.Save(); err != nil {
		partnerError(c, http.StatusInternalServerError, "保存登录状态失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
