package partner

import (
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	"partner/internal/model"
)

/*
分销商文档的业务层。

两条访问路径，用的是同一套数据、不同的身份来源：

	管理侧（伙伴后台登录）  merchant_id → 查 lc_distribution_merchants 拿 site_id
	公网侧（客户站匿名）    X-Site-ID 头，由 nginx 注入，走 siteIdentityFromRequest

所以这里所有函数都以 siteID 为第一参数，不碰 merchant 概念 ——
「哪个商户」到「哪个站点」的映射只在上层各做一次。
*/

var (
	errDocNotFound      = errors.New("文档不存在")
	errDocSlugInvalid   = errors.New("标识只能用小写字母、数字和连字符")
	errDocSlugTaken     = errors.New("这个标识已被占用")
	errDocCategoryBad   = errors.New("分类不存在或不属于当前站点")
	errDocTitleBlank    = errors.New("标题不能为空")
	errDocParentCycle   = errors.New("上级分类不能是自己或自己的子分类")
	errDocNoSiteBinding = errors.New("当前商户还没有绑定站点，无法管理文档")
)

const (
	maxDocSlugLen    = 64
	maxDocTitleLen   = 255
	maxDocContentLen = 200000 // 单篇文章正文上限，约 200KB
)

/*
siteIDForMerchant 把商户 ID 映射成站点 ID。

没有绑定站点的商户不能管理文档：文档是「挂在这个域名上给访客看的」，
没有域名就没有展示位置，允许建等于给用户一堆永远看不到的数据。
这与品牌配置的处理一致（那边也是先绑定站点才能验证域名）。
*/
func siteIDForMerchant(merchantID int64) (string, error) {
	var row struct {
		SiteID *string `gorm:"column:site_id"`
	}
	err := model.DB.Table("lc_distribution_merchants").
		Select("site_id").
		Where("id = ?", merchantID).
		Take(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", errDocNoSiteBinding
		}
		return "", err
	}
	if row.SiteID == nil || strings.TrimSpace(*row.SiteID) == "" {
		return "", errDocNoSiteBinding
	}
	return strings.TrimSpace(*row.SiteID), nil
}

/*
normalizeDocSlug 校验并归一化标识。

限定字符集而不是「什么都允许」：
slug 会出现在 URL（/docs/<slug>）里，中文或空格需要编码，粘贴分享时容易断。
小写 + 数字 + 连字符是唯一不用编码还不会歧义的一组。
*/
func normalizeDocSlug(raw string) (string, error) {
	slug := strings.ToLower(strings.TrimSpace(raw))
	if slug == "" || len(slug) > maxDocSlugLen {
		return "", errDocSlugInvalid
	}
	for _, r := range slug {
		ok := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-'
		if !ok {
			return "", errDocSlugInvalid
		}
	}
	// 首尾连字符会拼出 //docs/-xxx 这种别扭路径
	if strings.HasPrefix(slug, "-") || strings.HasSuffix(slug, "-") {
		return "", errDocSlugInvalid
	}
	return slug, nil
}

func normalizeDocTitle(raw string) (string, error) {
	title := strings.TrimSpace(raw)
	if title == "" || len([]rune(title)) > maxDocTitleLen {
		return "", errDocTitleBlank
	}
	return title, nil
}

func nowUnix() int64 { return time.Now().Unix() }

/* ------------------------------------------------------------------ */
/* 分类                                                                */
/* ------------------------------------------------------------------ */

// ListDocCategories 列出某站点的全部分类（含隐藏的，后台要用）。
//
// 排序在 SQL 里做：sort 升序、同 sort 按 id 升序保证稳定 —— 否则同 sort 的
// 两个分类在两次请求里的顺序可能不同，表现为「拖拽排序后刷新又弹回去」。
func ListDocCategories(siteID string) ([]PartnerDocCategory, error) {
	var rows []PartnerDocCategory
	err := model.DB.Where("site_id = ?", siteID).
		Order("sort ASC, id ASC").
		Find(&rows).Error
	if rows == nil {
		rows = []PartnerDocCategory{}
	}
	return rows, err
}

// ListDocArticles 列出某站点的全部文章（含未发布的、含正文）。
//
// 后台编辑需要正文，所以这里不裁剪 content。公网侧是另一个函数，那边会裁。
func ListDocArticles(siteID string) ([]PartnerDocArticle, error) {
	var rows []PartnerDocArticle
	err := model.DB.Where("site_id = ?", siteID).
		Order("sort ASC, id ASC").
		Find(&rows).Error
	if rows == nil {
		rows = []PartnerDocArticle{}
	}
	return rows, err
}

