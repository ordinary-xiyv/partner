package partner

import (
	"bytes"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"

	"partner/internal/model"
)

/*
伙伴后台的品牌白标接口。

数据源就是 lc_distribution_merchants 表上那 10 个 brand_* 列 —— 这张表
同时被 lynxtonapi 的站点体系（siteauth）使用，所以伙伴后台这里写进去的值，
另一套平台按站点身份读出来是同一份，两边不各存一套。

约束来自数据库本身，这里只是提前校验以便给出可读的错误，不是唯一防线：
  · lc_distribution_merchants_brand_name_not_blank  brand_name 非空
  · lc_distribution_merchants_brand_json_shape      brand_support/landing 必须是 object
  · lc_distribution_merchants_primary_color_format  #RGB 或 #RRGGBB
*/

const (
	maxBrandName       = 64
	maxBrandShortName  = 8
	maxBrandURL        = 512
	maxBrandPageTitle  = 128
	maxBrandTagline    = 255
	maxBrandAPIBaseURL = 253
	/*
	 * 页脚版权行各项的长度上限。
	 *
	 * 版权整句给得比较宽（200），因为实际写法五花八门：
	 * 「© 2026 杭州某某科技有限公司 版权所有」这类中英混排很常见。
	 * 条款/隐私是按钮文字，备案号是固定格式，都不该超过 64。
	 */
	maxFooterCopyrightText = 200
	maxFooterLegalLabel    = 64
)

var brandColorPattern = regexp.MustCompile(`^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`)

/*
brandBaseURLPattern 限定接口基地址只能是 http(s) 绝对地址。

不要求结尾没斜杠：存的时候保留用户输入，前端使用时会自己去掉尾部斜杠
（见 web-user 的 resolveSiteBaseUrl）。这里只判断「协议 + 主机」是否合法，
路径部分允许任意（很多网关挂在 /v1 或 /api 下）。
*/
var brandBaseURLPattern = regexp.MustCompile(`^https?://[a-zA-Z0-9](?:[a-zA-Z0-9\-._~%]*)(?::\d{1,5})?(?:/[^\s]*)?$`)

var (
	errBrandNameBlank      = errors.New("品牌名不能为空")
	errBrandTextTooLong    = errors.New("字段长度超出限制")
	errBrandColorInvalid   = errors.New("品牌色必须是 #RGB 或 #RRGGBB")
	errBrandJSONNotObject  = errors.New("客服信息与首页配置必须是 JSON 对象")
	errBrandDomainMismatch = errors.New("域名与当前商户绑定的站点不一致")
	errBrandBaseURLInvalid = errors.New("接口基地址必须是 http:// 或 https:// 开头的完整地址")
)

// MerchantBrand 是按商户存的白标配置，字段名与 partner/web 的 PartnerBrandRes 一致。
type MerchantBrand struct {
	MerchantID   int64           `json:"merchant_id"`
	MerchantName string          `json:"merchant_name"`
	MerchantCode string          `json:"merchant_code"`
	Name         string          `json:"name"`
	ShortName    string          `json:"short_name"`
	LogoURL      string          `json:"logo_url"`
	PrimaryColor string          `json:"primary_color"`
	PageTitle    string          `json:"page_title"`
	FaviconURL   string          `json:"favicon_url"`
	Tagline      string          `json:"tagline"`
	APIBaseURL   string          `json:"api_base_url"`
	Support      json.RawMessage `json:"support"`
	Landing      json.RawMessage `json:"landing"`
	SiteID       *string         `json:"site_id"`
	SiteDomain   *string         `json:"site_domain"`
}

// brandJSON 承接 jsonb 列。
//
// 不能直接用 json.RawMessage：PostgreSQL 驱动把 jsonb 扫成 []byte，
// SQLite 扫成 string，而 json.RawMessage 只认 []byte，换个库就扫描失败。
// 这里两种都接，写入时统一给字符串，两个驱动都能处理。
type brandJSON struct {
	Raw json.RawMessage
}

func (b *brandJSON) Scan(value any) error {
	switch v := value.(type) {
	case nil:
		b.Raw = nil
	case []byte:
		b.Raw = append(b.Raw[:0], v...)
	case string:
		b.Raw = json.RawMessage(v)
	default:
		return errBrandJSONNotObject
	}
	return nil
}

