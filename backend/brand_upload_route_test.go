package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"strings"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"partner/internal/common"
	"partner/internal/model"
)

/*
端到端验证品牌图上传：真实路由 → 真实 session → 真实数据库 → 真实对象存储。

为什么值得单独写一条：
上传这条链路上有四个地方能静默出错，而且都不会在单测里暴露 ——
 1. multipart 的字段名（前端 append 的是 "file"/"target"，后端读的也必须是）
 2. Content-Type 的传递（上限、类型白名单都依赖它）
 3. 写完对象后有没有真的把 URL 落进 brand_* 列
 4. 落库后返回的品牌是不是最新的一份

这四点任何一处错了，页面上的表现都是「点了上传，什么都没发生」。

副作用必须能收回，所以：

	· 写库包在事务里，断言完主动回滚
	· 传上去的对象在 cleanup 里删掉（从返回的 URL 反推对象键）

需要 PARTNER_TEST_PG_DSN 和 PARTNER_TEST_UPLOAD_LIVE=1 才会跑。
*/
func TestBrandUploadRouteEndToEnd(t *testing.T) {
	if os.Getenv("PARTNER_TEST_UPLOAD_LIVE") != "1" {
		t.Skip("未设置 PARTNER_TEST_UPLOAD_LIVE=1，跳过真实上传")
	}
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
		SessionVersion int64
	}
	if err := db.Table("lc_distribution_merchants").
		Select("id, partner_session_version AS session_version").
		Where("partner_login_enabled = ?", true).Order("id").Take(&merchant).Error; err != nil {
		t.Skipf("没有启用登录的商户：%v", err)
	}
	cookie := loginAsMerchant(t, merchant.ID, merchant.SessionVersion)

	// 造一张 1x1 的 PNG
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, color.RGBA{R: 109, G: 81, B: 254, A: 255})
	var pngBuf bytes.Buffer
	if err := png.Encode(&pngBuf, img); err != nil {
		t.Fatal(err)
	}

	buildRequest := func(target, filename string, payload []byte, declaredType string) *http.Request {
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		if target != "" {
			if err := writer.WriteField("target", target); err != nil {
				t.Fatal(err)
			}
		}
		/*
		 * 用 CreatePart 而不是 CreateFormFile。
		 *
		 * CreateFormFile 会把每一段的 Content-Type 硬编码成
		 * application/octet-stream，后端按类型白名单判断时会直接拒掉 ——
		 * 那样这个测试测的就不是真实前端的行为了。浏览器上传 File 时
		 * 会带上文件自己的 MIME，这里要还原成一样的形状。
		 */
		header := textproto.MIMEHeader{}
		header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename="%s"`, filename))
		if declaredType != "" {
			header.Set("Content-Type", declaredType)
		}
		part, err := writer.CreatePart(header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(payload); err != nil {
			t.Fatal(err)
		}
		if err := writer.Close(); err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodPost, "/api/partner/brand/upload", &body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.AddCookie(cookie)
		return req
	}

	// 1) 未登录必须被拦
	w := httptest.NewRecorder()
	unauthReq := buildRequest("logo_url", "logo.png", pngBuf.Bytes(), "image/png")
	unauthReq.Header.Del("Cookie")
	buildRouter().ServeHTTP(w, unauthReq)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("未登录上传应 401，实际 %d：%s", w.Code, w.Body.String())
	}

	// 2) 伪装成 PNG 的 HTML 必须在写对象之前就被拒
	w = httptest.NewRecorder()
	buildRouter().ServeHTTP(w, buildRequest("logo_url", "evil.png", []byte("<html><script>alert(1)</script></html>"), "image/png"))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("伪装图片应 400，实际 %d：%s", w.Code, w.Body.String())
	}

	// 3) 非法 target 要 400，而不是默默写到 logo 上
	w = httptest.NewRecorder()
	buildRouter().ServeHTTP(w, buildRequest("brand_logo", "logo.png", pngBuf.Bytes(), "image/png"))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("非法 target 应 400，实际 %d：%s", w.Code, w.Body.String())
	}

	// 4) 真实上传：包事务，断言后回滚
	var publicURL string
	errRollback := fmt.Errorf("rollback after assertions")
	txErr := db.Transaction(func(tx *gorm.DB) error {
		previousDB := model.DB
		model.DB = tx
		defer func() { model.DB = previousDB }()

		w := httptest.NewRecorder()
		buildRouter().ServeHTTP(w, buildRequest("favicon_url", "test-favicon.png", pngBuf.Bytes(), "image/png"))
		if w.Code != http.StatusOK {
			t.Fatalf("上传失败：%d %s", w.Code, w.Body.String())
		}
		var resp struct {
			Success bool `json:"success"`
			Data    struct {
				FaviconURL string `json:"favicon_url"`
				LogoURL    string `json:"logo_url"`
				Name       string `json:"name"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatal(err)
		}
		if !resp.Success || resp.Data.FaviconURL == "" {
			t.Fatalf("响应里没有 favicon_url：%s", w.Body.String())
		}
		if resp.Data.Name == "" {
			t.Fatalf("响应里的品牌名不该为空：%s", w.Body.String())
		}
		publicURL = resp.Data.FaviconURL

		// 落库确认：再读一次，favicon 必须已经是新的
		w2 := httptest.NewRecorder()
		req2 := httptest.NewRequest(http.MethodGet, "/api/partner/brand", nil)
		req2.AddCookie(cookie)
		buildRouter().ServeHTTP(w2, req2)
		if w2.Code != http.StatusOK {
			t.Fatalf("上传后读品牌失败：%d %s", w2.Code, w2.Body.String())
		}
		var readBack struct {
			Data struct {
				FaviconURL string `json:"favicon_url"`
			} `json:"data"`
		}
		if err := json.Unmarshal(w2.Body.Bytes(), &readBack); err != nil {
			t.Fatal(err)
		}
		if readBack.Data.FaviconURL != publicURL {
			t.Fatalf("库里的 favicon 与返回的不一致：\n  db=%s\n  res=%s", readBack.Data.FaviconURL, publicURL)
		}
		t.Logf("上传成功，favicon_url=%s", publicURL)
		return errRollback
	})
	if txErr != errRollback {
		t.Fatalf("事务应以回滚结束，实际：%v", txErr)
	}

	// 5) 收尾：删掉刚才写进桶里的对象
	if publicURL == "" {
		t.Fatal("没有拿到上传地址，无法清理")
	}
	t.Logf("对象已上传，请确认公网可读：%s", publicURL)
	t.Cleanup(func() {
		if err := deleteObjectByURL(publicURL); err != nil {
			t.Logf("清理未完成（请手工删除）：%v", err)
		} else {
			t.Logf("已清理 %s", publicURL)
		}
	})
}
