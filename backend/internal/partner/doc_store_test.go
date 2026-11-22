package partner

import (
	"strings"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"partner/internal/model"
)

/*
文档中心的测试。

重点是**站点隔离**：两个站点用同一个 slug 建分类/文章时互不干扰、
互相读不到、也改不动对方的行。这条保证一旦破了，白标的信任基础就没了 ——
分销商 A 能改分销商 B 的文档，比「文档功能不好用」严重得多。

其余测的是输入校验和树构建这类容易写错、又不容易在手工点页面时发现的逻辑。
*/

// setupDocDB 建一个内存库并把两张文档表迁出来。
//
// 用 sqlite 而不是真 Postgres：这里测的是业务逻辑（隔离、校验、树构建），
// 不涉及任何 Postgres 专有特性。内存库跑得快，也不需要外部依赖。
func setupDocDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	// 顺带建商户表：siteIDForMerchant 会读它
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS lc_distribution_merchants (
		id INTEGER PRIMARY KEY,
		merchant_name TEXT,
		merchant_code TEXT,
		site_id TEXT,
		site_domain TEXT,
		site_credential_hash BLOB
	)`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(PartnerDocTables()...); err != nil {
		t.Fatal(err)
	}
	previous := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = previous })

	// 每个测试前清空，避免共享内存库互相污染
	db.Exec("DELETE FROM lc_partner_doc_categories")
	db.Exec("DELETE FROM lc_partner_doc_articles")
	db.Exec("DELETE FROM lc_distribution_merchants")
	return db
}

func mustCategory(t *testing.T, siteID, slug, title string) *PartnerDocCategory {
	t.Helper()
	row, err := CreateDocCategory(siteID, DocCategoryInput{Slug: slug, TitleZh: title})
	if err != nil {
		t.Fatalf("建分类 %s/%s 失败：%v", siteID, slug, err)
	}
	return row
}

func mustArticle(t *testing.T, siteID string, catID int64, slug, title string, published bool) *PartnerDocArticle {
	t.Helper()
	row, err := CreateDocArticle(siteID, 1, DocArticleInput{
		CategoryID: catID,
		Slug:       slug,
		TitleZh:    title,
		ContentZh:  "正文",
		Published:  &published,
	})
	if err != nil {
		t.Fatalf("建文章 %s/%s 失败：%v", siteID, slug, err)
	}
	return row
}

/*
两个站点可以各建一个同名 slug 的分类。

这正是「不复用主站表」的根本原因：主站的 lc_doc_categories.slug 是全局唯一，
第二个站点想建 getting-started 会直接撞键。这条测试如果挂了，说明
联合唯一索引没生效，那就等着用户报「保存不了」。
*/
func TestDocCategorySlugIsUniquePerSite(t *testing.T) {
	setupDocDB(t)

	a := mustCategory(t, "siteA", "getting-started", "入门")
	b := mustCategory(t, "siteB", "getting-started", "入门")
	if a.ID == b.ID {
		t.Fatal("两个站点应各自建出独立的行")
	}

	// 同一站点内重复 slug 必须被拒
	if _, err := CreateDocCategory("siteA", DocCategoryInput{Slug: "getting-started", TitleZh: "重复"}); err == nil {
		t.Fatal("同站点重复 slug 应被拒绝")
	} else if err != errDocSlugTaken {
		t.Fatalf("应返回 errDocSlugTaken，实际：%v", err)
	}
}

/*
站点隔离：A 读不到 B 的分类，也改不动 B 的行。

改不动这一条尤其重要 —— 如果 UpdateDocCategory 的 where 里只按 id 过滤，
A 只要猜到 B 的分类 id 就能改掉，接口上完全看不出来。所以所有写操作
都必须带 site_id 条件。
*/
func TestDocIsolationBetweenSites(t *testing.T) {
	setupDocDB(t)

	catA := mustCategory(t, "siteA", "cat-a", "A 的分类")
	catB := mustCategory(t, "siteB", "cat-b", "B 的分类")

	catsA, err := ListDocCategories("siteA")
	if err != nil {
		t.Fatal(err)
	}
	if len(catsA) != 1 || catsA[0].ID != catA.ID {
		t.Fatalf("siteA 应只看到自己的 1 个分类，实际 %d 个", len(catsA))
	}

	// 用 siteA 的身份去改 siteB 的分类
	if _, err := UpdateDocCategory("siteA", catB.ID, DocCategoryInput{TitleZh: "被篡改了"}); err != errDocNotFound {
		t.Fatalf("跨站点改分类应返回 errDocNotFound，实际：%v", err)
	}
	// 用 siteA 的身份去删 siteB 的分类
	if _, err := DeleteDocCategory("siteA", catB.ID); err != errDocNotFound {
		t.Fatalf("跨站点删分类应返回 errDocNotFound，实际：%v", err)
	}

	// 确认 B 的分类确实没被动
	var still PartnerDocCategory
	if err := model.DB.Where("id = ?", catB.ID).Take(&still).Error; err != nil {
		t.Fatal(err)
	}
	if still.TitleZh != "B 的分类" {
		t.Fatalf("B 的分类被改动了：%q", still.TitleZh)
	}
}

// 文章不能挂到别的站点的分类上。
func TestDocArticleRejectsForeignCategory(t *testing.T) {
	setupDocDB(t)

	catB := mustCategory(t, "siteB", "cat-b", "B 的分类")
	if _, err := CreateDocArticle("siteA", 1, DocArticleInput{
		CategoryID: catB.ID,
		Slug:       "hijack",
		TitleZh:    "挂到别人分类下",
	}); err != errDocCategoryBad {
		t.Fatalf("应返回 errDocCategoryBad，实际：%v", err)
	}
}

// slug 的字符集限制：只放行小写字母、数字、连字符。
func TestDocSlugValidation(t *testing.T) {
	setupDocDB(t)

	bad := []string{
		"",              // 空
		"Hello",         // 大写（会被转小写，所以这条其实合法，下面单独测）
		"has space",     // 空格
		"中文",            // 非 ASCII
		"under_score",   // 下划线
		"-leading",      // 首连字符
		"trailing-",     // 尾连字符
		"dot.dot",       // 点
	}
	for _, slug := range bad {
		if slug == "Hello" {
			continue // 大写是合法的，会被归一化成小写
		}
		if _, err := CreateDocCategory("siteA", DocCategoryInput{Slug: slug, TitleZh: "t"}); err == nil {
			t.Fatalf("slug %q 应被拒绝", slug)
		}
	}

	// 大写会被归一化成小写，不是错误
	row, err := CreateDocCategory("siteA", DocCategoryInput{Slug: "My-Slug", TitleZh: "t"})
	if err != nil {
		t.Fatalf("大写 slug 应被接受并转小写：%v", err)
	}
	if row.Slug != "my-slug" {
		t.Fatalf("应转成小写，实际 %q", row.Slug)
	}
}

/*
删分类会连带删掉子分类和文章，并且返回删了多少。

树很深的情况也要覆盖：根 → 子 → 孙，删根要全清掉。
*/
func TestDeleteCategoryCascades(t *testing.T) {
	setupDocDB(t)

	root := mustCategory(t, "siteA", "root", "根")
	child, err := CreateDocCategory("siteA", DocCategoryInput{
		Slug: "child", TitleZh: "子", ParentID: &root.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	grand, err := CreateDocCategory("siteA", DocCategoryInput{
		Slug: "grand", TitleZh: "孙", ParentID: &child.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	mustArticle(t, "siteA", root.ID, "a1", "文章1", true)
	mustArticle(t, "siteA", grand.ID, "a2", "文章2", false)
	// 另一个站点的事不该受影响
	other := mustCategory(t, "siteB", "other", "别的站点")
	mustArticle(t, "siteB", other.ID, "b1", "B 的文章", true)

	stats, err := DeleteDocCategory("siteA", root.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stats["deleted_categories"] != 3 {
		t.Fatalf("应删掉 3 个分类（根+子+孙），实际 %d", stats["deleted_categories"])
	}
	if stats["deleted_articles"] != 2 {
		t.Fatalf("应删掉 2 篇文章，实际 %d", stats["deleted_articles"])
	}

	// siteB 的数据必须还在
	var catCount, artCount int64
	model.DB.Model(&PartnerDocCategory{}).Where("site_id = ?", "siteB").Count(&catCount)
	model.DB.Model(&PartnerDocArticle{}).Where("site_id = ?", "siteB").Count(&artCount)
	if catCount != 1 || artCount != 1 {
		t.Fatalf("误删了 siteB 的数据：分类 %d、文章 %d", catCount, artCount)
	}
}

// 不允许把分类挂到自己或自己的后代上 —— 那会造出环，树渲染无限递归。
func TestDocCategoryRejectsParentCycle(t *testing.T) {
	setupDocDB(t)

	root := mustCategory(t, "siteA", "root", "根")
	child, err := CreateDocCategory("siteA", DocCategoryInput{
		Slug: "child", TitleZh: "子", ParentID: &root.ID,
	})
	if err != nil {
		t.Fatal(err)
	}

	// 自己当自己的父级
	if _, err := UpdateDocCategory("siteA", root.ID, DocCategoryInput{ParentID: &root.ID}); err != errDocParentCycle {
		t.Fatalf("自己当父级应被拒，实际：%v", err)
	}
	// 把根挂到自己的子分类下
	if _, err := UpdateDocCategory("siteA", root.ID, DocCategoryInput{ParentID: &child.ID}); err != errDocParentCycle {
		t.Fatalf("挂到后代上应被拒，实际：%v", err)
	}
}

/*
公网树：只出现有已发布文章的分类。

空目录在客户站上是个点不开的项，访客会以为站点坏了。
未发布的文章也不能出现在树里 —— 那等于发布开关失效。
*/
func TestPublicTreeFiltersEmptyAndUnpublished(t *testing.T) {
	setupDocDB(t)

	used := mustCategory(t, "siteA", "used", "有内容的")
	empty := mustCategory(t, "siteA", "empty", "没内容的")
	hidden := mustCategory(t, "siteA", "hidden", "隐藏的")

	mustArticle(t, "siteA", used.ID, "pub", "已发布", true)
	mustArticle(t, "siteA", empty.ID, "draft", "草稿", false)

	// 隐藏分类：即使有已发布文章也不该出现
	mustArticle(t, "siteA", hidden.ID, "in-hidden", "隐藏里的文章", true)
	if _, err := UpdateDocCategory("siteA", hidden.ID, DocCategoryInput{Visible: boolPtr(false)}); err != nil {
		t.Fatal(err)
	}

	cats, err := ListPublicDocCategories("siteA")
	if err != nil {
		t.Fatal(err)
	}
	arts, err := ListPublicDocArticles("siteA")
	if err != nil {
		t.Fatal(err)
	}

	tree := buildPublicTree("zh", "siteA", cats, arts)
	roots, _ := tree["categories"].([]gin.H)
	if len(roots) != 1 {
		t.Fatalf("公网树应只有 1 个根分类（有内容的），实际 %d：%+v", len(roots), roots)
	}
	if roots[0]["slug"] != "used" {
		t.Fatalf("留下的应是 used，实际 %v", roots[0]["slug"])
	}

	nodes, _ := roots[0]["nodes"].([]gin.H)
	if len(nodes) != 1 {
		t.Fatalf("used 下应有 1 篇文章，实际 %d", len(nodes))
	}
	data, _ := nodes[0]["data"].(gin.H)
	if data["slug"] != "pub" {
		t.Fatalf("应只剩已发布的那篇，实际 %v", data["slug"])
	}
	if !strings.HasPrefix(data["path"].(string), "/docs/") {
		t.Fatalf("文章路径格式不对：%v", data["path"])
	}
}

// 公网文章：未发布的取不到（否则发布开关形同虚设）。
func TestPublicArticleHidesUnpublished(t *testing.T) {
	setupDocDB(t)

	cat := mustCategory(t, "siteA", "cat", "分类")
	mustArticle(t, "siteA", cat.ID, "draft", "草稿", false)

	if _, err := GetPublicDocArticle("siteA", "draft"); err != errDocNotFound {
		t.Fatalf("未发布文章应取不到，实际：%v", err)
	}
}

// 正文为空是合法的编辑结果（作者清空重写），不能被「非空才更新」挡住。
func TestUpdateArticleAllowsEmptyContent(t *testing.T) {
	setupDocDB(t)

	cat := mustCategory(t, "siteA", "cat", "分类")
	art := mustArticle(t, "siteA", cat.ID, "a", "标题", true)

	updated, err := UpdateDocArticle("siteA", art.ID, 1, DocArticleInput{
		Slug:      "a",
		TitleZh:   "标题",
		ContentZh: "",
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.ContentZh != "" {
		t.Fatalf("正文应被清空，实际 %q", updated.ContentZh)
	}
}

// 没有绑定站点的商户不能管理文档 —— 文档是挂给域名看的，没有域名就没有展示位置。
func TestDocRequiresSiteBinding(t *testing.T) {
	db := setupDocDB(t)

	db.Exec(`INSERT INTO lc_distribution_merchants (id, merchant_name, merchant_code, site_id) VALUES (7, '未绑定', 'M7', NULL)`)
	if _, err := siteIDForMerchant(7); err != errDocNoSiteBinding {
		t.Fatalf("未绑定站点应返回 errDocNoSiteBinding，实际：%v", err)
	}

	db.Exec(`INSERT INTO lc_distribution_merchants (id, merchant_name, merchant_code, site_id) VALUES (8, '已绑定', 'M8', 'site-8')`)
	got, err := siteIDForMerchant(8)
	if err != nil {
		t.Fatal(err)
	}
	if got != "site-8" {
		t.Fatalf("应拿到 site-8，实际 %q", got)
	}
}

func boolPtr(b bool) *bool { return &b }