func (b brandJSON) Value() (driver.Value, error) {
	if len(bytes.TrimSpace(b.Raw)) == 0 {
		return nil, nil
	}
	return string(b.Raw), nil
}

// brandRow 对应表上的真实列。空列用指针接，避免把 NULL 读成空串后写回去。
type brandRow struct {
	ID             int64      `gorm:"column:id"`
	MerchantName   string     `gorm:"column:merchant_name"`
	MerchantCode   string     `gorm:"column:merchant_code"`
	SiteID         *string    `gorm:"column:site_id"`
	SiteDomain     *string    `gorm:"column:site_domain"`
	BrandName      *string    `gorm:"column:brand_name"`
	BrandShortName *string    `gorm:"column:brand_short_name"`
	BrandLogoURL   *string    `gorm:"column:brand_logo_url"`
	BrandColor     *string    `gorm:"column:brand_primary_color"`
	BrandPageTitle *string    `gorm:"column:brand_page_title"`
	BrandFavicon   *string    `gorm:"column:brand_favicon_url"`
	BrandTagline   *string    `gorm:"column:brand_tagline"`
	BrandAPIBase   *string    `gorm:"column:brand_api_base_url"`
	BrandSupport   brandJSON  `gorm:"column:brand_support"`
	BrandLanding   brandJSON  `gorm:"column:brand_landing"`
	SiteLastSeen   *time.Time `gorm:"column:site_last_seen_at"`
}

func (brandRow) TableName() string { return "lc_distribution_merchants" }

var brandColumns = []string{
	"id", "merchant_name", "merchant_code", "site_id", "site_domain",
	"brand_name", "brand_short_name", "brand_logo_url", "brand_primary_color",
	"brand_page_title", "brand_favicon_url", "brand_tagline", "brand_api_base_url",
	"brand_support", "brand_landing", "site_last_seen_at",
}

func derefString(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

// toMerchantBrand 把行数据转成响应。
//
// 空值的降级规则写在这里而不是前端，是为了让伙伴后台和客户站看到同一个品牌名：
// 品牌名留空 → 用商户名；首字标记留空 → 取品牌名首字；标题留空 → 同品牌名。
// 如果放到前端各自兜底，两个平台会出现「后台显示 A、客户站显示 B」的错位。
func toMerchantBrand(row brandRow) MerchantBrand {
	name := strings.TrimSpace(derefString(row.BrandName))
	if name == "" {
		name = strings.TrimSpace(row.MerchantName)
	}
	if name == "" {
		name = row.MerchantCode
	}
	shortName := strings.TrimSpace(derefString(row.BrandShortName))
	if shortName == "" && name != "" {
		first, _ := utf8.DecodeRuneInString(name)
		if first != utf8.RuneError {
			shortName = string(first)
		}
	}
	pageTitle := strings.TrimSpace(derefString(row.BrandPageTitle))
	if pageTitle == "" {
		pageTitle = name
	}
	color := strings.TrimSpace(derefString(row.BrandColor))
	// 列上的 CHECK 约束保证已有值是合法的，这里只处理「没配过」的情况
	if !brandColorPattern.MatchString(color) {
		color = "#6d51fe"
	}
	support := row.BrandSupport.Raw
	if len(support) == 0 || string(support) == "null" {
		support = json.RawMessage(`{}`)
	}
	landing := row.BrandLanding.Raw
	if len(landing) == 0 || string(landing) == "null" {
		landing = json.RawMessage(`{}`)
	}
	return MerchantBrand{
		MerchantID:   row.ID,
		MerchantName: row.MerchantName,
		MerchantCode: row.MerchantCode,
		Name:         name,
		ShortName:    shortName,
		LogoURL:      strings.TrimSpace(derefString(row.BrandLogoURL)),
		PrimaryColor: color,
		PageTitle:    pageTitle,
		FaviconURL:   strings.TrimSpace(derefString(row.BrandFavicon)),
		Tagline:      strings.TrimSpace(derefString(row.BrandTagline)),
		APIBaseURL:   strings.TrimSpace(derefString(row.BrandAPIBase)),
		Support:      support,
		Landing:      landing,
		SiteID:       row.SiteID,
		SiteDomain:   row.SiteDomain,
	}
}

func loadBrandRow(merchantID int64) (brandRow, error) {
	var row brandRow
	err := model.DB.Select(brandColumns).Where("id = ?", merchantID).Take(&row).Error
	return row, err
}

// GetMerchantBrand 读当前登录商户的品牌配置。
func GetMerchantBrand(merchantID int64) (MerchantBrand, error) {
	if merchantID <= 0 {
		return MerchantBrand{}, errors.New("invalid merchant ID")
	}
	row, err := loadBrandRow(merchantID)
	if err != nil {
		return MerchantBrand{}, err
	}
	return toMerchantBrand(row), nil
}

/*
merchantBrandInput 用指针区分「字段没传」和「传了空值」。

这个区分是必须的：前端「撤销改 logo」是把 logo_url 传空字符串，
语义是「删掉 logo 回到首字方块」；而没传 logo_url 的请求不该动这一列。
用值类型接收的话两者都会变成空串，一次改标题的保存就会顺手把 logo 清掉。
*/
type merchantBrandInput struct {
	Name         *string          `json:"name"`
	ShortName    *string          `json:"short_name"`
	LogoURL      *string          `json:"logo_url"`
	PrimaryColor *string          `json:"primary_color"`
	PageTitle    *string          `json:"page_title"`
	FaviconURL   *string          `json:"favicon_url"`
	Tagline      *string          `json:"tagline"`
	APIBaseURL   *string          `json:"api_base_url"`
	Support      *json.RawMessage `json:"support"`
	Landing      *json.RawMessage `json:"landing"`
}

// trimToNull 把「只有空白」的输入转成 NULL：数据库里空的 logo_url 和没配过
// 的 logo_url 对前端是同一件事，没必要把空串和 NULL 两种状态都传下去。
func trimToNull(v *string) *string {
	if v == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*v)
	return &trimmed
}

