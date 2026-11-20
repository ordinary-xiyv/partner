package main

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"partner/internal/common"
	"partner/internal/model"
	"partner/internal/partner"
)

func openDatabase(dsn string) (*gorm.DB, error) {
	if dsn == "" {
		return nil, errors.New("SQL_DSN is required")
	}
	if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		return gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	}
	if !strings.Contains(dsn, "parseTime=") {
		if strings.Contains(dsn, "?") {
			dsn += "&parseTime=true"
		} else {
			dsn += "?parseTime=true"
		}
	}
	return gorm.Open(mysql.Open(dsn), &gorm.Config{})
}

type loginWindow struct {
	count int
	start time.Time
}

func loginLimit() gin.HandlerFunc {
	var mu sync.Mutex
	hits := map[string]loginWindow{}
	return func(c *gin.Context) {
		ip := c.ClientIP()
		now := time.Now()
		mu.Lock()
		w := hits[ip]
		if now.Sub(w.start) >= time.Minute {
			w = loginWindow{start: now}
		}
		w.count++
		hits[ip] = w
		if len(hits) > 10000 {
			for k, v := range hits {
				if now.Sub(v.start) > time.Minute {
					delete(hits, k)
				}
			}
		}
		limited := w.count > 10
		mu.Unlock()
		if limited {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"success": false, "message": "登录尝试过于频繁，请稍后再试"})
			return
		}
		c.Next()
	}
}

func buildRouter() *gin.Engine {
	r := gin.New()
	_ = r.SetTrustedProxies(nil)
	r.Use(gin.Logger(), gin.Recovery())
	r.GET("/healthz", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })
	p := r.Group("/api/partner")
	p.Use(func(c *gin.Context) { c.Header("Cache-Control", "no-store"); c.Header("Pragma", "no-cache"); c.Next() }, partner.PartnerSession())
	p.POST("/login", loginLimit(), partner.PartnerLoginAPI)
	p.POST("/logout", partner.PartnerLogoutAPI)
	auth := p.Group("")
	auth.Use(partner.PartnerAuth())
	auth.GET("/me", partner.PartnerMeAPI)
	auth.POST("/password", loginLimit(), partner.PartnerChangePasswordAPI)
	ready := auth.Group("")
	ready.Use(partner.PartnerReady())
	ready.GET("/users", partner.PartnerUsersAPI)
	ready.GET("/logs", partner.PartnerLogsAPI)
	ready.GET("/daily-trend", partner.PartnerDailyTrendAPI)
	ready.GET("/billing/summary", partner.PartnerBillingSummaryAPI)
	r.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/partner") {
			c.Header("Cache-Control", "no-store")
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "接口不存在"})
			return
		}
		c.Status(http.StatusNotFound)
	})
	return r
}

func main() {
	secret := os.Getenv("PARTNER_SESSION_SECRET")
	if secret == "" {
		log.Fatal("PARTNER_SESSION_SECRET is required")
	}
	if len(secret) < 32 {
		log.Fatal("PARTNER_SESSION_SECRET must contain at least 32 characters")
	}
	common.SessionSecret = os.Getenv("SESSION_SECRET")
	if common.SessionSecret == "" {
		buf := make([]byte, 32)
		if _, err := rand.Read(buf); err != nil {
			log.Fatal(err)
		}
		common.SessionSecret = base64.RawURLEncoding.EncodeToString(buf)
	}
	db, err := openDatabase(os.Getenv("SQL_DSN"))
	if err != nil {
		log.Fatal(err)
	}
	model.DB = db
	model.LOG_DB = db
	common.PublicModelNameMapper = common.PublicNameForModelID
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatal(err)
	}
	if err := sqlDB.Ping(); err != nil {
		log.Fatal(err)
	}
	addr := os.Getenv("PARTNER_LISTEN_ADDRESS")
	if addr == "" {
		addr = "127.0.0.1:3004"
	}
	server := &http.Server{Addr: addr, Handler: buildRouter(), ReadHeaderTimeout: 10 * time.Second}
	log.Printf("partner backend listening on %s", addr)
	log.Fatal(server.ListenAndServe())
}
