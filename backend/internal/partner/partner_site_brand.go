package partner

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"partner/internal/model"
)

/*
客户站（partner/web-user）按站点身份读品牌。

和 /api/partner/brand 的区别是「谁在问」：
  · /api/partner/brand  —— 伙伴后台自己登录后来读，身份来自 cookie session
  · 本文件这个接口        —— 客户站页面匿名来读，身份来自代理注入的三个头

数据源完全一样，都是 lc_distribution_merchants 的 brand_* 列。这就是「两套平台
互不影响，但共用一份数据」的落点：伙伴后台改完，客户站下次刷新就是新的，
不需要任何同步动作。

三个头的来历（与 lynxtonapi 的站点身份约定一致）：
	X-Site-ID          商户绑定的 site_id
	X-Site-Host        商户绑定的 site_domain
	X-Site-Credential  32 字节凭证的 64 位小写十六进制原文

头由 nginx 在服务端注入，浏览器不参与 —— 这一点很关键。如果让浏览器能带这三个头，
任何人打开 devtools 就能伪造成任意商户的站点，白标就形同虚设。所以：
  · 本接口不做 CORS 放行，只在同源页面被调用
  · 凭证比对用 sha256 + 常量时间比较，不给时序侧信道留口子
*/

// 站点身份缺失/不匹配时的统一措辞。
//
// 故意不区分「没绑站点」「站点 ID 不存在」「凭证错」三种情况：
// 分开报错等于告诉攻击者「这个 site_id 是存在的，继续猜凭证」。
// 对运维来说，日志里记下具体原因即可，不必回给调用方。
var errSiteIdentityInvalid = errors.New("站点身份无效")

// siteIdentity 是一次请求解析出来的站点身份。
//
// 带上 MerchantID 是因为调用方紧接着就要用它读品牌 —— 校验阶段已经查到这一行了，
// 再单独查一次 merchant_id 等于把同一条记录读两遍，多一次往返也多了「两次读到不同结果」的窗口。
type siteIdentity struct {
	MerchantID int64
	SiteID     string
	SiteHost   string
}

// 请求头名。写成常量是为了让「改头名」只改一处 ——
// 这三个字符串同时出现在 nginx 配置、vite 代理和这里，改漏一个就是全站读不到品牌。
const (
	headerSiteID         = "X-Site-ID"
	headerSiteHost       = "X-Site-Host"
	headerSiteCredential = "X-Site-Credential"
)

// 站点凭证是 32 字节随机数的十六进制形式，固定 64 个字符。
const siteCredentialHexLen = 64

// siteIdentityFromRequest 校验三个头，返回解析出的站点身份。
//
// 校验顺序：先看头齐不齐（便宜），再查库（贵），最后比凭证。
// 反过来做会让一个不带头的请求也去查一次库，白白消耗连接池。
func siteIdentityFromRequest(c *gin.Context) (siteIdentity, error) {
	siteID := strings.TrimSpace(c.GetHeader(headerSiteID))
	siteHost := strings.TrimSpace(c.GetHeader(headerSiteHost))
	credential := strings.ToLower(strings.TrimSpace(c.GetHeader(headerSiteCredential)))
	if siteID == "" || siteHost == "" || credential == "" {
		return siteIdentity{}, errSiteIdentityInvalid
	}
	// 凭证必须正好是 32 字节的十六进制。长度不对就不必查库了。
	if len(credential) != siteCredentialHexLen {
		return siteIdentity{}, errSiteIdentityInvalid
	}
	if _, err := hex.DecodeString(credential); err != nil {
		return siteIdentity{}, errSiteIdentityInvalid
	}

	/*
	 * 哈希的是「64 位十六进制字符串本身」，不是解码后的 32 字节。
	 *
	 * 这一点很容易搞错，而且错了只表现为「怎么都对不上」，没有任何报错线索：
	 * 库里 site_credential_hash = sha256(hex 明文串)。实测比对过 ——
	 *   echo -n "$USER_SITE_CREDENTIAL" | shasum -a 256  ==  库里的 32 字节
	 * 所以对字符串取 sha256，不要去哈希 hex.Decode 的结果。
	 */
	sum := sha256.Sum256([]byte(credential))

	var row struct {
		ID                 int64  `gorm:"column:id"`
		SiteID             string `gorm:"column:site_id"`
		SiteDomain         string `gorm:"column:site_domain"`
		SiteCredentialHash []byte `gorm:"column:site_credential_hash"`
	}
	/*
	 * 三个字段一起作为查询条件。
	 *
	 * 用 (site_id, site_domain) 定位而不是只用 site_id：这两个列上各有唯一索引，
	 * 联起来查能同时验证「站点 ID 属于这个域名」，防止有人拿 A 商户的 site_id
	 * 配 B 商户的域名来试探。凭证仍然单独做常量时间比对，不放进 SQL。
	 */
	err := model.DB.Table("lc_distribution_merchants").
		Select("id, site_id, site_domain, site_credential_hash").
		Where("site_id = ? AND site_domain = ?", siteID, siteHost).
		Take(&row).Error
	if err != nil {
		return siteIdentity{}, errSiteIdentityInvalid
	}
	// 库里没绑定凭证的商户不能走这条路（site_binding_complete 约束保证要么全有要么全无，
	// 这里再判一次是因为约束可能在某些部署里没跑到）
	if len(row.SiteCredentialHash) != sha256.Size {
		return siteIdentity{}, errSiteIdentityInvalid
	}
	// 常量时间比较：普通 != 会在第一个不同字节处返回，理论上能被计时探测出前缀
	if subtle.ConstantTimeCompare(row.SiteCredentialHash, sum[:]) != 1 {
		return siteIdentity{}, errSiteIdentityInvalid
	}
	return siteIdentity{MerchantID: row.ID, SiteID: row.SiteID, SiteHost: row.SiteDomain}, nil
}

