package partner

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"partner/internal/model"
)

/*
文档中心接口层。

分两组：
	/api/partner/docs/*           管理侧，需要伙伴登录态（挂在 ready 组下）
	/api/partner/public/docs/*    公网侧，靠站点身份头（挂在 p 组下，匿名）

两组的返回结构保持 web-user 现有 doccenterService 能直接消化的形状，
这样客户站只换数据源、不换渲染逻辑。
*/

func docError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, errDocNotFound):
		partnerError(c, http.StatusNotFound, err.Error())
	case errors.Is(err, errDocSlugInvalid),
		errors.Is(err, errDocSlugTaken),
		errors.Is(err, errDocCategoryBad),
		errors.Is(err, errDocTitleBlank),
		errors.Is(err, errDocParentCycle):
		partnerError(c, http.StatusBadRequest, err.Error())
	case errors.Is(err, errDocNoSiteBinding):
		// 409 而不是 400：这不是「请求写错了」，是「当前状态不允许这个操作」。
		// 前端可以据此引导用户先去绑定站点，而不是让用户反复改请求参数。
		partnerError(c, http.StatusConflict, err.Error())
	default:
		partnerError(c, http.StatusInternalServerError, "文档操作失败")
	}
}

// docSiteFromContext 取当前登录商户绑定的站点 ID。
func docSiteFromContext(c *gin.Context) (string, bool) {
	siteID, err := siteIDForMerchant(c.GetInt64("partner_merchant_id"))
	if err != nil {
		docError(c, err)
		return "", false
	}
	return siteID, true
}

// docTablesOK 表没建好时给出可操作的提示，而不是让底层 SQL 错误直接漏出去。
func docTablesOK(c *gin.Context) bool {
	if DocTablesReady(model.DB) {
		return true
	}
	partnerError(c, http.StatusServiceUnavailable, "文档功能尚未初始化，请先执行建表脚本")
	return false
}

// ---------- 管理侧 ----------

/*
AdminDocTreeAPI GET /api/partner/docs/tree

一次返回分类 + 文章（含正文）。

为什么不拆成两个请求：后台树面板需要同时渲染「分类 → 文章」两层，
拆开就要处理两个 loading 态和它们之间的竞态（树先到、文章后到会让
子节点闪一下）。这个量级（几十个分类、几十篇文章）一次传完更省事。
*/
func AdminDocTreeAPI(c *gin.Context) {
	if !docTablesOK(c) {
		return
	}
	siteID, ok := docSiteFromContext(c)
	if !ok {
		return
	}
	categories, err := ListDocCategories(siteID)
	if err != nil {
		docError(c, err)
		return
	}
	articles, err := ListDocArticles(siteID)
	if err != nil {
		docError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"site_id":    siteID,
			"categories": categories,
			"articles":   articles,
		},
	})
}

