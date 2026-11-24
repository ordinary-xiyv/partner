package partner

import (
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"partner/internal/model"
)

/*
默认文档种子导入的测试。

这个功能最怕两种错，两种都靠手工点页面看不出来：

  1. 不幂等 —— 每点一次「导入默认文档」就多一整套分类和文章。
     后台树会变成两个「入门」、两篇「认证」，而且数量越多越乱。
  2. 覆盖掉用户内容 —— 种子里没有的文章被删掉，等于「恢复默认」
     变成「清空我的文档」。这个是数据丢失，最严重。
*/

// countDocs 统计某站点的分类与文章条数。
func countDocs(t *testing.T, siteID string) (int, int) {
	t.Helper()
	var cats, arts int64
	if err := model.DB.Model(&PartnerDocCategory{}).
		Where("site_id = ?", siteID).Count(&cats).Error; err != nil {
		t.Fatal(err)
	}
	if err := model.DB.Model(&PartnerDocArticle{}).
		Where("site_id = ?", siteID).Count(&arts).Error; err != nil {
		t.Fatal(err)
	}
	return int(cats), int(arts)
}

// 空站点首次导入：分类和文章都真的写进去了。
func TestImportDocSeedIntoEmptySite(t *testing.T) {
	setupDocDB(t)

	summary, err := ImportDocSeed("seed-site-a", DocSeedModeSkip)
	if err != nil {
		t.Fatalf("导入失败：%v", err)
	}
	if summary.CategoriesCreated == 0 {
		t.Fatal("分类一条都没建")
	}
	if summary.ArticlesCreated == 0 {
		t.Fatal("文章一条都没建")
	}

	cats, arts := countDocs(t, "seed-site-a")
	if cats != summary.CategoriesCreated {
		t.Fatalf("库里分类 %d 条，导入结果说建了 %d 条", cats, summary.CategoriesCreated)
	}
	if arts != summary.ArticlesCreated {
		t.Fatalf("库里文章 %d 条，导入结果说建了 %d 条", arts, summary.ArticlesCreated)
	}

	// 文章必须都是已发布：公网接口只取 published 的，没发布等于导入了个寂寞
	var unpublished int64
	if err := model.DB.Model(&PartnerDocArticle{}).
		Where("site_id = ? AND published = ?", "seed-site-a", false).
		Count(&unpublished).Error; err != nil {
		t.Fatal(err)
	}
	if unpublished != 0 {
		t.Fatalf("有 %d 篇文章未发布，客户站会看不到", unpublished)
	}
}

// 反复导入不能产生重复数据 —— 用户会连点按钮。
func TestImportDocSeedIsIdempotent(t *testing.T) {
	setupDocDB(t)

	if _, err := ImportDocSeed("seed-site-a", DocSeedModeSkip); err != nil {
		t.Fatalf("首次导入失败：%v", err)
	}
	cats1, arts1 := countDocs(t, "seed-site-a")

	summary, err := ImportDocSeed("seed-site-a", DocSeedModeSkip)
	if err != nil {
		t.Fatalf("第二次导入失败：%v", err)
	}
	cats2, arts2 := countDocs(t, "seed-site-a")

	if cats1 != cats2 || arts1 != arts2 {
		t.Fatalf("第二次导入产生了重复数据：分类 %d→%d、文章 %d→%d",
			cats1, cats2, arts1, arts2)
	}
	if summary.CategoriesCreated != 0 || summary.ArticlesCreated != 0 {
		t.Fatalf("skip 模式不该新建任何东西，实际建了分类 %d、文章 %d",
			summary.CategoriesCreated, summary.ArticlesCreated)
	}
	if summary.ArticlesSkipped != arts1 {
		t.Fatalf("skip 模式应跳过全部 %d 篇文章，实际跳过 %d",
			arts1, summary.ArticlesSkipped)
	}
}

// skip 模式绝不能覆盖用户改过的内容。
func TestImportDocSeedSkipPreservesUserEdits(t *testing.T) {
	setupDocDB(t)

	if _, err := ImportDocSeed("seed-site-a", DocSeedModeSkip); err != nil {
		t.Fatalf("导入失败：%v", err)
	}

	// 用户把「认证」这篇改了
	var row PartnerDocArticle
	if err := model.DB.Where("site_id = ? AND slug = ?", "seed-site-a", "auth").
		Take(&row).Error; err != nil {
		t.Fatalf("找不到 auth 这篇：%v", err)
	}
	const edited = "我自己改过的正文"
	if err := model.DB.Model(&PartnerDocArticle{}).
		Where("id = ?", row.ID).
		Update("content_zh", edited).Error; err != nil {
		t.Fatal(err)
	}

	// 再点一次导入（skip）
	if _, err := ImportDocSeed("seed-site-a", DocSeedModeSkip); err != nil {
		t.Fatalf("二次导入失败：%v", err)
	}

	var after PartnerDocArticle
	if err := model.DB.Where("id = ?", row.ID).Take(&after).Error; err != nil {
		t.Fatal(err)
	}
	if after.ContentZh != edited {
		t.Fatalf("skip 模式把用户正文覆盖了：%q", after.ContentZh)
	}
}

