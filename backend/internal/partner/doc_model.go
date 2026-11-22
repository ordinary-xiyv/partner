package partner

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"strings"
)

/*
按站点存的分销商文档。

为什么不在主站的 lc_doc_categories / lc_doc_articles 上加 site_id，而是另起一套表：

  1. 那两张表的 slug 是**全局唯一索引**。要支持「每个站点都有自己的
     getting-started」，必须把它改成 (site_id, slug) 联合唯一 —— 这是对
     主站库的结构性变更，影响面远大于本需求。
  2. 主站那 31 个分类 / 63 篇文章需要在迁移时回填 site_id，否则新逻辑取不到，
     回填脚本一旦写错就是把线上文档搞乱。
  3. 伙伴侧会持续演进（比如以后加「按套餐限制文档数量」），
     不该让这些字段污染主站表。

代价是两套表结构长得像但不相干，需要一次性的内容导入（见 seed 部分）。
这个代价是一次性的，而改主站索引的风险是持续的。

站点维度用的是 site_id 而不是 merchant_id：
文档归属的是「这个域名上的站点」，和品牌配置的归属方式保持一致 ——
都是按 (site_id, site_domain) 认人。用 merchant_id 也能实现，但那样
「一个商户多个站点」的场景就得再改一次表。
*/

// PartnerDocKind 分类的行为类型。
//
// articles = 展开后是文章列表；openapi = 特殊分类，承载 OpenAPI 规范。
// 现在只实现 articles，保留 openapi 是为了和老项目的数据对齐 ——
// 导入时遇到 openapi 分类能识别出来，不至于当成普通分类渲染成空目录。
const (
	PartnerDocKindArticles = "articles"
	PartnerDocKindOpenAPI  = "openapi"
)

/*
PartnerDocCategory 文档分类（按站点隔离）。

table: lc_partner_doc_categories，唯一索引 (site_id, slug)。
*/
type PartnerDocCategory struct {
	ID       int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	SiteID   string `json:"site_id" gorm:"type:varchar(64);not null;uniqueIndex:idx_partner_doc_cat_site_slug,priority:1"`
	ParentID *int64 `json:"parent_id" gorm:"index"`
	// slug 只在同一站点内唯一。老库里 slug 是全局唯一的，那会让第二个站点
	// 想建 getting-started 时直接撞唯一键 —— 这正是不能复用老表的根本原因。
	Slug           string          `json:"slug" gorm:"type:varchar(64);not null;uniqueIndex:idx_partner_doc_cat_site_slug,priority:2"`
	Kind           string          `json:"kind" gorm:"type:varchar(16);not null;default:articles"`
	TitleZh        string          `json:"title_zh" gorm:"type:varchar(255)"`
	TitleEn        string          `json:"title_en" gorm:"type:varchar(255)"`
	TitleLabels    LocaleStringMap `json:"title_labels,omitempty" gorm:"type:text"`
	SummaryZh      string          `json:"summary_zh" gorm:"type:text"`
	SummaryEn      string          `json:"summary_en" gorm:"type:text"`
	SummaryLabels  LocaleStringMap `json:"summary_labels,omitempty" gorm:"type:text"`
	Sort           int             `json:"sort" gorm:"default:0"`
	Visible        bool            `json:"visible" gorm:"default:true"`
	CreatedAt      int64           `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt      int64           `json:"updated_at" gorm:"autoUpdateTime"`
}

func (PartnerDocCategory) TableName() string { return "lc_partner_doc_categories" }

/*
PartnerDocArticle 文档文章（按站点隔离）。

table: lc_partner_doc_articles，唯一索引 (site_id, slug)。
*/
type PartnerDocArticle struct {
	ID       int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	SiteID   string `json:"site_id" gorm:"type:varchar(64);not null;uniqueIndex:idx_partner_doc_art_site_slug,priority:1"`
	// CategoryID 指向同站点的分类。不建外键约束：分类删掉时文章怎么处理
	// 是业务决定（级联删还是移到「未分类」），交给代码控制比让数据库报错好排查。
	CategoryID    int64           `json:"category_id" gorm:"index;not null"`
	Slug          string          `json:"slug" gorm:"type:varchar(64);not null;uniqueIndex:idx_partner_doc_art_site_slug,priority:2"`
	TitleZh       string          `json:"title_zh" gorm:"type:varchar(255)"`
	TitleEn       string          `json:"title_en" gorm:"type:varchar(255)"`
	TitleLabels   LocaleStringMap `json:"title_labels,omitempty" gorm:"type:text"`
	SummaryZh     string          `json:"summary_zh" gorm:"type:text"`
	SummaryEn     string          `json:"summary_en" gorm:"type:text"`
	SummaryLabels LocaleStringMap `json:"summary_labels,omitempty" gorm:"type:text"`
	ContentZh     string          `json:"content_zh" gorm:"type:text"`
	ContentEn     string          `json:"content_en" gorm:"type:text"`
	ContentLabels LocaleStringMap `json:"content_labels,omitempty" gorm:"type:text"`
	Sort          int             `json:"sort" gorm:"default:0"`
	Published     bool            `json:"published" gorm:"default:false"`
	// UpdatedBy 记的是伙伴账号 ID（不是站点 ID）。审计用：
	// 「这篇文章是谁改的」比「改成什么」更容易追责。
	UpdatedBy int64 `json:"updated_by"`
	CreatedAt int64 `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt int64 `json:"updated_at" gorm:"autoUpdateTime"`
}

func (PartnerDocArticle) TableName() string { return "lc_partner_doc_articles" }

/*
LocaleStringMap 多语种字段。

存成 text 而不是 jsonb 列：主站也是这么存的，导入导出时不用做类型转换，
而且 MySQL / SQLite 部署下也能跑（jsonb 是 PostgreSQL 专有）。
读的时候统一走 Value()，空值给空 map，前端不必判 null —— 这一点和老项目
保持一致，前端代码可以两边通用。

为什么不直接用 map[string]string + driver.Valuer：
GORM 对 map 的处理依赖序列化钩子，没实现 Scanner 时从库里读出来是 nil，
表现为「保存成功但刷新就没了」。这一层必须自己写，否则是个很隐蔽的坑。
*/
type LocaleStringMap map[string]string

func (m LocaleStringMap) Value() (driver.Value, error) {
	if len(m) == 0 {
		return nil, nil
	}
	b, err := json.Marshal(map[string]string(m))
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func (m *LocaleStringMap) Scan(value any) error {
	if m == nil {
		return fmt.Errorf("LocaleStringMap: Scan 需要非 nil 指针")
	}
	if value == nil {
		*m = LocaleStringMap{}
		return nil
	}
	var raw []byte
	switch v := value.(type) {
	case []byte:
		raw = v
	case string:
		raw = []byte(v)
	default:
		return fmt.Errorf("LocaleStringMap: 不支持的列类型 %T", value)
	}
	if len(strings.TrimSpace(string(raw))) == 0 {
		*m = LocaleStringMap{}
		return nil
	}
	out := map[string]string{}
	if err := json.Unmarshal(raw, &out); err != nil {
		// 脏数据不让整条记录读取失败：当作没配多语种，回落到 title_zh / title_en。
		// 让读取失败等于把一条坏 json 放大成「文档中心打不开」。
		*m = LocaleStringMap{}
		return nil
	}
	*m = LocaleStringMap(out)
	return nil
}
