package partner

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"gorm.io/gorm"

	"partner/internal/model"
)

/*
默认文档种子。

为什么种子要放在后端，而不是让前端把模板直接渲染出来：

  · 客户站原来在「伙伴接口返回空树 + 主站接口失败」时会回落到浏览器本地
    的 mock 种子。那是一份**假的兜底** —— 目录是编的，正文也取不到，
    页面上就会出现「左边有目录、右边写着文档不存在」的矛盾状态。
    数据必须是真数据，而不该是前端临时编的。
  · 伙伴后台之前完全没有初始内容，新商户打开文档页是一片空白，
    只能从零手写分类和文章。种子进库后，一键导入就有可编辑的真实文档。

内容来源是 web-user 里那套已经写好的模板，由 backend/scripts/gen_doc_seed.py
编译成 docs_seed.json 再 embed 进来。改模板后重跑那个脚本即可，不要手改 JSON。

★ 为什么用 go:embed 而不是运行时读文件：
后端是编译后单二进制部署的，运行目录里不一定有 seed 目录。embed 进二进制
才能保证「只要二进制在，导入功能就能用」，也不怕部署时漏拷文件。
*/
//go:embed seed/docs_seed.json
var docSeedFS embed.FS

// DocSeedCategory 种子里的分类定义。
//
// ParentSlug 为空表示根分类。用 slug 而不是 id 表达父子关系，是因为
// 种子是静态文件，id 要等写库后才知道 —— 用 slug 引用才能任意顺序排列。
type DocSeedCategory struct {
	Slug       string `json:"slug"`
	ParentSlug string `json:"parent_slug"`
	TitleZh    string `json:"title_zh"`
	TitleEn    string `json:"title_en"`
	Sort       int    `json:"sort"`
}

// DocSeedArticle 种子里的文章定义。
type DocSeedArticle struct {
	Slug         string `json:"slug"`
	CategorySlug string `json:"category_slug"`
	TitleZh      string `json:"title_zh"`
	TitleEn      string `json:"title_en"`
	Sort         int    `json:"sort"`
	ContentZh    string `json:"content_zh"`
}

// DocSeed 种子文件的整体结构。
type DocSeed struct {
	Version    int               `json:"version"`
	Categories []DocSeedCategory `json:"categories"`
	Articles   []DocSeedArticle  `json:"articles"`
}

// DocSeedImportMode 导入策略。
const (
	// DocSeedModeSkip 只补缺失的，已存在的分类/文章一律不动。
	// 这是默认值：用户已经改过的文档不能被一次误点覆盖掉。
	DocSeedModeSkip = "skip"
	// DocSeedModeOverwrite 用种子的标题和正文覆盖同 slug 的已有记录。
	// 仍然不会删除用户自己新建的内容。
	DocSeedModeOverwrite = "overwrite"
)

// ErrDocSeedInvalid 种子文件损坏或内容自相矛盾。
var ErrDocSeedInvalid = errors.New("默认文档模板损坏")

// loadDocSeed 解析内嵌的种子文件。
//
// 每次调用都重新解析而不做全局缓存：导入是低频操作（一个站点一辈子点不了
// 几次），而全局缓存会让「热更新种子」变得需要重启进程。这点开销不值得省。
func loadDocSeed() (*DocSeed, error) {
	raw, err := docSeedFS.ReadFile("seed/docs_seed.json")
	if err != nil {
		return nil, fmt.Errorf("%w: 读取内嵌文件失败: %v", ErrDocSeedInvalid, err)
	}
	var seed DocSeed
	if err := json.Unmarshal(raw, &seed); err != nil {
		return nil, fmt.Errorf("%w: 解析失败: %v", ErrDocSeedInvalid, err)
	}
	if len(seed.Categories) == 0 || len(seed.Articles) == 0 {
		return nil, fmt.Errorf("%w: 分类或文章为空", ErrDocSeedInvalid)
	}
	return &seed, nil
}

// DocSeedSummary 导入结果，字段名刻意直白，前端直接展示即可。
type DocSeedSummary struct {
	CategoriesCreated int `json:"categories_created"`
	CategoriesUpdated int `json:"categories_updated"`
	CategoriesSkipped int `json:"categories_skipped"`
	ArticlesCreated   int `json:"articles_created"`
	ArticlesUpdated   int `json:"articles_updated"`
	ArticlesSkipped   int `json:"articles_skipped"`
}