// overwrite 模式恢复模板内容，但不删用户自建的东西。
func TestImportDocSeedOverwriteKeepsUserOwnedDocs(t *testing.T) {
	setupDocDB(t)

	if _, err := ImportDocSeed("seed-site-a", DocSeedModeSkip); err != nil {
		t.Fatalf("导入失败：%v", err)
	}

	// 用户自建一个种子里没有的分类 + 文章
	own := mustCategory(t, "seed-site-a", "my-own-cat", "我自己的分类")
	mustArticle(t, "seed-site-a", own.ID, "my-own-article", "我自己的文章", true)

	// 用户改了「认证」的正文
	var auth PartnerDocArticle
	if err := model.DB.Where("site_id = ? AND slug = ?", "seed-site-a", "auth").
		Take(&auth).Error; err != nil {
		t.Fatal(err)
	}
	if err := model.DB.Model(&PartnerDocArticle{}).Where("id = ?", auth.ID).
		Update("content_zh", "临时内容").Error; err != nil {
		t.Fatal(err)
	}

	if _, err := ImportDocSeed("seed-site-a", DocSeedModeOverwrite); err != nil {
		t.Fatalf("覆盖导入失败：%v", err)
	}

	// 「认证」应被恢复成模板内容
	var restored PartnerDocArticle
	if err := model.DB.Where("id = ?", auth.ID).Take(&restored).Error; err != nil {
		t.Fatal(err)
	}
	if restored.ContentZh == "临时内容" || restored.ContentZh == "" {
		t.Fatalf("overwrite 模式没有恢复模板正文，实际是 %q", restored.ContentZh)
	}

	// 用户自建的两条必须还在
	var ownCatCount, ownArtCount int64
	if err := model.DB.Model(&PartnerDocCategory{}).
		Where("site_id = ? AND slug = ?", "seed-site-a", "my-own-cat").
		Count(&ownCatCount).Error; err != nil {
		t.Fatal(err)
	}
	if err := model.DB.Model(&PartnerDocArticle{}).
		Where("site_id = ? AND slug = ?", "seed-site-a", "my-own-article").
		Count(&ownArtCount).Error; err != nil {
		t.Fatal(err)
	}
	if ownCatCount != 1 || ownArtCount != 1 {
		t.Fatalf("overwrite 模式删掉了用户自建内容：分类 %d、文章 %d（都应为 1）",
			ownCatCount, ownArtCount)
	}
}

// 两个站点各导一份，互不干扰（站点隔离）。
func TestImportDocSeedIsolatedPerSite(t *testing.T) {
	setupDocDB(t)

	if _, err := ImportDocSeed("seed-site-a", DocSeedModeSkip); err != nil {
		t.Fatalf("A 站导入失败：%v", err)
	}
	if _, err := ImportDocSeed("seed-site-b", DocSeedModeSkip); err != nil {
		t.Fatalf("B 站导入失败：%v", err)
	}

	catsA, artsA := countDocs(t, "seed-site-a")
	catsB, artsB := countDocs(t, "seed-site-b")
	if catsA != catsB || artsA != artsB {
		t.Fatalf("两个站点导入结果不一致：A %d/%d、B %d/%d",
			catsA, artsA, catsB, artsB)
	}

	// 改 A 的文档不能影响 B
	var rowA PartnerDocArticle
	if err := model.DB.Where("site_id = ? AND slug = ?", "seed-site-a", "auth").
		Take(&rowA).Error; err != nil {
		t.Fatal(err)
	}
	const mark = "A站改过"
	if err := model.DB.Model(&PartnerDocArticle{}).Where("id = ?", rowA.ID).
		Update("content_zh", mark).Error; err != nil {
		t.Fatal(err)
	}

	var rowB PartnerDocArticle
	if err := model.DB.Where("site_id = ? AND slug = ?", "seed-site-b", "auth").
		Take(&rowB).Error; err != nil {
		t.Fatal(err)
	}
	if rowB.ContentZh == mark {
		t.Fatal("改 A 站的文章污染了 B 站，站点隔离失效")
	}
}

