package partner

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"partner/internal/common"
	"partner/internal/model"
)

// PartnerLog exposes an allowlist of request metadata. Never embed model.Log here:
// its content, channel, token and upstream fields are not partner-facing data.
type PartnerLog struct {
	ID               int64   `json:"id" gorm:"column:id"`
	CreatedAt        int64   `json:"created_at" gorm:"column:created_at"`
	UserID           int64   `json:"user_id" gorm:"column:user_id"`
	Username         string  `json:"username" gorm:"column:username"`
	Type             int     `json:"type" gorm:"column:type"`
	ModelName        string  `json:"model_name" gorm:"column:model_name"`
	PromptTokens     int     `json:"prompt_tokens" gorm:"column:prompt_tokens"`
	CompletionTokens int     `json:"completion_tokens" gorm:"column:completion_tokens"`
	CacheRead        int     `json:"cache_read" gorm:"column:cache_read"`
	UseTime          int     `json:"use_time" gorm:"column:use_time"`
	IsStream         bool    `json:"is_stream" gorm:"column:is_stream"`
	Quota            int     `json:"quota" gorm:"column:quota"`
	AmountCNY        float64 `json:"amount_cny" gorm:"-"`
	RequestID        string  `json:"request_id" gorm:"column:request_id"`
}

type PartnerLogPage struct {
	Items    []PartnerLog `json:"items"`
	Total    int64        `json:"total"`
	Page     int          `json:"page"`
	PageSize int          `json:"page_size"`
}

type PartnerLogFilter struct {
	UserID         int64
	ModelName      string
	RequestID      string
	Type           int
	StartTimestamp int64
	EndTimestamp   int64
	Page           int
	PageSize       int
}

var partnerLogTypes = []int{
	model.LogTypeConsume, model.LogTypeError, model.LogTypeRefund,
	model.LogTypePreConsume, model.LogTypeAdditionalCharge,
}

var errInvalidPartnerLogFilter = errors.New("日志筛选参数错误")

func validPartnerLogType(value int) bool {
	for _, allowed := range partnerLogTypes {
		if value == allowed {
			return true
		}
	}
	return false
}

// ListPartnerLogs requires a shared users/logs database for the tenant join.
// If LOG_SQL_DSN points elsewhere, fail closed until a dedicated merchant_id log column exists.
func ListPartnerLogs(merchantID int64, filter PartnerLogFilter) (PartnerLogPage, error) {
	if merchantID <= 0 {
		return PartnerLogPage{}, errors.New("invalid merchant ID")
	}
	if model.LOG_DB == nil || model.DB == nil || model.LOG_DB != model.DB {
		return PartnerLogPage{}, errors.New("伙伴日志需要日志与用户共用数据库")
	}
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.Page > 1000000 {
		filter.Page = 1000000
	}
	if filter.PageSize < 1 || filter.PageSize > 100 {
		filter.PageSize = 20
	}
	filter.ModelName = strings.TrimSpace(filter.ModelName)
	filter.RequestID = strings.TrimSpace(filter.RequestID)
	if filter.StartTimestamp < 0 || filter.EndTimestamp < 0 ||
		(filter.EndTimestamp > 0 && filter.EndTimestamp < filter.StartTimestamp) ||
		(filter.Type != 0 && !validPartnerLogType(filter.Type)) || filter.UserID < 0 ||
		len(filter.ModelName) > 100 || len(filter.RequestID) > 128 {
		return PartnerLogPage{}, errInvalidPartnerLogFilter
	}

	result := PartnerLogPage{Items: make([]PartnerLog, 0), Page: filter.Page, PageSize: filter.PageSize}
	query := model.LOG_DB.Table("logs").
		Joins("JOIN users ON users.id = logs.user_id").
		Where("users.merchant_id = ? AND users.deleted_at IS NULL AND users.role IN ?", merchantID,
			[]int{common.RoleGuestUser, common.RoleCommonUser}).
		Where("logs.type IN ?", partnerLogTypes)
	if filter.StartTimestamp > 0 {
		query = query.Where("logs.created_at >= ?", filter.StartTimestamp)
	}
	if filter.EndTimestamp > 0 {
		query = query.Where("logs.created_at <= ?", filter.EndTimestamp)
	}
	if filter.Type > 0 {
		query = query.Where("logs.type = ?", filter.Type)
	}
	if filter.UserID > 0 {
		query = query.Where("logs.user_id = ?", filter.UserID)
	}
	if filter.ModelName != "" {
		query = query.Where("LOWER(logs.model_name) LIKE ?", "%"+strings.ToLower(filter.ModelName)+"%")
	}
	if filter.RequestID != "" {
		query = query.Where("logs.request_id = ?", filter.RequestID)
	}
	if err := query.Count(&result.Total).Error; err != nil {
		return PartnerLogPage{}, err
	}
	if err := query.Select("logs.id, logs.created_at, logs.user_id, users.username AS username, logs.type, logs.model_name, logs.prompt_tokens, logs.completion_tokens, logs.cache_read, logs.use_time, logs.is_stream, logs.quota, logs.request_id").
		Order("logs.created_at DESC, logs.id DESC").Limit(filter.PageSize).Offset((filter.Page - 1) * filter.PageSize).
		Find(&result.Items).Error; err != nil {
		return PartnerLogPage{}, err
	}
	for i := range result.Items {
		result.Items[i].AmountCNY = partnerQuotaCNY(int64(result.Items[i].Quota))
		if common.PublicModelNameMapper != nil {
			if name, ok := common.PublicModelNameMapper(result.Items[i].ModelName); ok {
				result.Items[i].ModelName = name
			}
		}
	}
	return result, nil
}

