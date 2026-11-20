package partner

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"partner/internal/common"
	"partner/internal/model"
)

type PartnerTrendDay struct {
	SummaryDate      string  `json:"summary_date" gorm:"column:summary_date"`
	PromptTokens     int64   `json:"prompt_tokens" gorm:"column:prompt_tokens"`
	CompletionTokens int64   `json:"completion_tokens" gorm:"column:completion_tokens"`
	RequestCount     int64   `json:"request_count" gorm:"column:request_count"`
	Quota            int64   `json:"quota" gorm:"column:quota"`
	AmountCNY        float64 `json:"amount_cny" gorm:"-"`
}

// QueryPartnerDailyTrend mirrors the admin dashboard's 14 completed Shanghai days,
// while joining each summary row to the authenticated merchant's current users.
func QueryPartnerDailyTrend(merchantID int64, now time.Time) ([]PartnerTrendDay, error) {
	if merchantID <= 0 {
		return nil, errors.New("invalid merchant ID")
	}
	if model.LOG_DB == nil || model.DB == nil || model.LOG_DB != model.DB {
		return nil, errors.New("伙伴趋势需要日志与用户共用数据库")
	}
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return nil, err
	}
	localNow := now.In(loc)
	today := time.Date(localNow.Year(), localNow.Month(), localNow.Day(), 0, 0, 0, 0, loc)
	start := today.AddDate(0, 0, -14)
	end := today.AddDate(0, 0, -1)

	var rows []PartnerTrendDay
	err = model.LOG_DB.Table("lc_log_daily_summaries AS s").
		Joins("JOIN users ON users.id = s.user_id").
		Where("users.merchant_id = ? AND users.deleted_at IS NULL AND users.role IN ?", merchantID,
			[]int{common.RoleGuestUser, common.RoleCommonUser}).
		Where("s.summary_date >= ? AND s.summary_date <= ?", start.Format("2006-01-02"), end.Format("2006-01-02")).
		Select(`s.summary_date AS summary_date,
			COALESCE(SUM(s.prompt_tokens_sum), 0) AS prompt_tokens,
			COALESCE(SUM(s.completion_tokens_sum), 0) AS completion_tokens,
			COALESCE(SUM(s.request_count), 0) AS request_count,
			COALESCE(SUM(s.quota_sum), 0) AS quota`).
		Group("s.summary_date").Order("s.summary_date").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	byDay := make(map[string]PartnerTrendDay, len(rows))
	for _, row := range rows {
		if len(row.SummaryDate) >= 10 {
			row.SummaryDate = row.SummaryDate[:10]
			byDay[row.SummaryDate] = row
		}
	}
	points := make([]PartnerTrendDay, 0, 14)
	for day := start; !day.After(end); day = day.AddDate(0, 0, 1) {
		date := day.Format("2006-01-02")
		point := byDay[date]
		point.SummaryDate = date
		point.AmountCNY = partnerQuotaCNY(point.Quota)
		points = append(points, point)
	}
	return points, nil
}

// PartnerDailyTrendAPI GET /api/partner/daily-trend
func PartnerDailyTrendAPI(c *gin.Context) {
	merchantID := c.GetInt64("partner_merchant_id")
	points, err := QueryPartnerDailyTrend(merchantID, time.Now())
	if err != nil {
		partnerError(c, http.StatusInternalServerError, "查询调用趋势失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"items": points}})
}
