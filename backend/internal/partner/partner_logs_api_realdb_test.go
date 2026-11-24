package partner

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"partner/internal/model"
)

/*
端到端验证「用量明细」的筛选与分页 —— 走真实 HTTP handler，不是只调业务函数。

为什么这样做：页面上报的现象是「筛选已禁用、分页数据不更新」。
前面的 TestRealDBPartnerLogPagingAndFilter 已经证明业务函数本身是对的，
所以嫌疑集中在两层：① query 参数有没有被正确解析；② 返回值有没有正确序列化。
这个测试直接打 PartnerLogsAPI，把这两层一起覆盖。

★ 只做 SELECT，不写任何数据。
*/
func TestRealDBPartnerLogsAPIParamParsing(t *testing.T) {
	dsn := os.Getenv("PARTNER_VERIFY_DSN")
	if dsn == "" {
		t.Skip("未设置 PARTNER_VERIFY_DSN，跳过真实库验证")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	prevDB, prevLogDB := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() { model.DB, model.LOG_DB = prevDB, prevLogDB })

	gin.SetMode(gin.TestMode)

	call := func(query string) PartnerLogPage {
		t.Helper()
		r := gin.New()
		r.GET("/api/partner/logs", func(c *gin.Context) {
			c.Set("partner_merchant_id", int64(1))
			PartnerLogsAPI(c)
		})
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/partner/logs"+query, nil)
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("HTTP %d: %s", w.Code, w.Body.String())
		}
		var env struct {
			Success bool           `json:"success"`
			Data    PartnerLogPage `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
			t.Fatalf("解析响应失败: %v, body=%s", err, w.Body.String())
		}
		return env.Data
	}

	base := call("?page=1&page_size=10&all_history=1")
	t.Logf("基线: total=%d 本页=%d", base.Total, len(base.Items))
	if base.Total == 0 {
		t.Skip("无数据")
	}

	// ① 分页：翻页必须换数据
	pg2 := call("?page=2&page_size=10&all_history=1")
	if len(base.Items) > 0 && len(pg2.Items) > 0 && base.Items[0].ID == pg2.Items[0].ID {
		t.Errorf("分页失效：第1页与第2页首行相同 id=%d", base.Items[0].ID)
	} else if len(pg2.Items) > 0 {
		t.Logf("✓ 分页: p1[0].id=%d p2[0].id=%d", base.Items[0].ID, pg2.Items[0].ID)
	}

	// ② page_size 必须被尊重
	big := call("?page=1&page_size=50&all_history=1")
	t.Logf("page_size=50 → 实际返回 %d 行（total=%d）", len(big.Items), big.Total)
	if big.Total > 50 && len(big.Items) != 50 {
		t.Errorf("page_size=50 未生效，只返回 %d 行", len(big.Items))
	}

	// ③ type 筛选
	typed := call("?page=1&page_size=10&type=2&all_history=1")
	t.Logf("type=2 → total=%d（基线 %d）", typed.Total, base.Total)
	if typed.Total >= base.Total {
		t.Errorf("type=2 筛选未收窄: %d >= %d", typed.Total, base.Total)
	} else {
		t.Logf("✓ type 筛选生效")
	}

	// ④ 时间筛选（start_timestamp/end_timestamp，前端映射后的名字）
	if len(base.Items) > 0 {
		ts := base.Items[0].CreatedAt
		byTime := call("?page=1&page_size=10&start_timestamp=" + itoa(ts) + "&end_timestamp=" + itoa(ts+86400))
		t.Logf("时间区间 → total=%d（基线 %d）", byTime.Total, base.Total)
		if byTime.Total > base.Total {
			t.Errorf("时间筛选反而变多: %d > %d", byTime.Total, base.Total)
		} else {
			t.Logf("✓ 时间筛选生效")
		}
	}

	// ⑤ 关键：不传 all_history 时应默认只看今天，传了才看全部
	todayOnly := call("?page=1&page_size=10")
	t.Logf("不带 all_history（默认今天）→ total=%d（全量 %d）", todayOnly.Total, base.Total)
	if todayOnly.Total > base.Total {
		t.Errorf("今天的记录不可能多于全量: %d > %d", todayOnly.Total, base.Total)
	}

	// ⑥ 非法 type 必须被拒，不能静默忽略
	{
		r := gin.New()
		r.GET("/api/partner/logs", func(c *gin.Context) {
			c.Set("partner_merchant_id", int64(1))
			PartnerLogsAPI(c)
		})
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/partner/logs?type=999&all_history=1", nil))
		if w.Code != http.StatusBadRequest {
			t.Errorf("非法 type 应返回 400，实际 %d: %s", w.Code, w.Body.String())
		} else {
			t.Logf("✓ 非法 type 被拒 (400)")
		}
	}
}

func itoa(v int64) string {
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	var b []byte
	for v > 0 {
		b = append([]byte{byte('0' + v%10)}, b...)
		v /= 10
	}
	if neg {
		return "-" + string(b)
	}
	return string(b)
}

// 防止未使用的 import（sqlite 在另一个测试文件里用）
var _ = sqlite.Open
