package partner

import (
	"errors"
	"net/http"
	"sort"
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
//
// ★ 数据源分两段（2026-11-26，线上 4.4~4.9 秒超时的修复）：
//
//   - 已完结的天（start ~ 昨天）：读 lc_log_daily_summaries（主站平台
//     每天凌晨 2 点把昨天的 logs 聚合成每用户每模型每渠道一行的日汇总）。
//     26 天在本商户用户范围内只有几千行，走 summary_date 索引，0.2ms。
//     之前这里每次请求都在 logs 上现算 1500 万行，所以 4.4 秒。
//
//   - 今天（以及汇总表没覆盖到的天）：回落到 logs 现算 —— 只算缺失的那几天。
//     凌晨任务没跑（服务器宕机等）时不会少算钱，最坏退化到旧行为。
//
// 口径一致性已用本地真实数据逐用户比对验证：lc_log_daily_summaries 的
// quota_sum（消费2+预扣7+补扣8−退款6）和 request_count（消费2+预扣7）
// 与本函数原口径完全一致，16 用户 0 偏差；主站 logsummary/service.go
// 的 CASE WHEN 与这里逐字对得上。
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
	// role 过滤、聚合口径三处（汇总表段 / 现算段 / 合并循环）必须保持一致。
	type userAgg struct {
		UserID       int64
		Username     string
		Deleted      bool
		RequestCount int64
		Quota        int64
	}
	agg := make(map[int64]*userAgg)
	upsert := func(userID int64, username string, deleted bool, req, quota int64) {
		row, ok := agg[userID]
		if !ok {
			row = &userAgg{UserID: userID, Username: username, Deleted: deleted}
			agg[userID] = row
		} else {
			// 与旧版 MAX() 聚合语义一致：同一用户多来源时取字典序更大的用户名，
			// 删除标记一旦置位不回落。
			if username > row.Username {
				row.Username = username
			}
			if deleted {
				row.Deleted = true
			}
		}
		row.RequestCount += req
		row.Quota += quota
	}

	/*
	 * 第一段：汇总表覆盖的天。
	 *
	 * 先查出表里实际有哪些天落在 [start, 昨天] 内 —— 而不是盲取
	 * [start, 昨天]。汇总表由主站定时任务维护，可能落后（任务失败、
	 * 主站版本回退）、也可能缺更早的天。
	 *
	 * ★ 只认「从 start 起的连续覆盖前缀」：第 1 天就缺、或中间断了，
	 *   断口之后的天一律进第二段现算。宁可多算一点日志，也绝不能
	 *   因为拿缺口当天数而少算钱 —— 这是账单，正确性优先于性能。
	 */
	sumEnd := start // 现算段起点：默认从 start 全量现算（表为空/全缺时退化到旧行为）
	shLoc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return PartnerBillingSummary{}, err
	}
	dateStr := func(t time.Time) string { return t.In(shLoc).Format("2006-01-02") }
	// 探覆盖范围的上界是「昨天」：今天的汇总任务还没跑，表里最多到昨天。
	coveredQueryEnd := end.AddDate(0, 0, -1)
	var covered []time.Time
	if err := model.LOG_DB.Table("lc_log_daily_summaries").
		Where("summary_date >= ? AND summary_date <= ?", start, coveredQueryEnd).
		Distinct().Order("summary_date").Pluck("summary_date", &covered).Error; err != nil {
		return PartnerBillingSummary{}, err
	}
	prefix := 0
	want := start
	for _, d := range covered {
		if dateStr(d) == dateStr(want) {
			prefix++
			want = want.AddDate(0, 0, 1)
		} else {
			break
		}
	}
	if prefix > 0 {
		prefixEnd := start.AddDate(0, 0, prefix-1)
		var rows []PartnerBillingUser
		if err := model.LOG_DB.Table("lc_log_daily_summaries AS s").
			Joins("JOIN users ON users.id = s.user_id").
			Where("users.merchant_id = ? AND users.role IN ?", merchantID,
				[]int{common.RoleGuestUser, common.RoleCommonUser}).
			Where("s.summary_date >= ? AND s.summary_date <= ?", start, prefixEnd).
			Select(`s.user_id AS user_id, MAX(s.username) AS username,
				MAX(CASE WHEN users.deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted,
				COALESCE(SUM(s.request_count), 0) AS request_count,
				COALESCE(SUM(s.quota_sum), 0) AS quota`).
			Group("s.user_id").Scan(&rows).Error; err != nil {
			return PartnerBillingSummary{}, err
		}
		for i := range rows {
			upsert(rows[i].UserID, rows[i].Username, rows[i].Deleted, rows[i].RequestCount, rows[i].Quota)
		}
		// 现算段从「连续覆盖最后一天的下一天」开始。
		sumEnd = prefixEnd.AddDate(0, 0, 1)
	}
	/*
	 * 第二段：汇总表没覆盖的天（至少含今天 —— 任务只汇总到昨天），
	 * 在 logs 上现算。区间为 [sumEnd, end]，为空时跳过。
	 */
	if sumEnd.Unix() <= end.Unix() {
		dayEnd := end.AddDate(0, 0, 1) // created_at 半开区间的右边界
		var rows []PartnerBillingUser
		if err := model.LOG_DB.Table("logs").
			Joins("JOIN users ON users.id = logs.user_id").
			Where("users.merchant_id = ? AND users.role IN ?", merchantID,
				[]int{common.RoleGuestUser, common.RoleCommonUser}).
			Where("logs.type IN ? AND logs.created_at >= ? AND logs.created_at < ?",
				[]int{model.LogTypeConsume, model.LogTypeRefund, model.LogTypePreConsume, model.LogTypeAdditionalCharge},
				sumEnd.Unix(), dayEnd.Unix()).
			Select(`logs.user_id AS user_id, MAX(users.username) AS username,
				MAX(CASE WHEN users.deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted,
				COALESCE(SUM(CASE WHEN logs.type IN (?, ?) THEN 1 ELSE 0 END), 0) AS request_count,
				COALESCE(SUM(CASE WHEN logs.type IN (?, ?, ?) THEN logs.quota WHEN logs.type = ? THEN -logs.quota ELSE 0 END), 0) AS quota`,
				model.LogTypeConsume, model.LogTypePreConsume,
				model.LogTypeConsume, model.LogTypePreConsume, model.LogTypeAdditionalCharge, model.LogTypeRefund).
			Group("logs.user_id").Scan(&rows).Error; err != nil {
			return PartnerBillingSummary{}, err
		}
		for i := range rows {
			upsert(rows[i].UserID, rows[i].Username, rows[i].Deleted, rows[i].RequestCount, rows[i].Quota)
		}
	}

	// 排序与旧版一致：quota DESC, user_id ASC。
	rows := make([]PartnerBillingUser, 0, len(agg))
	for id := range agg {
		row := agg[id]
		rows = append(rows, PartnerBillingUser{
			UserID:       row.UserID,
			Username:     row.Username,
			Deleted:      row.Deleted,
			RequestCount: row.RequestCount,
			Quota:        row.Quota,
		})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Quota != rows[j].Quota {
			return rows[i].Quota > rows[j].Quota
		}
		return rows[i].UserID < rows[j].UserID
	})
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