/*
ImportDocSeed 把默认文档写进某个站点。

幂等性是这个函数的核心要求 —— 用户可能反复点「导入默认文档」。
按 slug 判断存在与否：

	· skip 模式：存在就跳过，只补缺
	· overwrite 模式：存在则更新标题/正文/排序，不新建重复行

★ 只增改、不删除。种子里没有的记录（用户自己写的内容）一律保留，

	这一点必须写死，否则「恢复默认文档」会变成「清空我的文档」。

分类要按依赖顺序建：api-reference 的子分类挂在 api-reference 下，
而 chat-openai-chat-completions 又挂在 chat 下，存在两层嵌套。
所以用「反复扫描直到没有新进展」的办法，而不是假设扁平顺序 ——
种子文件里分类的排列顺序一旦调整，扁平的实现就会静默漏掉整棵子树。
*/
func ImportDocSeed(siteID string, mode string) (*DocSeedSummary, error) {
	seed, err := loadDocSeed()
	if err != nil {
		return nil, err
	}
	if mode != DocSeedModeOverwrite {
		mode = DocSeedModeSkip
	}

	summary := &DocSeedSummary{}
	now := nowUnix()

	// slug → 分类 id，建完一个记一个，供子分类和文章查父级
	catIDBySlug := map[string]int64{}

	err = model.DB.Transaction(func(tx *gorm.DB) error {
		var existingCats []PartnerDocCategory
		if err := tx.Where("site_id = ?", siteID).Find(&existingCats).Error; err != nil {
			return err
		}
		catBySlug := make(map[string]*PartnerDocCategory, len(existingCats))
		for i := range existingCats {
			catBySlug[existingCats[i].Slug] = &existingCats[i]
			catIDBySlug[existingCats[i].Slug] = existingCats[i].ID
		}

		/*
		 * 多轮建分类。pending 每轮只处理「父分类已就绪」的那些，
		 * 剩下的留给下一轮。轮数以分类数封顶，防止父级 slug 写错时死循环。
		 */
		pending := make([]DocSeedCategory, len(seed.Categories))
		copy(pending, seed.Categories)
		for round := 0; len(pending) > 0 && round <= len(seed.Categories); round++ {
			var next []DocSeedCategory
			progressed := false

			for _, c := range pending {
				var parentID *int64
				if strings.TrimSpace(c.ParentSlug) != "" {
					pid, ok := catIDBySlug[c.ParentSlug]
					if !ok {
						// 父分类还没建出来，下一轮再说
						next = append(next, c)
						continue
					}
					parentID = &pid
				}

				if exist, ok := catBySlug[c.Slug]; ok {
					if mode == DocSeedModeOverwrite {
						// 只覆盖模板负责的字段；visible 归用户管，不碰
						if err := tx.Model(&PartnerDocCategory{}).
							Where("site_id = ? AND id = ?", siteID, exist.ID).
							Updates(map[string]any{
								"title_zh":   c.TitleZh,
								"title_en":   c.TitleEn,
								"sort":       c.Sort,
								"parent_id":  parentID,
								"updated_at": now,
							}).Error; err != nil {
							return err
						}
						summary.CategoriesUpdated++
					} else {
						summary.CategoriesSkipped++
					}
					catIDBySlug[c.Slug] = exist.ID
					progressed = true
					continue
				}

				row := &PartnerDocCategory{
					SiteID:    siteID,
					ParentID:  parentID,
					Slug:      c.Slug,
					Kind:      PartnerDocKindArticles,
					TitleZh:   c.TitleZh,
					TitleEn:   c.TitleEn,
					Sort:      c.Sort,
					Visible:   true,
					CreatedAt: now,
					UpdatedAt: now,
				}
				if err := tx.Create(row).Error; err != nil {
					return err
				}
				catIDBySlug[c.Slug] = row.ID
				catBySlug[c.Slug] = row
				summary.CategoriesCreated++
				progressed = true
			}

			if !progressed {
				// 剩下的全都是「父 slug 不存在」的坏数据。
				// 不静默丢弃：这属于种子文件写错了，必须让人看见。
				missing := make([]string, 0, len(next))
				for _, c := range next {
					missing = append(missing, c.Slug+"→"+c.ParentSlug)
				}
				return fmt.Errorf("%w: 父分类不存在 %s",
					ErrDocSeedInvalid, strings.Join(missing, ", "))
			}
			pending = next
		}

		// ---- 文章 ----
		var existingArts []PartnerDocArticle
		if err := tx.Select("id, slug").Where("site_id = ?", siteID).
			Find(&existingArts).Error; err != nil {
			return err
		}
		artBySlug := make(map[string]int64, len(existingArts))
		for _, a := range existingArts {
			artBySlug[a.Slug] = a.ID
		}

		for _, a := range seed.Articles {
			catID, ok := catIDBySlug[a.CategorySlug]
			if !ok {
				return fmt.Errorf("%w: 文章 %s 的分类 %s 不存在",
					ErrDocSeedInvalid, a.Slug, a.CategorySlug)
			}

			if id, exists := artBySlug[a.Slug]; exists {
				if mode == DocSeedModeOverwrite {
					if err := tx.Model(&PartnerDocArticle{}).
						Where("site_id = ? AND id = ?", siteID, id).
						Updates(map[string]any{
							"category_id": catID,
							"title_zh":    a.TitleZh,
							"title_en":    a.TitleEn,
							"content_zh":  a.ContentZh,
							"sort":        a.Sort,
							"published":   true,
							"updated_at":  now,
						}).Error; err != nil {
						return err
					}
					summary.ArticlesUpdated++
				} else {
					summary.ArticlesSkipped++
				}
				continue
			}

			row := &PartnerDocArticle{
				SiteID:     siteID,
				CategoryID: catID,
				Slug:       a.Slug,
				TitleZh:    a.TitleZh,
				TitleEn:    a.TitleEn,
				ContentZh:  a.ContentZh,
				Sort:       a.Sort,
				/*
				 * 种子里直接发布。默认文档的意义就是「打开就能看」——
				 * 导入一堆草稿，客户站上仍然什么都没有，等于没导入。
				 */
				Published: true,
				CreatedAt: now,
				UpdatedAt: now,
			}
			if err := tx.Create(row).Error; err != nil {
				return err
			}
			summary.ArticlesCreated++
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return summary, nil
}