func checkTextLen(value *string, limit int, runeLimit bool) error {
	if value == nil {
		return nil
	}
	var n int
	if runeLimit {
		n = utf8.RuneCountInString(*value)
	} else {
		n = len(*value)
	}
	if n > limit {
		return errBrandTextTooLong
	}
	return nil
}

func checkJSONObject(raw *json.RawMessage) error {
	if raw == nil {
		return nil
	}
	trimmed := bytes.TrimSpace(*raw)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		return nil
	}
	if trimmed[0] != '{' {
		return errBrandJSONNotObject
	}
	var probe map[string]any
	if err := json.Unmarshal(trimmed, &probe); err != nil {
		return errBrandJSONNotObject
	}
	return nil
}

/*
checkLandingFooter 校验 brand_landing.footer 这一小块。

为什么校验放在 landing 的整体校验之后单独做一次：
landing 是整体替换语义，前端提交的是完整 jsonb。如果只校验「是不是对象」，
商户把版权文字粘错（复制了 300 字的整段法务声明）就会被静默存进库，
然后在全站每一页底部铺开 —— 这种错误在后台预览里不一定看得出来。

只校验长度和类型，不改写内容：空串是合法输入，语义是「隐藏这一项」。
*/
func checkLandingFooter(raw *json.RawMessage) error {
	if raw == nil {
		return nil
	}
	trimmed := bytes.TrimSpace(*raw)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		return nil
	}
	var probe struct {
		Footer *struct {
			CopyrightText *string `json:"copyright_text"`
			TermsLabel    *string `json:"terms_label"`
			PrivacyLabel  *string `json:"privacy_label"`
			BeianLabel    *string `json:"beian_label"`
		} `json:"footer"`
	}
	if err := json.Unmarshal(trimmed, &probe); err != nil {
		return nil // 不是合法对象时交给 checkJSONObject 报错，这里不重复判断
	}
	if probe.Footer == nil {
		return nil
	}
	checks := []struct {
		value *string
		limit int
	}{
		{probe.Footer.CopyrightText, maxFooterCopyrightText},
		{probe.Footer.TermsLabel, maxFooterLegalLabel},
		{probe.Footer.PrivacyLabel, maxFooterLegalLabel},
		{probe.Footer.BeianLabel, maxFooterLegalLabel},
	}
	for _, c := range checks {
		if c.value == nil {
			continue
		}
		if utf8.RuneCountInString(*c.value) > c.limit {
			return errBrandTextTooLong
		}
	}
	return nil
}