type DocCategoryInput struct {
	ParentID      *int64          `json:"parent_id"`
	Slug          string          `json:"slug"`
	Kind          string          `json:"kind"`
	TitleZh       string          `json:"title_zh"`
	TitleEn       string          `json:"title_en"`
	TitleLabels   LocaleStringMap `json:"title_labels"`
	SummaryZh     string          `json:"summary_zh"`
	SummaryEn     string          `json:"summary_en"`
	SummaryLabels LocaleStringMap `json:"summary_labels"`
	Sort          int             `json:"sort"`
	Visible       *bool           `json:"visible"`
}

/*
CreateDocCategory 新建分类。

ParentID 会做归属校验：不允许把父分类指到别的站点的分类上。
这类错误平时不会发生（前端只传自己站点的 id），但接口是公开的
API 形态，多加一道判断的成本几乎为零，而它能挡住「跨站点挂载」这种
数据串味 —— 一旦发生，排查时很难想到是这里。
*/
func CreateDocCategory(siteID string, input DocCategoryInput) (*PartnerDocCategory, error) {
	slug, err := normalizeDocSlug(input.Slug)
	if err != nil {
		return nil, err
	}
	title, err := normalizeDocTitle(input.TitleZh)
	if err != nil {
		return nil, err
	}
	if input.ParentID != nil {
		if err := assertCategoryInSite(siteID, *input.ParentID); err != nil {
			return nil, err
		}
	}
	kind := strings.TrimSpace(input.Kind)
	if kind == "" {
		kind = PartnerDocKindArticles
	}
	if kind != PartnerDocKindArticles && kind != PartnerDocKindOpenAPI {
		return nil, errDocCategoryBad
	}

	// 先查一次给友好提示；真正的唯一性仍靠数据库索引兜底（并发下只有索引可靠）
	var dup int64
	if err := model.DB.Model(&PartnerDocCategory{}).
		Where("site_id = ? AND slug = ?", siteID, slug).
		Count(&dup).Error; err != nil {
		return nil, err
	}
	if dup > 0 {
		return nil, errDocSlugTaken
	}

	visible := true
	if input.Visible != nil {
		visible = *input.Visible
	}
	row := &PartnerDocCategory{
		SiteID:        siteID,
		ParentID:      input.ParentID,
		Slug:          slug,
		Kind:          kind,
		TitleZh:       title,
		TitleEn:       strings.TrimSpace(input.TitleEn),
		TitleLabels:   input.TitleLabels,
		SummaryZh:     input.SummaryZh,
		SummaryEn:     input.SummaryEn,
		SummaryLabels: input.SummaryLabels,
		Sort:          input.Sort,
		Visible:       visible,
		CreatedAt:     nowUnix(),
		UpdatedAt:     nowUnix(),
	}
	if err := model.DB.Create(row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

// UpdateDocCategory 改分类。只允许改自己站点的行 —— where 里带 site_id
// 是防越权的唯一可靠手段，不能只靠 id。
func UpdateDocCategory(siteID string, id int64, input DocCategoryInput) (*PartnerDocCategory, error) {
	var row PartnerDocCategory
	if err := model.DB.Where("site_id = ? AND id = ?", siteID, id).Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errDocNotFound
		}
		return nil, err
	}

	if slug := strings.TrimSpace(input.Slug); slug != "" && slug != row.Slug {
		next, err := normalizeDocSlug(slug)
		if err != nil {
			return nil, err
		}
		var dup int64
		if err := model.DB.Model(&PartnerDocCategory{}).
			Where("site_id = ? AND slug = ? AND id <> ?", siteID, next, id).
			Count(&dup).Error; err != nil {
			return nil, err
		}
		if dup > 0 {
			return nil, errDocSlugTaken
		}
		row.Slug = next
	}
	if title := strings.TrimSpace(input.TitleZh); title != "" {
		next, err := normalizeDocTitle(title)
		if err != nil {
			return nil, err
		}
		row.TitleZh = next
	}
	if input.ParentID != nil {
		// 不允许把分类挂到自己身上（自己当自己的父级会让树渲染成死循环）
		if *input.ParentID == row.ID {
			return nil, errDocParentCycle
		}
		if err := assertCategoryInSite(siteID, *input.ParentID); err != nil {
			return nil, err
		}
		if err := assertNotDescendant(siteID, row.ID, *input.ParentID); err != nil {
			return nil, err
		}
		row.ParentID = input.ParentID
	}
	if kind := strings.TrimSpace(input.Kind); kind != "" {
		if kind != PartnerDocKindArticles && kind != PartnerDocKindOpenAPI {
			return nil, errDocCategoryBad
		}
		row.Kind = kind
	}
	if input.TitleEn != "" {
		row.TitleEn = strings.TrimSpace(input.TitleEn)
	}
	if input.TitleLabels != nil {
		row.TitleLabels = input.TitleLabels
	}
	if input.SummaryZh != "" {
		row.SummaryZh = input.SummaryZh
	}
	if input.SummaryEn != "" {
		row.SummaryEn = input.SummaryEn
	}
	if input.SummaryLabels != nil {
		row.SummaryLabels = input.SummaryLabels
	}
	if input.Visible != nil {
		row.Visible = *input.Visible
	}
	row.Sort = input.Sort
	row.UpdatedAt = nowUnix()

	if err := model.DB.Save(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

/*
DeleteDocCategory 删分类，连同它下面的文章和子分类。

级联删除而不是「移到未分类」：文档中心的结构是运营自己搭的，
删一个分类通常是「这一块不要了」。留一堆孤立的未发布文章在库里
反而让人以为没删干净。这个决定要写在接口返回里（deleted_articles 计数），
让调用方知道连带删了多少。
*/
func DeleteDocCategory(siteID string, id int64) (map[string]int, error) {
	var row PartnerDocCategory
	if err := model.DB.Where("site_id = ? AND id = ?", siteID, id).Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errDocNotFound
		}
		return nil, err
	}

	ids := collectCategorySubtree(siteID, id)
	deletedArticles := 0
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		res := tx.Where("site_id = ? AND category_id IN ?", siteID, ids).
			Delete(&PartnerDocArticle{})
		if res.Error != nil {
			return res.Error
		}
		deletedArticles = int(res.RowsAffected)
		return tx.Where("site_id = ? AND id IN ?", siteID, ids).
			Delete(&PartnerDocCategory{}).Error
	})
	if err != nil {
		return nil, err
	}
	return map[string]int{
		"deleted_categories": len(ids),
		"deleted_articles":   deletedArticles,
	}, nil
}