/*
PublicSiteBrand 是返回给客户站的品牌。

刻意不返回 MerchantID / MerchantCode，以及 Landing 的其余内容：

	· MerchantID、MerchantCode 是平台内部标识，客户站用不到，暴露出去只是给爬虫送信息
	· Landing 里的标题/卖点等文案属于平台侧首页内容，不在伙伴可配范围内；
	  这里只挑出 layout_style 一个字段——它是「用哪套首页骨架」的开关，
	  正是伙伴后台需要决定的事。

APIBaseURL 会下发（见下方字段注释）。早先的版本刻意不下发，理由是
「接口地址由部署环境决定，不该由商户随便改」。这个顾虑是对的，但不能靠
不下发来解决 —— 因为客户站的首页示例和接入文档必须展示一个地址，
不下发就只能回落到主站的 server_address，分销商的客户照着复制就看到
主站的 IP，那才是真问题。现在改成：下发，但在写入侧做格式校验
（只允许 http/https 绝对地址，见 partner_brand.go 的 brandBaseURLPattern），
客户站拿到后优先用它。

字段命名对齐 web-user 的既有约定（snake_case），免得前端再翻译一层。
*/
type PublicSiteBrand struct {
	Name         string `json:"name"`
	ShortName    string `json:"short_name"`
	LogoURL      string `json:"logo_url"`
	PrimaryColor string `json:"primary_color"`
	PageTitle    string `json:"page_title"`
	FaviconURL   string `json:"favicon_url"`
	Tagline      string `json:"tagline"`
	Support      any    `json:"support"`
	/**
	 * 接口基地址。客户站的首页代码示例和文档「环境」表格都用它。
	 *
	 * 空串表示伙伴没配，客户站自行兜底（优先 window.location.origin，
	 * 绝不再回落到主站的 server_address —— 见 sdkSnippets.resolveSiteBaseUrl）。
	 */
	APIBaseURL string `json:"api_base_url"`
	/**
	 * 首页风格。空串表示「没选过」，客户站按自己的默认值兜底。
	 *
	 * 单独摊平成一个字段而不是返回整个 landing 对象：客户站只需要这一个开关，
	 * 给它一坨 jsonb 等于邀请前端去读那些不该它管的字段，将来后端加内部配置
	 * 又要重新审一遍「哪些能漏出去」。
	 */
	HomeStyle string `json:"home_style"`
	/**
	 * 页脚版权行。null 表示伙伴没配过，客户站回落到平台侧的值。
	 *
	 * 和 HomeStyle 一样从 brand_landing 里挑出来（存 brand_landing.footer），
	 * 不新增数据库列 —— lc_distribution_merchants 是主平台表，伙伴后端只读不建，
	 * 加列要动主平台的迁移，代价远大于收益。
	 *
	 * 之所以单独摊开成一个对象而不是让客户站自己读 landing：
	 * landing 里还有 hero_title / highlights 这类首页内容，属于平台侧管辖，
	 * 客户站不该为了拿一句版权文字去遍历它。
	 */
	Footer *PublicSiteFooter `json:"footer"`
}

