package partner

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"partner/internal/common"
	"partner/internal/model"
)

var (
	errInvalidPartnerBillingRange = errors.New("账单日期范围无效，最多查询 93 天")
	errPartnerBillingSeparateDB   = errors.New("伙伴账单需要日志与用户共用数据库")
)

type PartnerBillingUser struct {
	UserID       int64   `json:"user_id" gorm:"column:user_id"`
	Username     string  `json:"username" gorm:"column:username"`
	Deleted      bool    `json:"deleted" gorm:"column:deleted"`
	RequestCount int64   `json:"request_count" gorm:"column:request_count"`
	Quota        int64   `json:"quota" gorm:"column:quota"`
	AmountUSD    float64 `json:"amount_usd" gorm:"-"`
	AmountCNY    float64 `json:"amount_cny" gorm:"-"`
}

type PartnerBillingSummary struct {
	StartDate      string               `json:"start_date"`
	EndDate        string               `json:"end_date"`
	TotalUsers     int                  `json:"total_users"`
	TotalRequests  int64                `json:"total_requests"`
	TotalQuota     int64                `json:"total_quota"`
	TotalAmountUSD float64              `json:"total_amount_usd"`
	TotalAmountCNY float64              `json:"total_amount_cny"`
	QuotaPerUnit   float64              `json:"quota_per_unit"`
	Items          []PartnerBillingUser `json:"items"`
	Page           int                  `json:"page"`
	PageSize       int                  `json:"page_size"`
}

func partnerBillingDates(startStr, endStr string, now time.Time) (time.Time, time.Time, error) {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	localNow := now.In(loc)
	today := time.Date(localNow.Year(), localNow.Month(), localNow.Day(), 0, 0, 0, 0, loc)
	if startStr == "" && endStr == "" {
		return time.Date(today.Year(), today.Month(), 1, 0, 0, 0, 0, loc), today, nil
	}
	if startStr == "" || endStr == "" {
		return time.Time{}, time.Time{}, errInvalidPartnerBillingRange
	}
	start, err := time.ParseInLocation("2006-01-02", startStr, loc)
	if err != nil || start.Format("2006-01-02") != startStr {
		return time.Time{}, time.Time{}, errInvalidPartnerBillingRange
	}
	end, err := time.ParseInLocation("2006-01-02", endStr, loc)
	if err != nil || end.Format("2006-01-02") != endStr || end.Before(start) || end.After(today) || end.Sub(start) >= 93*24*time.Hour {
		return time.Time{}, time.Time{}, errInvalidPartnerBillingRange
	}
	return start, end, nil
}

// QueryPartnerBillingSummary uses the same net-consumption rule as the user billing page:
// consumption/precharge/additional charge add quota; refunds subtract quota.
// The date range is bounded, and both totals and rows come from one merchant-scoped query.
func QueryPartnerBillingSummary(merchantID int64, startStr, endStr string, page, pageSize int, now time.Time) (PartnerBillingSummary, error) {
	if merchantID <= 0 {
		return PartnerBillingSummary{}, errors.New("invalid merchant ID")
	}
	if model.DB == nil || model.LOG_DB == nil || model.DB != model.LOG_DB {
		return PartnerBillingSummary{}, errPartnerBillingSeparateDB
	}
	start, end, err := partnerBillingDates(startStr, endStr, now)
	if err != nil {
		return PartnerBillingSummary{}, err
	}
	if page < 1 {
		page = 1
	}
	if page > 1000000 {
		page = 1000000
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	result := PartnerBillingSummary{
		StartDate: start.Format("2006-01-02"), EndDate: end.Format("2006-01-02"),
		QuotaPerUnit: common.QuotaPerUnit, Items: make([]PartnerBillingUser, 0),
		Page: page, PageSize: pageSize,
	}
	var rows []PartnerBillingUser
	err = model.LOG_DB.Table("logs").
		Joins("JOIN users ON users.id = logs.user_id").
		Where("users.merchant_id = ? AND users.role IN ?", merchantID,
			[]int{common.RoleGuestUser, common.RoleCommonUser}).
		Where("logs.type IN ? AND logs.created_at >= ? AND logs.created_at < ?",
			[]int{model.LogTypeConsume, model.LogTypeRefund, model.LogTypePreConsume, model.LogTypeAdditionalCharge},
			start.Unix(), end.AddDate(0, 0, 1).Unix()).
		Select(`logs.user_id AS user_id, MAX(users.username) AS username,
			MAX(CASE WHEN users.deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted,
			COALESCE(SUM(CASE WHEN logs.type IN (?, ?) THEN 1 ELSE 0 END), 0) AS request_count,
			COALESCE(SUM(CASE WHEN logs.type IN (?, ?, ?) THEN logs.quota WHEN logs.type = ? THEN -logs.quota ELSE 0 END), 0) AS quota`,
			model.LogTypeConsume, model.LogTypePreConsume,
			model.LogTypeConsume, model.LogTypePreConsume, model.LogTypeAdditionalCharge, model.LogTypeRefund).
		Group("logs.user_id").Order("quota DESC, logs.user_id ASC").Scan(&rows).Error
	if err != nil {
		return PartnerBillingSummary{}, err
	}
	result.TotalUsers = len(rows)
	for i := range rows {
		rows[i].AmountUSD = float64(rows[i].Quota) / common.QuotaPerUnit
		rows[i].AmountCNY = partnerQuotaCNY(rows[i].Quota)
		result.TotalRequests += rows[i].RequestCount
		result.TotalQuota += rows[i].Quota
	}
	result.TotalAmountUSD = float64(result.TotalQuota) / common.QuotaPerUnit
	result.TotalAmountCNY = partnerQuotaCNY(result.TotalQuota)
	startIndex := (page - 1) * pageSize
	if startIndex < len(rows) {
		endIndex := startIndex + pageSize
		if endIndex > len(rows) {
			endIndex = len(rows)
		}
		result.Items = rows[startIndex:endIndex]
	}
	return result, nil
}

// PartnerBillingSummaryAPI GET /api/partner/billing/summary
func PartnerBillingSummaryAPI(c *gin.Context) {
	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil {
		partnerError(c, http.StatusBadRequest, "分页参数错误")
		return
	}
	pageSize, err := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if err != nil {
		partnerError(c, http.StatusBadRequest, "分页参数错误")
		return
	}
	merchantID := c.GetInt64("partner_merchant_id")
	result, err := QueryPartnerBillingSummary(merchantID, c.Query("start_date"), c.Query("end_date"), page, pageSize, time.Now())
	if err != nil {
		if errors.Is(err, errInvalidPartnerBillingRange) {
			partnerError(c, http.StatusBadRequest, err.Error())
			return
		}
		if errors.Is(err, errPartnerBillingSeparateDB) {
			partnerError(c, http.StatusServiceUnavailable, "消费账单暂不可用")
			return
		}
		partnerError(c, http.StatusInternalServerError, "查询消费账单失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