// collectCategorySubtree 收集某分类及其所有后代的 ID（含自身）。
//
// 用循环 + 已访问集合而不是纯递归：脏数据里如果出现环（A 的父是 B、
// B 的父是 A），纯递归会栈溢出。while 循环遇到重复 id 就停。
func collectCategorySubtree(siteID string, rootID int64) []int64 {
	visited := map[int64]bool{rootID: true}
	out := []int64{rootID}
	frontier := []int64{rootID}
	for len(frontier) > 0 {
		var children []int64
		if err := model.DB.Model(&PartnerDocCategory{}).
			Where("site_id = ? AND parent_id IN ?", siteID, frontier).
			Pluck("id", &children).Error; err != nil {
			break
		}
		frontier = frontier[:0]
		for _, id := range children {
			if visited[id] {
				continue
			}
			visited[id] = true
			out = append(out, id)
			frontier = append(frontier, id)
		}
	}
	return out
}

// assertCategoryInSite 确认分类存在且属于当前站点。
func assertCategoryInSite(siteID string, id int64) error {
	var n int64
	if err := model.DB.Model(&PartnerDocCategory{}).
		Where("site_id = ? AND id = ?", siteID, id).
		Count(&n).Error; err != nil {
		return err
	}
	if n == 0 {
		return errDocCategoryBad
	}
	return nil
}

// assertNotDescendant 阻止把父分类设成自己的后代 —— 那会造出一个环，
// 树渲染直接无限递归。
func assertNotDescendant(siteID string, selfID, candidateParentID int64) error {
	if selfID == candidateParentID {
		return errDocParentCycle
	}
	for _, id := range collectCategorySubtree(siteID, selfID) {
		if id == candidateParentID {
			return errDocParentCycle
		}
	}
	return nil
}

type DocSortItem struct {
	ID   int64 `json:"id"`
	Sort int   `json:"sort"`
}