func parsePartnerLogFilter(c *gin.Context) (PartnerLogFilter, error) {
	filter := PartnerLogFilter{Page: 1, PageSize: 20}
	var err error
	if raw := c.Query("page"); raw != "" {
		filter.Page, err = strconv.Atoi(raw)
		if err != nil {
			return filter, err
		}
	}
	if raw := c.Query("page_size"); raw != "" {
		filter.PageSize, err = strconv.Atoi(raw)
		if err != nil {
			return filter, err
		}
	}
	if raw := c.Query("user_id"); raw != "" {
		filter.UserID, err = strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return filter, err
		}
	}
	if raw := c.Query("type"); raw != "" {
		filter.Type, err = strconv.Atoi(raw)
		if err != nil {
			return filter, err
		}
	}
	if raw := c.Query("start_timestamp"); raw != "" {
		filter.StartTimestamp, err = strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return filter, err
		}
	}
	if raw := c.Query("end_timestamp"); raw != "" {
		filter.EndTimestamp, err = strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return filter, err
		}
	}
	allHistory := c.Query("all_history")
	if allHistory != "" && allHistory != "1" {
		return filter, errInvalidPartnerLogFilter
	}
	if filter.StartTimestamp == 0 && filter.EndTimestamp == 0 && allHistory != "1" {
		filter.StartTimestamp, filter.EndTimestamp = partnerLogTodayRange(time.Now())
	}
	filter.ModelName = c.Query("model_name")
	filter.RequestID = c.Query("request_id")
	return filter, nil
}

func partnerLogTodayRange(now time.Time) (int64, int64) {
	loc := time.FixedZone("Asia/Shanghai", 8*60*60)
	localNow := now.In(loc)
	today := time.Date(localNow.Year(), localNow.Month(), localNow.Day(), 0, 0, 0, 0, loc)
	return today.Unix(), today.AddDate(0, 0, 1).Unix() - 1
}

// PartnerLogsAPI GET /api/partner/logs
func PartnerLogsAPI(c *gin.Context) {
	filter, err := parsePartnerLogFilter(c)
	if err != nil {
		partnerError(c, http.StatusBadRequest, "日志筛选参数错误")
		return
	}
	merchantID := c.GetInt64("partner_merchant_id")
	page, err := ListPartnerLogs(merchantID, filter)
	if err != nil {
		if errors.Is(err, errInvalidPartnerLogFilter) {
			partnerError(c, http.StatusBadRequest, err.Error())
			return
		}
		partnerError(c, http.StatusInternalServerError, "查询日志失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": page})
}