// 嵌套分类要建对父子关系，否则公网树里整棵子树都不显示。
func TestImportDocSeedNestedCategoryParents(t *testing.T) {
	setupDocDB(t)

	if _, err := ImportDocSeed("seed-site-a", DocSeedModeSkip); err != nil {
		t.Fatalf("导入失败：%v", err)
	}

	var all []PartnerDocCategory
	if err := model.DB.Where("site_id = ?", "seed-site-a").Find(&all).Error; err != nil {
		t.Fatal(err)
	}
	bySlug := map[string]PartnerDocCategory{}
	for _, c := range all {
		bySlug[c.Slug] = c
	}

	apiRef, ok := bySlug["api-reference"]
	if !ok {
		t.Fatal("缺少 api-reference 根分类")
	}
	if apiRef.ParentID != nil {
		t.Fatalf("api-reference 应该是根分类，实际父级是 %v", *apiRef.ParentID)
	}

	chat, ok := bySlug["chat"]
	if !ok {
		t.Fatal("缺少 chat 分类")
	}
	if chat.ParentID == nil || *chat.ParentID != apiRef.ID {
		t.Fatal("chat 的父分类应是 api-reference")
	}

	// 三层：chat-openai-chat-completions → chat → api-reference
	completion, ok := bySlug["chat-openai-chat-completions"]
	if !ok {
		t.Fatal("缺少 chat-openai-chat-completions 分类")
	}
	if completion.ParentID == nil || *completion.ParentID != chat.ID {
		t.Fatal("chat-openai-chat-completions 应挂在 chat 下")
	}

	// 公网树必须能建出东西来，否则客户站会显示「文档不存在」
	cats, err := ListPublicDocCategories("seed-site-a")
	if err != nil {
		t.Fatal(err)
	}
	arts, err := ListPublicDocArticles("seed-site-a")
	if err != nil {
		t.Fatal(err)
	}
	tree := buildPublicTree("zh", "seed-site-a", cats, arts)
	list, _ := tree["categories"].([]gin.H)
	if len(list) == 0 {
		t.Fatal("公网树是空的：客户站会显示「文档不存在」")
	}
	if len(list) != 3 {
		t.Fatalf("公网树应有 3 个根分类（入门/模型指南/API 参考），实际 %d", len(list))
	}
}

// 种子文件本身必须能用（解析成功、结构自洽、无主站域名残留）。
func TestDocSeedLoads(t *testing.T) {
	seed, err := loadDocSeed()
	if err != nil {
		t.Fatalf("种子解析失败：%v", err)
	}
	if len(seed.Categories) < 10 {
		t.Fatalf("分类只有 %d 条，明显少了", len(seed.Categories))
	}
	if len(seed.Articles) < 40 {
		t.Fatalf("文章只有 %d 条，明显少了", len(seed.Articles))
	}

	known := map[string]bool{}
	for _, c := range seed.Categories {
		known[c.Slug] = true
	}
	for _, a := range seed.Articles {
		if a.ContentZh == "" {
			t.Fatalf("文章 %s 没有正文", a.Slug)
		}
		if !known[a.CategorySlug] {
			t.Fatalf("文章 %s 的分类 %s 不存在", a.Slug, a.CategorySlug)
		}
		/*
		 * 正文里不能残留主站域名 —— 否则分销商的文档会告诉客户
		 * 「去 tokens.lynxtoncloud.com 调用」，等于把流量导给主站。
		 * 生成脚本会替换成 {{baseUrl}}，这条测试守住那个替换没被绕过。
		 */
		if strings.Contains(a.ContentZh, "tokens.lynxtoncloud.com") {
			t.Fatalf("文章 %s 的正文里还有主站域名", a.Slug)
		}
	}
}

// 未知模式按 skip 处理，不能意外变成写入。
func TestImportDocSeedUnknownModeFallbacksToSkip(t *testing.T) {
	setupDocDB(t)

	if _, err := ImportDocSeed("seed-site-a", DocSeedModeSkip); err != nil {
		t.Fatal(err)
	}
	catsBefore, artsBefore := countDocs(t, "seed-site-a")

	summary, err := ImportDocSeed("seed-site-a", "乱写的模式")
	if err != nil {
		t.Fatalf("未知模式不该报错：%v", err)
	}
	if summary.CategoriesCreated != 0 || summary.ArticlesCreated != 0 {
		t.Fatal("未知模式被当成新建了")
	}
	catsAfter, artsAfter := countDocs(t, "seed-site-a")
	if catsBefore != catsAfter || artsBefore != artsAfter {
		t.Fatal("未知模式改变了数据条数")
	}
}