/*
ReorderDocCategories 批量改排序。

逐条 update 放在一个事务里：改成一条 SQL 的 CASE WHEN 会快，但那种写法
一旦拼错就是全表顺序被打乱，而且很难在 review 时看出来。这里的量级
（一个站点几十个分类）用事务足够快。
*/
func ReorderDocCategories(siteID string, items []DocSortItem) (int, error) {
	updated := 0
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		for _, item := range items {
			res := tx.Model(&PartnerDocCategory{}).
				Where("site_id = ? AND id = ?", siteID, item.ID).
				Update("sort", item.Sort)
			if res.Error != nil {
				return res.Error
			}
			updated += int(res.RowsAffected)
		}
		return nil
	})
	return updated, err
}

/* ------------------------------------------------------------------ */
/* 文章                                                                */
/* ------------------------------------------------------------------ */

type DocArticleInput struct {
	CategoryID    int64           `json:"category_id"`
	Slug          string          `json:"slug"`
	TitleZh       string          `json:"title_zh"`
	TitleEn       string          `json:"title_en"`
	TitleLabels   LocaleStringMap `json:"title_labels"`
	SummaryZh     string          `json:"summary_zh"`
	SummaryEn     string          `json:"summary_en"`
	SummaryLabels LocaleStringMap `json:"summary_labels"`
	ContentZh     string          `json:"content_zh"`
	ContentEn     string          `json:"content_en"`
	ContentLabels LocaleStringMap `json:"content_labels"`
	Sort          int             `json:"sort"`
	Published     *bool           `json:"published"`
}

func CreateDocArticle(siteID string, updatedBy int64, input DocArticleInput) (*PartnerDocArticle, error) {
	slug, err := normalizeDocSlug(input.Slug)
	if err != nil {
		return nil, err
	}
	title, err := normalizeDocTitle(input.TitleZh)
	if err != nil {
		return nil, err
	}
	if err := assertCategoryInSite(siteID, input.CategoryID); err != nil {
		return nil, err
	}
	if len(input.ContentZh) > maxDocContentLen || len(input.ContentEn) > maxDocContentLen {
		return nil, errDocTitleBlank
	}
	var dup int64
	if err := model.DB.Model(&PartnerDocArticle{}).
		Where("site_id = ? AND slug = ?", siteID, slug).
		Count(&dup).Error; err != nil {
		return nil, err
	}
	if dup > 0 {
		return nil, errDocSlugTaken
	}

	published := false
	if input.Published != nil {
		published = *input.Published
	}
	row := &PartnerDocArticle{
		SiteID:        siteID,
		CategoryID:    input.CategoryID,
		Slug:          slug,
		TitleZh:       title,
		TitleEn:       strings.TrimSpace(input.TitleEn),
		TitleLabels:   input.TitleLabels,
		SummaryZh:     input.SummaryZh,
		SummaryEn:     input.SummaryEn,
		SummaryLabels: input.SummaryLabels,
		ContentZh:     input.ContentZh,
		ContentEn:     input.ContentEn,
		ContentLabels: input.ContentLabels,
		Sort:          input.Sort,
		Published:     published,
		UpdatedBy:     updatedBy,
		CreatedAt:     nowUnix(),
		UpdatedAt:     nowUnix(),
	}
	if err := model.DB.Create(row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

func UpdateDocArticle(siteID string, id, updatedBy int64, input DocArticleInput) (*PartnerDocArticle, error) {
	var row PartnerDocArticle
	if err := model.DB.Where("site_id = ? AND id = ?", siteID, id).Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errDocNotFound
		}
		return nil, err
	}

	if slug := strings.TrimSpace(input.Slug); slug != "" && slug != row.Slug {
		next, err := normalizeDocSlug(slug)
		if err != nil {
			return nil, err
		}
		var dup int64
		if err := model.DB.Model(&PartnerDocArticle{}).
			Where("site_id = ? AND slug = ? AND id <> ?", siteID, next, id).
			Count(&dup).Error; err != nil {
			return nil, err
		}
		if dup > 0 {
			return nil, errDocSlugTaken
		}
		row.Slug = next
	}
	if input.CategoryID > 0 {
		if err := assertCategoryInSite(siteID, input.CategoryID); err != nil {
			return nil, err
		}
		row.CategoryID = input.CategoryID
	}
	if title := strings.TrimSpace(input.TitleZh); title != "" {
		next, err := normalizeDocTitle(title)
		if err != nil {
			return nil, err
		}
		row.TitleZh = next
	}
	if input.TitleEn != "" {
		row.TitleEn = strings.TrimSpace(input.TitleEn)
	}
	if input.TitleLabels != nil {
		row.TitleLabels = input.TitleLabels
	}
	if input.SummaryZh != "" {
		row.SummaryZh = input.SummaryZh
	}
	if input.SummaryEn != "" {
		row.SummaryEn = input.SummaryEn
	}
	if input.SummaryLabels != nil {
		row.SummaryLabels = input.SummaryLabels
	}
	/*
	 * 正文每次都整体覆盖，不做「非空才更新」。
	 *
	 * 这和标题的处理不同：标题为空是无意义的（有 NOT NULL 语义），
	 * 而正文为空是合法的编辑结果（作者清空了一篇文章准备重写）。
	 * 如果正文也按非空判断，用户会发现自己删不光内容，非常困惑。
	 */
	row.ContentZh = input.ContentZh
	row.ContentEn = input.ContentEn
	if input.ContentLabels != nil {
		row.ContentLabels = input.ContentLabels
	}
	if input.Published != nil {
		row.Published = *input.Published
	}
	row.Sort = input.Sort
	row.UpdatedBy = updatedBy
	row.UpdatedAt = nowUnix()

	if err := model.DB.Save(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func DeleteDocArticle(siteID string, id int64) error {
	res := model.DB.Where("site_id = ? AND id = ?", siteID, id).Delete(&PartnerDocArticle{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return errDocNotFound
	}
	return nil
}

func GetDocArticle(siteID string, id int64) (*PartnerDocArticle, error) {
	var row PartnerDocArticle
	if err := model.DB.Where("site_id = ? AND id = ?", siteID, id).Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errDocNotFound
		}
		return nil, err
	}
	return &row, nil
}

func ReorderDocArticles(siteID string, items []DocSortItem) (int, error) {
	updated := 0
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		for _, item := range items {
			res := tx.Model(&PartnerDocArticle{}).
				Where("site_id = ? AND id = ?", siteID, item.ID).
				Update("sort", item.Sort)
			if res.Error != nil {
				return res.Error
			}
			updated += int(res.RowsAffected)
		}
		return nil
	})
	return updated, err
}

