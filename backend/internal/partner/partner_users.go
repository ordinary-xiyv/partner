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

// ListPartnerUsers always scopes both count and rows to the authenticated merchant.
func ListPartnerUsers(merchantID int64, keyword string, page, pageSize int) (PartnerUserPage, error) {
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

// PartnerUsersAPI GET /api/partner/users?keyword=&page=&page_size=
func PartnerUsersAPI(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	merchantID := c.GetInt64("partner_merchant_id")
	if merchantID <= 0 {
		partnerError(c, http.StatusUnauthorized, "请登录伙伴后台")
		return
	}
	result, err := ListPartnerUsers(merchantID, c.Query("keyword"), page, pageSize)
	if err != nil {
		partnerError(c, http.StatusInternalServerError, "查询用户失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
