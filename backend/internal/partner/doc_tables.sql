-- 分销商站点文档表（按站点隔离）
--
-- 这份脚本是给运维/部署用的：生产环境的应用账号通常没有 DDL 权限，
-- 需要由 DBA 或部署脚本预先建表。应用启动时也会尝试 AutoMigrate 兜底，
-- 两者幂等，执行顺序无所谓。
--
-- 与主站 lc_doc_categories / lc_doc_articles 的关系：**没有关系**。
-- 那是平台自己的文档，这是每个分销商站点各自的文档。两套表结构相似
-- 但互不影响，唯一性约束从「全局 slug」改成了「站点内 slug」——
-- 这正是不能复用主站表的根本原因（老库 slug 上有全局唯一索引，
-- 第二个站点想建 getting-started 就会撞键）。
--
-- 执行：psql "$SQL_DSN" -f doc_tables.sql

BEGIN;

-- 分类
CREATE TABLE IF NOT EXISTS lc_partner_doc_categories (
    id             BIGSERIAL     PRIMARY KEY,
    site_id        VARCHAR(64)   NOT NULL,
    parent_id      BIGINT,
    slug           VARCHAR(64)   NOT NULL,
    kind           VARCHAR(16)   NOT NULL DEFAULT 'articles',
    title_zh       VARCHAR(255),
    title_en       VARCHAR(255),
    title_labels   TEXT,
    summary_zh     TEXT,
    summary_en     TEXT,
    summary_labels TEXT,
    sort           BIGINT        DEFAULT 0,
    visible        BOOLEAN       DEFAULT TRUE,
    created_at     BIGINT,
    updated_at     BIGINT
);

-- slug 只在站点内唯一：同一个 slug 在不同站点可以共存
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_doc_cat_site_slug
    ON lc_partner_doc_categories (site_id, slug);

CREATE INDEX IF NOT EXISTS idx_partner_doc_cat_site_parent
    ON lc_partner_doc_categories (site_id, parent_id);

-- 文章
CREATE TABLE IF NOT EXISTS lc_partner_doc_articles (
    id             BIGSERIAL     PRIMARY KEY,
    site_id        VARCHAR(64)   NOT NULL,
    category_id    BIGINT        NOT NULL,
    slug           VARCHAR(64)   NOT NULL,
    title_zh       VARCHAR(255),
    title_en       VARCHAR(255),
    title_labels   TEXT,
    summary_zh     TEXT,
    summary_en     TEXT,
    summary_labels TEXT,
    content_zh     TEXT,
    content_en     TEXT,
    content_labels TEXT,
    sort           BIGINT        DEFAULT 0,
    published      BOOLEAN       DEFAULT FALSE,
    updated_by     BIGINT        DEFAULT 0,
    created_at     BIGINT,
    updated_at     BIGINT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_doc_art_site_slug
    ON lc_partner_doc_articles (site_id, slug);

-- 按分类列文章是最高频的查询（后台树 + 前台目录）
CREATE INDEX IF NOT EXISTS idx_partner_doc_art_site_category
    ON lc_partner_doc_articles (site_id, category_id);

COMMIT;

-- MySQL 部署注意：
--   * BIGSERIAL → BIGINT AUTO_INCREMENT
--   * BOOLEAN   → TINYINT(1)
--   * CREATE INDEX IF NOT EXISTS 在 MySQL 里不支持 IF NOT EXISTS，
--     需要改成先查 information_schema.statistics 再建。
-- 主流程（PostgreSQL）用上面的脚本；MySQL 部署让应用启动时的 AutoMigrate 建表。
