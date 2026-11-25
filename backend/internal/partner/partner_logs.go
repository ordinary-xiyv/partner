package partner

import (
	"errors"
	"net/http"
	"sort"
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

// partnerMerchantUserIndex 返回商户名下可见用户：id → 当前用户名，以及 ID 列表。
//
// 为什么先单独查一次 users，而不是在 logs 上 JOIN：
//
// logs 表**没有 merchant_id 列**，按商户过滤只能借 user_id 关联 users。写成
// `FROM logs JOIN users ON users.id = logs.user_id WHERE users.merchant_id = ?`
// 时，PostgreSQL 的执行计划是「先 Append 扫完全部 106 个分区，再 Hash Join 过滤」——
// 扫描量等于平台总日志量，与这个商户自己有多少数据毫无关系。实测某商户只占全库
// 16.5% 的日志，却要付 100% 的扫描代价，同样查询 17.5ms；改成先取用户 ID 再
// `logs.user_id IN (...)` 后降到 0.9ms（19 倍），且差距随数据增长继续扩大。
//
// 这里取的是 users.username（当前值）而非 logs.username（写入时的历史快照）：
// 用户改过名之后两者会不一致（实测存在 'T714' → 'T714_T' 这类情况），
// 伙伴后台展示的应当是「这个人现在叫什么」，与原 JOIN 语义保持一致。
//
// onlyUserID > 0 时只查这一个用户，用于「按客户筛选」场景，避免传长 IN 列表。
//
// 边界：返回值是完整 ID 列表，商户用户数量级上千时 IN 列表会变长；
// 目前每个商户几百人以内，远未到需要换临时表/子查询的程度。
func partnerMerchantUserIndex(merchantID, onlyUserID int64) (map[int64]string, []int64, error) {
	type userRow struct {
		ID       int64  `gorm:"column:id"`
		Username string `gorm:"column:username"`
	}
	query := model.DB.Table("users").
		Select("id, username").
		Where("merchant_id = ? AND deleted_at IS NULL AND role IN ?", merchantID,
			[]int{common.RoleGuestUser, common.RoleCommonUser})
	if onlyUserID > 0 {
		query = query.Where("id = ?", onlyUserID)
	}
	var rows []userRow
	if err := query.Find(&rows).Error; err != nil {
		return nil, nil, err
	}
	names := make(map[int64]string, len(rows))
	ids := make([]int64, 0, len(rows))
	for _, row := range rows {
		names[row.ID] = row.Username
		ids = append(ids, row.ID)
	}
	return names, ids, nil
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

	// 先确认这个商户确实有可见用户，空商户直接返回空页 ——
	// 既省掉一次按空 IN 列表的无效日志查询，也避免把「没有用户」和「有用户但没日志」混为一谈。
	userNames, userIDs, err := partnerMerchantUserIndex(merchantID, filter.UserID)
	if err != nil {
		return PartnerLogPage{}, err
	}
	if len(userIDs) == 0 {
		return result, nil
	}

	query := model.LOG_DB.Table("logs").
		Where("logs.user_id IN ?", userIDs).
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
	if err := query.Select("logs.id, logs.created_at, logs.user_id, logs.type, logs.model_name, logs.prompt_tokens, logs.completion_tokens, logs.cache_read, logs.use_time, logs.is_stream, logs.quota, logs.request_id").
		Order("logs.created_at DESC, logs.id DESC").Limit(filter.PageSize).Offset((filter.Page - 1) * filter.PageSize).
		Find(&result.Items).Error; err != nil {
		return PartnerLogPage{}, err
	}
	for i := range result.Items {
		// 用户名从上面那次 users 查询里补，不再依赖 JOIN
		result.Items[i].Username = userNames[result.Items[i].UserID]
		result.Items[i].AmountCNY = partnerQuotaCNY(int64(result.Items[i].Quota))
		if common.PublicModelNameMapper != nil {
			if name, ok := common.PublicModelNameMapper(result.Items[i].ModelName); ok {
				result.Items[i].ModelName = name
			}
		}
	}
	return result, nil
}

// ListPartnerLogModels 返回该商户可见的模型名清单，供「模型筛选」下拉使用。
//
// 为什么单独开一个接口，而不是让前端拿 /logs?page_size=100&all_history=1 去重：
// 后者为了填一个下拉框，要按全历史跑一遍完整的分页查询（含 Count），
// 和主列表抢同一张表。改成 DISTINCT 之后只取一列、不排序、不分页、不统计总数，
// 扫描量固定且远小于分页查询。
//
// 返回的是**原始** model_name，不做 PublicModelNameMapper 映射 ——
// 前端选中的值要原样回传给 /logs 的 model_name 参数做 LIKE 匹配，
// 一旦映射成展示名就匹配不上了。展示名的映射仍由 ListPartnerLogs 负责。
func ListPartnerLogModels(merchantID int64) ([]string, error) {
	if merchantID <= 0 {
		return nil, errors.New("invalid merchant ID")
	}
	if model.LOG_DB == nil || model.DB == nil || model.LOG_DB != model.DB {
		return nil, errors.New("伙伴日志需要日志与用户共用数据库")
	}
	_, userIDs, err := partnerMerchantUserIndex(merchantID, 0)
	if err != nil {
		return nil, err
	}
	if len(userIDs) == 0 {
		return []string{}, nil
	}
	var names []string
	if err := model.LOG_DB.Table("logs").
		Where("logs.user_id IN ?", userIDs).
		Where("logs.type IN ?", partnerLogTypes).
		Where("logs.model_name <> ''").
		Distinct().Pluck("logs.model_name", &names).Error; err != nil {
		return nil, err
	}
	// 库里存在带前导空格的模型名（实测见过 ' doubao-seedance-2-0-260128'）。
	// trim + 去重后排序，避免下拉里出现两个看起来一样、点起来结果不同的选项。
	seen := make(map[string]struct{}, len(names))
	cleaned := make([]string, 0, len(names))
	for _, name := range names {
		trimmed := strings.TrimSpace(name)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		cleaned = append(cleaned, trimmed)
	}
	sort.Strings(cleaned)
	return cleaned, nil
}

// PartnerLogModelsAPI GET /api/partner/logs/models
func PartnerLogModelsAPI(c *gin.Context) {
	merchantID := c.GetInt64("partner_merchant_id")
	names, err := ListPartnerLogModels(merchantID)
	if err != nil {
		partnerError(c, http.StatusInternalServerError, "查询模型列表失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"items": names}})
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