// AdminDocCategoryCreateAPI POST /api/partner/docs/categories
func AdminDocCategoryCreateAPI(c *gin.Context) {
	if !docTablesOK(c) {
		return
	}
	siteID, ok := docSiteFromContext(c)
	if !ok {
		return
	}
	var input DocCategoryInput
	if err := c.ShouldBindJSON(&input); err != nil {
		partnerError(c, http.StatusBadRequest, "分类数据格式错误")
		return
	}
	row, err := CreateDocCategory(siteID, input)
	if err != nil {
		docError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": row})
}

// AdminDocCategoryUpdateAPI PUT /api/partner/docs/categories/:id
func AdminDocCategoryUpdateAPI(c *gin.Context) {
	if !docTablesOK(c) {
		return
	}
	siteID, ok := docSiteFromContext(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		partnerError(c, http.StatusBadRequest, "分类 ID 无效")
		return
	}
	var input DocCategoryInput
	if err := c.ShouldBindJSON(&input); err != nil {
		partnerError(c, http.StatusBadRequest, "分类数据格式错误")
		return
	}
	row, err := UpdateDocCategory(siteID, id, input)
	if err != nil {
		docError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": row})
}

// AdminDocCategoryDeleteAPI DELETE /api/partner/docs/categories/:id
func AdminDocCategoryDeleteAPI(c *gin.Context) {
	if !docTablesOK(c) {
		return
	}
	siteID, ok := docSiteFromContext(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		partnerError(c, http.StatusBadRequest, "分类 ID 无效")
		return
	}
	stats, err := DeleteDocCategory(siteID, id)
	if err != nil {
		docError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": stats})
}

// AdminDocCategoryReorderAPI PUT /api/partner/docs/categories/reorder
func AdminDocCategoryReorderAPI(c *gin.Context) {
	if !docTablesOK(c) {
		return
	}
	siteID, ok := docSiteFromContext(c)
	if !ok {
		return
	}
	var body struct {
		Items []DocSortItem `json:"items"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		partnerError(c, http.StatusBadRequest, "排序数据格式错误")
		return
	}
	updated, err := ReorderDocCategories(siteID, body.Items)
	if err != nil {
		docError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"updated": updated}})
}

// AdminDocArticleGetAPI GET /api/partner/docs/articles/:id
func AdminDocArticleGetAPI(c *gin.Context) {
	if !docTablesOK(c) {
		return
	}
	siteID, ok := docSiteFromContext(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		partnerError(c, http.StatusBadRequest, "文章 ID 无效")
		return
	}
	row, err := GetDocArticle(siteID, id)
	if err != nil {
		docError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": row})
}

// AdminDocArticleCreateAPI POST /api/partner/docs/articles
func AdminDocArticleCreateAPI(c *gin.Context) {
	if !docTablesOK(c) {
		return
	}
	siteID, ok := docSiteFromContext(c)
	if !ok {
		return
	}
	var input DocArticleInput
	if err := c.ShouldBindJSON(&input); err != nil {
		partnerError(c, http.StatusBadRequest, "文章数据格式错误")
		return
	}
	row, err := CreateDocArticle(siteID, c.GetInt64("partner_merchant_id"), input)
	if err != nil {
		docError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": row})
}

// AdminDocArticleUpdateAPI PUT /api/partner/docs/articles/:id
func AdminDocArticleUpdateAPI(c *gin.Context) {
	if !docTablesOK(c) {
		return
	}
	siteID, ok := docSiteFromContext(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		partnerError(c, http.StatusBadRequest, "文章 ID 无效")
		return
	}
	var input DocArticleInput
	if err := c.ShouldBindJSON(&input); err != nil {
		partnerError(c, http.StatusBadRequest, "文章数据格式错误")
		return
	}
	row, err := UpdateDocArticle(siteID, id, c.GetInt64("partner_merchant_id"), input)
	if err != nil {
		docError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": row})
}

// AdminDocArticleDeleteAPI DELETE /api/partner/docs/articles/:id
func AdminDocArticleDeleteAPI(c *gin.Context) {
	if !docTablesOK(c) {
		return
	}
	siteID, ok := docSiteFromContext(c)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		partnerError(c, http.StatusBadRequest, "文章 ID 无效")
		return
	}
	if err := DeleteDocArticle(siteID, id); err != nil {
		docError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"deleted": 1}})
}

// AdminDocArticleReorderAPI PUT /api/partner/docs/articles/reorder
func AdminDocArticleReorderAPI(c *gin.Context) {
	if !docTablesOK(c) {
		return
	}
	siteID, ok := docSiteFromContext(c)
	if !ok {
		return
	}
	var body struct {
		Items []DocSortItem `json:"items"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		partnerError(c, http.StatusBadRequest, "排序数据格式错误")
		return
	}
	updated, err := ReorderDocArticles(siteID, body.Items)
	if err != nil {
		docError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"updated": updated}})
}

// ---------- 公网侧 ----------

/*
PublicDocTreeAPI GET /api/partner/public/docs/tree?lang=zh

客户站文档页的目录数据，匿名可访问，靠三个站点身份头认人。

返回结构与 web-user 的 PublicDocsTree 对齐：
	categories[].nodes[] = { type: 'category' | 'article', data: {...} }
这样客户站不必为伙伴数据源再写一套树渲染。
*/
func PublicDocTreeAPI(c *gin.Context) {
	identity, err := siteIdentityFromRequest(c)
	if err != nil {
		partnerError(c, http.StatusForbidden, errSiteIdentityInvalid.Error())
		return
	}
	if !DocTablesReady(model.DB) {
		// 客户站不能因为文档表没建就整页 500。给一个空树，
		// 前端会显示「暂无内容」，比白屏或报错好。
		c.JSON(http.StatusOK, gin.H{"success": true, "data": emptyPublicTree(langParam(c))})
		return
	}
	siteID := identity.SiteID
	categories, err := ListPublicDocCategories(siteID)
	if err != nil {
		partnerError(c, http.StatusInternalServerError, "读取文档目录失败")
		return
	}
	articles, err := ListPublicDocArticles(siteID)
	if err != nil {
		partnerError(c, http.StatusInternalServerError, "读取文档目录失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    buildPublicTree(langParam(c), siteID, categories, articles),
	})
}

// PublicDocArticleAPI GET /api/partner/public/docs/articles/:slug?lang=zh
func PublicDocArticleAPI(c *gin.Context) {
	identity, err := siteIdentityFromRequest(c)
	if err != nil {
		partnerError(c, http.StatusForbidden, errSiteIdentityInvalid.Error())
		return
	}
	if !DocTablesReady(model.DB) {
		partnerError(c, http.StatusNotFound, errDocNotFound.Error())
		return
	}
	slug := strings.TrimSpace(c.Param("slug"))
	if slug == "" {
		partnerError(c, http.StatusBadRequest, "文章标识不能为空")
		return
	}
	row, err := GetPublicDocArticle(identity.SiteID, slug)
	if err != nil {
		docError(c, err)
		return
	}
	// 分类标题要一起给：文章页顶部会显示「所属分类」这个眉标
	var categoryTitle string
	var cat PartnerDocCategory
	if err := model.DB.Where("site_id = ? AND id = ?", identity.SiteID, row.CategoryID).
		Take(&cat).Error; err == nil {
		categoryTitle = pickLocalized(cat.TitleZh, cat.TitleEn, cat.TitleLabels, langParam(c))
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"slug":           row.Slug,
			"category_slug":  cat.Slug,
			"category_title": categoryTitle,
			"lang":           langParam(c),
			"title":          pickLocalized(row.TitleZh, row.TitleEn, row.TitleLabels, langParam(c)),
			"summary":        pickLocalized(row.SummaryZh, row.SummaryEn, row.SummaryLabels, langParam(c)),
			"content":        pickLocalized(row.ContentZh, row.ContentEn, row.ContentLabels, langParam(c)),
			"updated_at":     row.UpdatedAt,
			"prev":           nil,
			"next":           nil,
		},
	})
}

