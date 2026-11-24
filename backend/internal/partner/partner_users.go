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

type PartnerUser struct {
	ID          int64      `json:"id" gorm:"column:id"`
	Username    string     `json:"username" gorm:"column:username"`
	DisplayName string     `json:"display_name" gorm:"column:display_name"`
	Email       string     `json:"email" gorm:"column:email"`
	Phone       *string    `json:"phone,omitempty" gorm:"column:phone"`
	Status      int        `json:"status" gorm:"column:status"`
	CreatedTime *time.Time `json:"created_time,omitempty" gorm:"column:created_time"`
}

type PartnerUserPage struct {
	Items    []PartnerUser `json:"items"`
	Total    int64         `json:"total"`
	Page     int           `json:"page"`
	PageSize int           `json:"page_size"`
}

func maskPartnerPhone(phone *string) *string {
	if phone == nil {
		return nil
	}
	value := []rune(*phone)
	if len(value) < 8 {
		masked := "****"
		return &masked
	}
	masked := string(value[:3]) + "****" + string(value[len(value)-4:])
	return &masked
}

/*
 * users.status 的取值，与 lynxtonapi 的 upstream/common/constants.go 一致：
 *   1 = 启用，2 = 禁用（没有 0，0 是 Go 的零值，主站明确要求不用）
 *
 * 伙伴后端不引入主站的 common 包（那是另一个模块），所以这里直接用数字。
 * 改这两个值必须同时改主站，否则状态会显示反。
 */
const (
	partnerUserStatusEnabled  = 1
	partnerUserStatusDisabled = 2
)

/*
 * 状态筛选的合法值。0 表示「全部」，不参与过滤。
 *
 * 为什么用 0 当「全部」而不是 -1 或空串：
 *   前端 Segmented 的「全部」值就是 0，契约直接对上，两边不需要各自转换。
 */
func validPartnerUserStatus(status int) bool {
	return status == 0 || status == partnerUserStatusEnabled || status == partnerUserStatusDisabled
}

// ListPartnerUsers always scopes both count and rows to the authenticated merchant.
//
// status: 0=全部，1=启用，2=禁用。非法值按「全部」处理 —— 这不是宽容，
// 而是「筛选条件写错不该让整个列表打不开」。但 API 层会先校验并返回 400，
// 所以走到这里的非法值只可能来自内部调用。
func ListPartnerUsers(
	merchantID int64,
	keyword string,
	status int,
	page, pageSize int,
) (PartnerUserPage, error) {
	if merchantID <= 0 {
		return PartnerUserPage{}, errors.New("invalid merchant ID")
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
	keyword = strings.TrimSpace(keyword)
	if len([]rune(keyword)) > 100 {
		keyword = string([]rune(keyword)[:100])
	}

	result := PartnerUserPage{Items: make([]PartnerUser, 0), Page: page, PageSize: pageSize}
	query := model.DB.Table("users").Where("merchant_id = ? AND deleted_at IS NULL AND role IN ?", merchantID,
		[]int{common.RoleGuestUser, common.RoleCommonUser})
	if keyword != "" {
		like := "%" + strings.ToLower(keyword) + "%"
		id, err := strconv.ParseInt(keyword, 10, 64)
		if err != nil {
			id = -1
		}
		query = query.Where("(id = ? OR LOWER(username) LIKE ? OR LOWER(display_name) LIKE ? OR LOWER(email) LIKE ? OR phone LIKE ?)",
			id, like, like, like, "%"+keyword+"%")
	}
	/*
	 * ★ 状态过滤必须加在 Count() 之前。
	 *
	 * Count 和 Find 共用同一个 query 对象，GORM 会把 Where 累积下来。
	 * 如果只在 Find 上加条件，total 还是未过滤的全量 —— 那正是这个 bug
	 * 原来的样子：表格筛出 2 条，上面写「共 137 个」，两个数字互相矛盾。
	 */
	if status != 0 {
		query = query.Where("status = ?", status)
	}
	if err := query.Count(&result.Total).Error; err != nil {
		return PartnerUserPage{}, err
	}
	if err := query.Select("id, username, display_name, email, phone, status, created_time").
		Order("id DESC").Limit(pageSize).Offset((page - 1) * pageSize).Find(&result.Items).Error; err != nil {
		return PartnerUserPage{}, err
	}
	for i := range result.Items {
		result.Items[i].Phone = maskPartnerPhone(result.Items[i].Phone)
	}
	return result, nil
}

// PartnerUsersAPI GET /api/partner/users?keyword=&status=&page=&page_size=
func PartnerUsersAPI(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	merchantID := c.GetInt64("partner_merchant_id")
	if merchantID <= 0 {
		partnerError(c, http.StatusUnauthorized, "请登录伙伴后台")
		return
	}
	/*
	 * status 缺省是 0（全部）。
	 *
	 * 非法值返回 400 而不是静默忽略：前端如果拼错了参数，静默按「全部」
	 * 处理会让它以为筛选生效了，实际上看到的是全量 —— 又是「看起来对、
	 * 数字是错的」，跟这个接口原来的毛病一个性质。
	 */
	status, err := strconv.Atoi(c.DefaultQuery("status", "0"))
	if err != nil || !validPartnerUserStatus(status) {
		partnerError(c, http.StatusBadRequest, "状态参数无效")
		return
	}
	result, err := ListPartnerUsers(merchantID, c.Query("keyword"), status, page, pageSize)
	if err != nil {
		partnerError(c, http.StatusInternalServerError, "查询用户失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