/* ------------------------------------------------------------------ */
/* 公网侧                                                              */
/* ------------------------------------------------------------------ */

// PublicDocArticle 是公网能看到的文章，不带 updated_by / published 这类内部字段。
type PublicDocArticle struct {
	Slug          string          `json:"slug"`
	CategorySlug  string          `json:"category_slug"`
	CategoryTitle string          `json:"category_title"`
	Title         string          `json:"title"`
	TitleLabels   LocaleStringMap `json:"title_labels,omitempty"`
	Summary       string          `json:"summary"`
	SummaryLabels LocaleStringMap `json:"summary_labels,omitempty"`
	Content       string          `json:"content"`
	ContentLabels LocaleStringMap `json:"content_labels,omitempty"`
	UpdatedAt     int64           `json:"updated_at"`
}

/*
ListPublicDocCategories 只返回可见分类。

公网侧一律过滤 visible=false：那个开关的语义就是「后台留着但前台别显示」，
把它漏出去等于让这个开关失效。
*/
func ListPublicDocCategories(siteID string) ([]PartnerDocCategory, error) {
	var rows []PartnerDocCategory
	err := model.DB.Where("site_id = ? AND visible = ?", siteID, true).
		Order("sort ASC, id ASC").
		Find(&rows).Error
	if rows == nil {
		rows = []PartnerDocCategory{}
	}
	return rows, err
}

// ListPublicDocArticles 只返回已发布文章，且不带正文（目录页用不到，
// 全带上会让一个几十篇文章的站点首屏多传几百 KB）。
func ListPublicDocArticles(siteID string) ([]PartnerDocArticle, error) {
	var rows []PartnerDocArticle
	err := model.DB.Select(
		"id, site_id, category_id, slug, title_zh, title_en, title_labels, "+
			"summary_zh, summary_en, summary_labels, sort, published, created_at, updated_at",
	).Where("site_id = ? AND published = ?", siteID, true).
		Order("sort ASC, id ASC").
		Find(&rows).Error
	if rows == nil {
		rows = []PartnerDocArticle{}
	}
	return rows, err
}

// GetPublicDocArticle 按 slug 取一篇已发布文章。
func GetPublicDocArticle(siteID, slug string) (*PartnerDocArticle, error) {
	var row PartnerDocArticle
	err := model.DB.Where("site_id = ? AND slug = ? AND published = ?", siteID, slug, true).
		Take(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errDocNotFound
		}
		return nil, err
	}
	return &row, nil
}