/*
PublicSiteFooter 是页脚版权行的可配内容。

四个字段都对应客户站 SiteAppearance 上已有的槽位，不引入新概念：
	copyright_text → 版权文字整句（如「© 2026 某某公司 版权所有」）
	terms_label    → 「网站条款」那几个字
	privacy_label  → 「隐私政策声明」那几个字
	beian_label    → ICP 备案号

用指针是为了区分「伙伴没配」（nil，客户站回落平台值）和
「伙伴明确清空」（空串，客户站就不显示这一项）。
如果都用值类型，商户想隐藏备案号这件事在协议上就无法表达。
*/
type PublicSiteFooter struct {
	CopyrightText *string `json:"copyright_text"`
	TermsLabel    *string `json:"terms_label"`
	PrivacyLabel  *string `json:"privacy_label"`
	BeianLabel    *string `json:"beian_label"`
	/** 整块显隐。nil 表示没配过，客户站沿用平台侧的开关 */
	Enabled *bool `json:"enabled"`
}

/*
homeStyleFromLanding 从 brand_landing 里挑出 layout_style。

读不出来（没配 / 不是对象 / 字段不存在）一律返回空串，交给客户站兜底 ——
首页风格不该因为一条脏数据就渲染失败，那等于让访客看到白屏。
*/
func homeStyleFromLanding(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var probe struct {
		LayoutStyle string `json:"layout_style"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return ""
	}
	return strings.TrimSpace(probe.LayoutStyle)
}

/*
footerFromLanding 从 brand_landing 里挑出 footer 子对象。

和 homeStyleFromLanding 同样是「读不出来就当没配」：landing 可能
是空、是 null、不是对象、或者 footer 是个字符串（历史脏数据），
这些情况都返回 nil 让客户站回落到平台值，而不是让接口 500 ——
一句版权文字读失败不该让整个站点读不到品牌。

注意 footer 里的字段也逐个判空：任意一项为空串就当成「没配」返回 nil，
不把空串下发。原因是客户站对「空串」和「null」的处理必须区分
（null=回落平台值，空串=隐藏这一项），如果后端把「没配」写成空串，
商户明明没动过版权配置，客户站的备案号却会消失。
*/
func footerFromLanding(raw json.RawMessage) *PublicSiteFooter {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var probe struct {
		Footer *PublicSiteFooter `json:"footer"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return nil
	}
	if probe.Footer == nil {
		return nil
	}
	// 全空 + 没传开关 = 这个商户压根没配过页脚，返回 nil 让上层回落
	footer := probe.Footer
	hasText := false
	for _, field := range []*string{footer.CopyrightText, footer.TermsLabel, footer.PrivacyLabel, footer.BeianLabel} {
		if field != nil {
			hasText = true
			break
		}
	}
	if !hasText && footer.Enabled == nil {
		return nil
	}
	return footer
}

/*
toPublicSiteBrand 把完整品牌裁成客户站需要的那几个字段。

为什么单独写一个转换而不是直接返回 MerchantBrand：
把「内部可见」和「公网可见」分成两个类型，将来给 MerchantBrand 加内部字段
（比如结算配置、内部备注）时，不会顺手泄漏到公网接口上。这类事故很难在
评审时看出来 —— 加字段的人以为自己只动了后台。
*/
func toPublicSiteBrand(brand MerchantBrand) PublicSiteBrand {
	var support any = map[string]any{}
	if len(brand.Support) > 0 && string(brand.Support) != "null" {
		// 解析失败就给空对象：客户站拿到的永远是能安全遍历的结构，
		// 不必在渲染层再写一层「如果是字符串怎么办」的防御
		if err := json.Unmarshal(brand.Support, &support); err != nil {
			support = map[string]any{}
		}
	}
	return PublicSiteBrand{
		Name:         brand.Name,
		ShortName:    brand.ShortName,
		LogoURL:      brand.LogoURL,
		PrimaryColor: brand.PrimaryColor,
		PageTitle:    brand.PageTitle,
		FaviconURL:   brand.FaviconURL,
		Tagline:      brand.Tagline,
		Support:      support,
		APIBaseURL:   strings.TrimSpace(brand.APIBaseURL),
		HomeStyle:    homeStyleFromLanding(brand.Landing),
		Footer:       footerFromLanding(brand.Landing),
	}
}

/*
PublicSiteBrandAPI GET /api/partner/public/site-brand

客户站启动时调一次，拿到本站的品牌。匿名可访问，靠站点身份头认人。
*/
func PublicSiteBrandAPI(c *gin.Context) {
	identity, err := siteIdentityFromRequest(c)
	if err != nil {
		// 403 而不是 401：这是「这个站点无权访问」，不是「你没登录」
		partnerError(c, http.StatusForbidden, errSiteIdentityInvalid.Error())
		return
	}
	brand, err := GetMerchantBrand(identity.MerchantID)
	if err != nil {
		partnerError(c, http.StatusInternalServerError, "读取品牌配置失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": toPublicSiteBrand(brand)})
}