// langParam 取语种，只认 zh / en。
//
// 不认识的语种一律当 zh：文档内容目前只有中英两套，俄语/泰语访客
// 看到中文比看到空白有用。
func langParam(c *gin.Context) string {
	if strings.EqualFold(strings.TrimSpace(c.Query("lang")), "en") {
		return "en"
	}
	return "zh"
}

// pickLocalized 按语种挑文案：先看 labels 里有没有，再看对应的单语列。
func pickLocalized(zh, en string, labels LocaleStringMap, lang string) string {
	if len(labels) > 0 {
		if v := strings.TrimSpace(labels[lang]); v != "" {
			return v
		}
	}
	if lang == "en" && strings.TrimSpace(en) != "" {
		return en
	}
	return zh
}

func emptyPublicTree(lang string) gin.H {
	return gin.H{
		"lang":       lang,
		"base_url":   "",
		"categories": []any{},
	}
}

/*
buildPublicTree 把扁平的分类 + 文章拼成前端要的嵌套树。

规则：
  · 只出现「有已发布文章」的分类 —— 空目录在客户站上就是个点不开的项，
    会让访客以为站点坏了
  · 同级按 sort 升序，同 sort 按 id 升序（保证稳定）
  · 文章路径统一拼 /docs/<slug>，和客户站现有路由一致
*/
func buildPublicTree(
	lang, siteID string,
	categories []PartnerDocCategory,
	articles []PartnerDocArticle,
) gin.H {
	byCategory := map[int64][]PartnerDocArticle{}
	for _, a := range articles {
		byCategory[a.CategoryID] = append(byCategory[a.CategoryID], a)
	}

	var buildBranch func(cat PartnerDocCategory) (gin.H, bool)
	buildBranch = func(cat PartnerDocCategory) (gin.H, bool) {
		childNodes := make([]gin.H, 0, 4)

		// 子分类在前（目录结构优先），与后台树的展示顺序一致
		for _, sub := range categories {
			if sub.ParentID == nil || *sub.ParentID != cat.ID {
				continue
			}
			if branch, ok := buildBranch(sub); ok {
				childNodes = append(childNodes, gin.H{"type": "category", "data": branch})
			}
		}
		for _, a := range byCategory[cat.ID] {
			childNodes = append(childNodes, gin.H{
				"type": "article",
				"data": gin.H{
					"slug":    a.Slug,
					"title":   pickLocalized(a.TitleZh, a.TitleEn, a.TitleLabels, lang),
					"summary": pickLocalized(a.SummaryZh, a.SummaryEn, a.SummaryLabels, lang),
					"sort":    a.Sort,
					"path":    "/docs/" + a.Slug,
				},
			})
		}
		if len(childNodes) == 0 {
			return nil, false
		}
		return gin.H{
			"id":      cat.ID,
			"slug":    cat.Slug,
			"kind":    cat.Kind,
			"title":   pickLocalized(cat.TitleZh, cat.TitleEn, cat.TitleLabels, lang),
			"summary": pickLocalized(cat.SummaryZh, cat.SummaryEn, cat.SummaryLabels, lang),
			"sort":    cat.Sort,
			"nodes":   childNodes,
		}, true
	}

	roots := make([]gin.H, 0, 4)
	for _, cat := range categories {
		if cat.ParentID != nil {
			continue
		}
		if branch, ok := buildBranch(cat); ok {
			roots = append(roots, branch)
		}
	}

	// 顶级独立文章（不属于任何分类的文章不可能存在——category_id 是必填，
	// 这里保持空数组只是为了让前端结构完整）
	return gin.H{
		"lang":       lang,
		"site_id":    siteID,
		"base_url":   "",
		"categories": roots,
	}
}
