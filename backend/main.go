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
	// CLB 等内网入口透传 X-Forwarded-For，信任内网网段才能拿到真实客户端 IP（登录限流按 IP 计数）
	_ = r.SetTrustedProxies([]string{"10.0.0.0/8"})
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
	/*
	 * 品牌白标：读写 lc_distribution_merchants 的 brand_* 列。
	 * 这张表同时被 lynxtonapi 的站点身份体系（siteauth）使用，所以这里写进去的
	 * 值就是客户站按站点身份读出来的那一份 —— 两个平台共用一份数据，不各存一套。
	 */
	ready.GET("/brand", partner.MerchantBrandAPI)
	ready.PUT("/brand", partner.MerchantBrandUpdateAPI)
	ready.GET("/brand/domains", partner.MerchantDomainsAPI)
	ready.POST("/brand/domains/:host/check", partner.MerchantDomainCheckAPI)
	/*
	 * 品牌图片上传：multipart 提交，图片经本服务中转写入对象存储，
	 * 写完直接落库，一次请求完成「传图 + 改配置」。
	 *
	 * 不走浏览器直传，是因为共用的那个 bucket 没开 CORS，
	 * 跨域 PUT 会在预检阶段被拦（详见 internal/partner/partner_brand_upload.go）。
	 */
	ready.POST("/brand/upload", partner.BrandUploadAPI)
	/*
	 * 文档中心（管理侧）。
	 *
	 * 数据存在伙伴自己的 lc_partner_doc_* 表里，按 site_id 隔离 ——
	 * 每个分销商站点有自己独立的文档，改不到别人的。
	 *
	 * 为什么不复用主站的 lc_doc_* 表：那两张表的 slug 是全局唯一索引，
	 * 第二个站点想建同名分类就会撞键，改成联合唯一等于动主站库结构。
	 * 详见 internal/partner/doc_model.go 顶部的说明。
	 */
	ready.GET("/docs/tree", partner.AdminDocTreeAPI)
	ready.POST("/docs/categories", partner.AdminDocCategoryCreateAPI)
	ready.PUT("/docs/categories/reorder", partner.AdminDocCategoryReorderAPI)
	ready.PUT("/docs/categories/:id", partner.AdminDocCategoryUpdateAPI)
	ready.DELETE("/docs/categories/:id", partner.AdminDocCategoryDeleteAPI)
	ready.POST("/docs/articles", partner.AdminDocArticleCreateAPI)
	ready.PUT("/docs/articles/reorder", partner.AdminDocArticleReorderAPI)
	ready.GET("/docs/articles/:id", partner.AdminDocArticleGetAPI)
	ready.PUT("/docs/articles/:id", partner.AdminDocArticleUpdateAPI)
	ready.DELETE("/docs/articles/:id", partner.AdminDocArticleDeleteAPI)
	/*
	 * 客户站按站点身份读品牌 —— 唯一一条不需要登录的 /api/partner 接口。
	 *
	 * 必须挂在 p（只做 no-store 头）而不是 auth 组：客户站页面是匿名访问的，
	 * 要求它带伙伴后台的 session cookie 等于这条路根本走不通。
	 * 它的鉴权靠三个站点身份头（X-Site-ID / X-Site-Host / X-Site-Credential），
	 * 由 nginx 在服务端注入，不走 cookie。
	 */
	p.GET("/public/site-brand", partner.PublicSiteBrandAPI)
	/*
	 * 文档中心（公网侧）：客户站页面匿名来读。
	 *
	 * 和 site-brand 一样挂在 p 组下 —— 访客没登录伙伴后台，
	 * 要求 session cookie 这条路就走不通。鉴权靠三个站点身份头，
	 * 由 nginx 在服务端注入，所以每个站点只会读到自己的文档。
	 */
	p.GET("/public/docs/tree", partner.PublicDocTreeAPI)
	p.GET("/public/docs/articles/:slug", partner.PublicDocArticleAPI)
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
	/*
	 * 分销商文档表。
	 *
	 * 这个服务没有迁移框架，文档功能又是后加的，所以启动时补一次建表。
	 * 失败不阻断启动：生产环境的应用账号常常没有 DDL 权限，表已由
	 * doc_tables.sql 预先建好，此时「建表失败」是预期内的，不该让整个
	 * 服务起不来。函数内部已 log，接口层还有 DocTablesReady 做兜底判断。
	 */
	_ = partner.EnsurePartnerDocTables()
	addr := os.Getenv("PARTNER_LISTEN_ADDRESS")
	if addr == "" {
		addr = "127.0.0.1:3004"
	}
	server := &http.Server{Addr: addr, Handler: buildRouter(), ReadHeaderTimeout: 10 * time.Second}
	log.Printf("partner backend listening on %s", addr)
	log.Fatal(server.ListenAndServe())
}