// buildBrandUpdates 只把请求里实际出现的字段翻译成待更新的列。
func buildBrandUpdates(input merchantBrandInput) (map[string]any, error) {
	updates := map[string]any{}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, errBrandNameBlank
		}
		if err := checkTextLen(&name, maxBrandName, true); err != nil {
			return nil, err
		}
		updates["brand_name"] = name
	}
	if input.ShortName != nil {
		short := strings.TrimSpace(*input.ShortName)
		if err := checkTextLen(&short, maxBrandShortName, true); err != nil {
			return nil, err
		}
		updates["brand_short_name"] = nullableText(short)
	}
	if input.LogoURL != nil {
		logo := strings.TrimSpace(*input.LogoURL)
		if err := checkTextLen(&logo, maxBrandURL, false); err != nil {
			return nil, err
		}
		updates["brand_logo_url"] = nullableText(logo)
	}
	if input.PrimaryColor != nil {
		color := strings.TrimSpace(*input.PrimaryColor)
		if color != "" && !brandColorPattern.MatchString(color) {
			return nil, errBrandColorInvalid
		}
		updates["brand_primary_color"] = nullableText(color)
	}
	if input.PageTitle != nil {
		title := strings.TrimSpace(*input.PageTitle)
		if err := checkTextLen(&title, maxBrandPageTitle, true); err != nil {
			return nil, err
		}
		updates["brand_page_title"] = nullableText(title)
	}
	if input.FaviconURL != nil {
		favicon := strings.TrimSpace(*input.FaviconURL)
		if err := checkTextLen(&favicon, maxBrandURL, false); err != nil {
			return nil, err
		}
		updates["brand_favicon_url"] = nullableText(favicon)
	}
	if input.Tagline != nil {
		tagline := strings.TrimSpace(*input.Tagline)
		if err := checkTextLen(&tagline, maxBrandTagline, true); err != nil {
			return nil, err
		}
		updates["brand_tagline"] = nullableText(tagline)
	}
	if input.APIBaseURL != nil {
		base := strings.TrimSpace(*input.APIBaseURL)
		if err := checkTextLen(&base, maxBrandAPIBaseURL, false); err != nil {
			return nil, err
		}
		/*
		 * 必须是 http(s) 绝对地址。
		 *
		 * 这一列会直接显示在客户站的首页示例和接入文档里，用户会照着它复制代码。
		 * 不做校验的后果有两类：
		 *   · 填成 "localhost" 或 "api.xxx.com"（漏了协议）—— 前端拼出来的是
		 *     相对路径，示例里的 curl 会指向当前页面所在域，看起来对但复制出去是错的
		 *   · 填成 javascript: / data: 之类的伪协议 —— 拼进 <code> 或 href 后
		 *     有注入风险
		 * 所以只放行 http/https 绝对地址，其它一律拒绝。
		 */
		if base != "" && !brandBaseURLPattern.MatchString(base) {
			return nil, errBrandBaseURLInvalid
		}
		updates["brand_api_base_url"] = nullableText(base)
	}
	if input.Support != nil {
		if err := checkJSONObject(input.Support); err != nil {
			return nil, err
		}
		updates["brand_support"] = jsonColumnValue(*input.Support)
	}
	if input.Landing != nil {
		if err := checkJSONObject(input.Landing); err != nil {
			return nil, err
		}
		if err := checkLandingFooter(input.Landing); err != nil {
			return nil, err
		}
		updates["brand_landing"] = jsonColumnValue(*input.Landing)
	}
	return updates, nil
}

// nullableText 让「传空 = 清空」落到 NULL 上（列可为空，空串会被 CHECK 视为空白）。
func nullableText(v string) any {
	if v == "" {
		return nil
	}
	return v
}

func jsonColumnValue(raw json.RawMessage) any {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		return nil
	}
	return string(trimmed)
}

