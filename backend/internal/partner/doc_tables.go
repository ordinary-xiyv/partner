package partner

import (
	"log"

	"gorm.io/gorm"

	"partner/internal/model"
)

/*
文档表的建表逻辑。

伙伴后端没有迁移框架（整个服务只持有一个 *gorm.DB，从不建表），
所以这里做两件事：

  1. 暴露一份可手工执行的 DDL（见 doc_tables.sql），给部署时用
  2. 启动时用 AutoMigrate 幂等地把表补上，让开发环境和「忘了跑脚本」
     的部署也能正常工作

为什么两个都要：
  · 只靠 AutoMigrate —— 生产环境通常不允许应用账号有 DDL 权限，
    到时候启动就报错，而且报错信息埋在 gorm 的日志里很难看出来
  · 只靠 SQL 脚本 —— 开发同学本地起服务时表不存在，接口全 500，
    还得先翻文档找脚本

AutoMigrate 只加列不改列：它不会删掉已有的列，也不会改动索引定义。
所以后续如果要改索引，仍需要写显式 DDL —— 这点必须写在这里，
否则下一个人会以为改结构体就够了。
*/

// PartnerDocTables 按依赖顺序返回需要建的表。
//
// 分类在文章之前：文章有 category_id，虽然没建外键约束，但
// 建表顺序保持「被引用者在前」更符合阅读直觉。
func PartnerDocTables() []any {
	return []any{
		&PartnerDocCategory{},
		&PartnerDocArticle{},
	}
}

/*
EnsurePartnerDocTables 幂等地建好文档表。

返回值只用于日志/测试断言，不阻断启动：
建表失败通常是「账号没有 DDL 权限」，这种环境下表一般已经由运维脚本建好了，
应用应当继续启动并正常读写，而不是因为这个函数失败就整个服务起不来。

但失败必须 log 出来 —— 否则「表不存在」会以各种 500 的形式散落在业务接口里，
排查时要从业务错误倒推回建表，非常费时间。
*/
func EnsurePartnerDocTables() error {
	if model.DB == nil {
		return nil
	}
	if err := model.DB.AutoMigrate(PartnerDocTables()...); err != nil {
		log.Printf("[partner-docs] 自动建表失败（表可能已由运维脚本建好）：%v", err)
		return err
	}
	log.Printf("[partner-docs] 文档表就绪：lc_partner_doc_categories / lc_partner_doc_articles")
	return nil
}

/*
DocTablesReady 探测文档表是否可用。

给接口层用：表没建好时，返回一句「文档功能未初始化」比抛 MySQL/PG 的
"relation does not exist" 更有指导性 —— 前者能让人知道该做什么，后者只是噪音。
*/
func DocTablesReady(db *gorm.DB) bool {
	if db == nil {
		return false
	}
	// 用一次开销极小的 count 探测。Migrator().HasTable 在部分驱动上
	// 会额外查 information_schema，反而更慢；这里只需要「能不能查」这个事实。
	var n int64
	err := db.Table(PartnerDocCategory{}.TableName()).Limit(1).Count(&n).Error
	return err == nil
}