// UpdateMerchantBrand 写品牌配置，只更新请求里出现的字段。
func UpdateMerchantBrand(merchantID int64, input merchantBrandInput) (MerchantBrand, error) {
	if merchantID <= 0 {
		return MerchantBrand{}, errors.New("invalid merchant ID")
	}
	updates, err := buildBrandUpdates(input)
	if err != nil {
		return MerchantBrand{}, err
	}
	if len(updates) > 0 {
		updates["updated_at"] = time.Now()
		result := model.DB.Table("lc_distribution_merchants").Where("id = ?", merchantID).Updates(updates)
		if result.Error != nil {
			return MerchantBrand{}, result.Error
		}
		if result.RowsAffected != 1 {
			return MerchantBrand{}, errors.New("商户不存在")
		}
	}
	return GetMerchantBrand(merchantID)
}

func brandError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, errBrandNameBlank), errors.Is(err, errBrandTextTooLong),
		errors.Is(err, errBrandColorInvalid), errors.Is(err, errBrandJSONNotObject),
		errors.Is(err, errBrandDomainMismatch):
		partnerError(c, http.StatusBadRequest, err.Error())
	default:
		partnerError(c, http.StatusInternalServerError, "保存品牌配置失败")
	}
}

// MerchantBrandAPI GET /api/partner/brand
func MerchantBrandAPI(c *gin.Context) {
	brand, err := GetMerchantBrand(c.GetInt64("partner_merchant_id"))
	if err != nil {
		brandError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": brand})
}

// MerchantBrandUpdateAPI PUT /api/partner/brand
func MerchantBrandUpdateAPI(c *gin.Context) {
	var input merchantBrandInput
	if err := c.ShouldBindJSON(&input); err != nil {
		partnerError(c, http.StatusBadRequest, "品牌配置格式错误")
		return
	}
	brand, err := UpdateMerchantBrand(c.GetInt64("partner_merchant_id"), input)
	if err != nil {
		brandError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": brand})
}

// PartnerDomain 域名只读展示。绑定关系由平台维护，伙伴端不提供增删。
type PartnerDomain struct {
	Host       string `json:"host"`
	Kind       string `json:"kind"`
	Status     string `json:"status"`
	VerifiedAt int64  `json:"verified_at,omitempty"`
}

// MerchantDomainsAPI GET /api/partner/brand/domains
func MerchantDomainsAPI(c *gin.Context) {
	row, err := loadBrandRow(c.GetInt64("partner_merchant_id"))
	if err != nil {
		brandError(c, err)
		return
	}
	domains := make([]PartnerDomain, 0, 1)
	if row.SiteDomain != nil && strings.TrimSpace(*row.SiteDomain) != "" {
		domain := PartnerDomain{Host: strings.TrimSpace(*row.SiteDomain), Kind: "primary", Status: "active"}
		if row.SiteLastSeen != nil {
			domain.VerifiedAt = row.SiteLastSeen.Unix()
		}
		domains = append(domains, domain)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": domains})
}

/*
MerchantDomainCheckAPI POST /api/partner/brand/domains/:host/check

只校验「这个域名是不是当前商户绑定的那个」。这里不做 DNS 解析：
伙伴后端大概率部署在内网，从它发出的解析结果不代表用户浏览器的真实访问路径，
拿它下结论反而会误报。绑定是否生效由平台侧的站点访问记录（site_last_seen_at）决定。
*/
func MerchantDomainCheckAPI(c *gin.Context) {
	host := strings.ToLower(strings.TrimSpace(c.Param("host")))
	if host == "" {
		partnerError(c, http.StatusBadRequest, "域名不能为空")
		return
	}
	row, err := loadBrandRow(c.GetInt64("partner_merchant_id"))
	if err != nil {
		brandError(c, err)
		return
	}
	if row.SiteDomain == nil || strings.ToLower(strings.TrimSpace(*row.SiteDomain)) != host {
		brandError(c, errBrandDomainMismatch)
		return
	}
	domain := PartnerDomain{Host: host, Kind: "primary", Status: "active"}
	if row.SiteLastSeen != nil {
		domain.VerifiedAt = row.SiteLastSeen.Unix()
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": domain})
}
