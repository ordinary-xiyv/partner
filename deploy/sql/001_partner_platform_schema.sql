-- =============================================================================
-- 伙伴平台上线 SQL 汇总（PostgreSQL）
--
-- 适用：把本仓库的 backend（伙伴后端）+ web（伙伴后台）+ web-user（客户站）
--       一起发布到线上时，需要在**同一个数据库**里执行的全部 DDL。
--
-- 执行顺序：按本文件从上到下即可。每段都写了幂等处理（IF NOT EXISTS /
--           先查 pg_constraint 再 ADD），重复执行不会报错，但语义上
--           第 1、2 段属于历史迁移，新库才需要；老库执行也安全。
--
-- 前提：目标库是 lynxtonapi 在用的那个库。伙伴后端不是独立库 ——
--       它和主站共用 users / logs / options / lc_distribution_merchants。
-- =============================================================================


-- =============================================================================
-- 第 0 段：前置检查（只读，不修改任何东西）
--
-- 先跑这段，确认目标库的状态，再决定后续哪些段需要执行。
-- =============================================================================

-- 0.1 商户表是否已存在（存在 = 说明第 1 段跑过了）
SELECT to_regclass('public.lc_distribution_merchants') AS merchant_table;

-- 0.2 商户表已有的列（对照第 3、4 段看缺哪些 brand_* 列）
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'lc_distribution_merchants'
ORDER BY ordinal_position;

-- 0.3 文档表是否已存在（存在 = 第 5 段跑过了）
SELECT to_regclass('public.lc_partner_doc_categories') AS doc_categories,
       to_regclass('public.lc_partner_doc_articles')   AS doc_articles;

-- 0.4 对象存储配置是否已就绪（品牌图片上传依赖它）
--     缺这些键时，/api/partner/brand/upload 会返回「对象存储未配置」
SELECT key, left(value, 40) AS value_preview
FROM options
WHERE key LIKE 'object_storage_setting.%'
ORDER BY key;


-- =============================================================================
-- 第 1 段：商户表（来自 lynxtonapi/migrations/versions/
--                   202611180001_distribution_merchants.up.sql）
--
-- 这张表是「伙伴」和「经销商」在数据模型上的同一个东西 —— 都指向它的一条记录。
-- 伙伴后台登录用 merchant_code + partner_password_hash，不是 users 表账号。
--
-- 新库必须执行；老库若表已存在，用下面的 IF NOT EXISTS 版本，不会报错。
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lc_distribution_merchants (
    id                          bigserial    PRIMARY KEY,
    merchant_name               varchar(128) NOT NULL,
    merchant_code               varchar(64)  NOT NULL UNIQUE,
    site_id                     varchar(64)  UNIQUE,
    site_domain                 varchar(253) UNIQUE,
    site_credential_hash        bytea        UNIQUE,
    site_credential_rotated_at  timestamptz,
    site_last_seen_at           timestamptz,
    created_at                  timestamptz  NOT NULL DEFAULT now(),
    updated_at                  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT lc_distribution_merchants_name_not_empty
        CHECK (btrim(merchant_name) <> ''),
    CONSTRAINT lc_distribution_merchants_code_not_empty
        CHECK (btrim(merchant_code) <> ''),
    CONSTRAINT lc_distribution_merchants_site_id_not_empty
        CHECK (site_id IS NULL OR btrim(site_id) <> ''),
    CONSTRAINT lc_distribution_merchants_site_domain_not_empty
        CHECK (site_domain IS NULL OR btrim(site_domain) <> ''),
    -- 站点三件套要么全空、要么全填。半填状态会让 siteauth 永远比对失败。
    CONSTRAINT lc_distribution_merchants_site_binding_complete CHECK (
        (site_id IS NULL AND site_domain IS NULL AND site_credential_hash IS NULL)
        OR
        (site_id IS NOT NULL AND site_domain IS NOT NULL AND site_credential_hash IS NOT NULL)
    ),
    CONSTRAINT lc_distribution_merchants_credential_hash_length
        CHECK (site_credential_hash IS NULL OR octet_length(site_credential_hash) = 32)
);

COMMENT ON TABLE  public.lc_distribution_merchants IS '白牌站点分销商户；独立于原邀请码代理体系';
COMMENT ON COLUMN public.lc_distribution_merchants.site_credential_hash IS '部署凭证 SHA-256 哈希；不得存明文';

-- 自运营平台这一条是**必需的**：users.merchant_id 的历史数据全挂在它下面，
-- 客户站的 site-local 也是它。merchant_code 必须正好是 'self-operated'。
INSERT INTO public.lc_distribution_merchants (merchant_name, merchant_code)
VALUES ('自运营平台', 'self-operated')
ON CONFLICT (merchant_code) DO NOTHING;

-- users 表加 merchant_id：主站原有用户全部归到自运营平台
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS merchant_id bigint;

UPDATE public.users
SET merchant_id = (
    SELECT id FROM public.lc_distribution_merchants WHERE merchant_code = 'self-operated'
)
WHERE merchant_id IS NULL;

-- 外键用 NOT VALID：不扫描历史行，避免大表上执行时长时间锁表
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_merchant_id_fkey'
    ) THEN
        ALTER TABLE public.users
            ADD CONSTRAINT users_merchant_id_fkey
            FOREIGN KEY (merchant_id) REFERENCES public.lc_distribution_merchants(id) NOT VALID;
    END IF;
END $$;

COMMENT ON COLUMN public.users.merchant_id IS '所属分销商户；历史用户归自运营平台';


-- =============================================================================
-- 第 2 段：伙伴后台登录字段
--        （来自 202611190001_distribution_merchant_partner_login.up.sql
--          和 202611200001_distribution_merchant_has_own_web.up.sql）
--
-- 这 5 个列缺任何一个，伙伴后台都登不进去，或者客户站所有站点的登录全部失败。
-- =============================================================================

-- 伙伴后台登录密码（bcrypt 哈希），以及三个随密码生命周期变化的字段
ALTER TABLE public.lc_distribution_merchants
    ADD COLUMN IF NOT EXISTS partner_password_hash            text,
    ADD COLUMN IF NOT EXISTS partner_login_enabled            boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS partner_password_change_required boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS partner_session_version          bigint  NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.lc_distribution_merchants.partner_password_hash IS
    '伙伴后台登录密码 bcrypt 哈希，不返回给前端';
COMMENT ON COLUMN public.lc_distribution_merchants.partner_login_enabled IS
    '伙伴后台登录是否已开通';
COMMENT ON COLUMN public.lc_distribution_merchants.partner_password_change_required IS
    '首次登录或重置密码后必须修改密码';
COMMENT ON COLUMN public.lc_distribution_merchants.partner_session_version IS
    '密码重置或停用时递增，使旧会话失效';

-- has_own_web：客户站登录的硬依赖。
-- lynxtonapi 的 siteauth 会查「has_own_web = false 的商户」来决定
-- 哪些商户的用户可以在自运营站点上登录。缺这一列 → 所有登录直接失败。
ALTER TABLE public.lc_distribution_merchants
    ADD COLUMN IF NOT EXISTS has_own_web boolean NOT NULL DEFAULT false;

-- 已有站点绑定的商户，默认认为它有自己的独立站点
UPDATE public.lc_distribution_merchants
SET has_own_web = true
WHERE site_id IS NOT NULL AND has_own_web = false;

COMMENT ON COLUMN public.lc_distribution_merchants.has_own_web IS
    '商户是否有自己的 Web 站点；false 时用户可在自运营站点登录';


-- =============================================================================
-- 第 3 段：品牌白标列（10 个 brand_*）
--
-- ★ 重要：这一段**在 lynxtonapi 的 migrations 里不存在**。
--   现有环境的这 10 个列是在开发过程中手工加到库上的，没有对应的版本化迁移。
--   所以上线到新库时，这一段必须单独执行，否则伙伴后台的品牌设置页会直接 500
--   （报 column "brand_name" does not exist）。
--
--   字段用途见 backend/internal/partner/partner_brand.go：
--     brand_name / brand_short_name  站名、简称（简称上限 8 字符，用于窄屏）
--     brand_logo_url / brand_favicon_url  图片地址（对象存储公网 URL）
--     brand_primary_color            主色，必须是 #RGB 或 #RRGGBB（有 CHECK 约束）
--     brand_page_title               浏览器标题
--     brand_tagline                  标语
--     brand_api_base_url             客户站代码示例里的接口基地址
--     brand_support                  客服信息（jsonb，必须是 object）
--     brand_landing                  首页配置（jsonb，必须是 object）
-- =============================================================================

ALTER TABLE public.lc_distribution_merchants
    ADD COLUMN IF NOT EXISTS brand_name         varchar(64),
    ADD COLUMN IF NOT EXISTS brand_short_name   varchar(8),
    ADD COLUMN IF NOT EXISTS brand_logo_url     varchar(512),
    ADD COLUMN IF NOT EXISTS brand_primary_color varchar(7),
    ADD COLUMN IF NOT EXISTS brand_page_title   varchar(128),
    ADD COLUMN IF NOT EXISTS brand_favicon_url  varchar(512),
    ADD COLUMN IF NOT EXISTS brand_tagline      varchar(255),
    ADD COLUMN IF NOT EXISTS brand_api_base_url varchar(253),
    ADD COLUMN IF NOT EXISTS brand_support      jsonb,
    ADD COLUMN IF NOT EXISTS brand_landing      jsonb;


-- =============================================================================
-- 第 4 段：品牌列的约束
--
-- 这三条是**数据库层的最后一道防线**，后端代码里也有等价的校验
-- （见 partner_brand.go 顶部的注释：约束来自数据库本身，Go 里只是提前校验
--  以便给出可读的错误信息，不是唯一防线）。
--
-- 用 DO 块是因为 ADD CONSTRAINT 没有 IF NOT EXISTS 语法。
-- =============================================================================

DO $$
BEGIN
    -- 主色格式：只接受 #RGB 或 #RRGGBB
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'lc_distribution_merchants_primary_color_format'
    ) THEN
        ALTER TABLE public.lc_distribution_merchants
            ADD CONSTRAINT lc_distribution_merchants_primary_color_format
            CHECK (
                brand_primary_color IS NULL
                OR brand_primary_color ~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$'
            );
    END IF;

    -- 品牌名非空（NULL 允许，空串不允许）
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'lc_distribution_merchants_brand_name_not_blank'
    ) THEN
        ALTER TABLE public.lc_distribution_merchants
            ADD CONSTRAINT lc_distribution_merchants_brand_name_not_blank
            CHECK (brand_name IS NULL OR btrim(brand_name::text) <> '');
    END IF;

    -- 客服信息 / 首页配置必须是 JSON 对象，不能是数组或标量
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'lc_distribution_merchants_brand_json_shape'
    ) THEN
        ALTER TABLE public.lc_distribution_merchants
            ADD CONSTRAINT lc_distribution_merchants_brand_json_shape
            CHECK (
                (brand_support IS NULL OR jsonb_typeof(brand_support) = 'object')
                AND
                (brand_landing IS NULL OR jsonb_typeof(brand_landing) = 'object')
            );
    END IF;
END $$;


-- =============================================================================
-- 第 5 段：分销商文档表（本仓库自带脚本）
--
-- 文件位置：backend/internal/partner/doc_tables.sql
-- 这里原样收录，方便一次性执行。
--
-- 为什么不复用主站的 lc_doc_categories / lc_doc_articles：
--   那两张表的 slug 是全局唯一索引，第二个站点想建同名分类就会撞键
--   （A 站建了 getting-started，B 站就建不了）。改成 (site_id, slug) 联合唯一
--   等于要动主站库结构，所以另起一套按站点隔离的表。
--
-- 后端启动时会 AutoMigrate 兜底，但这在生产环境通常会失败 ——
-- 应用账号一般没有 DDL 权限。所以**必须**由这里预先建好。
-- =============================================================================

BEGIN;

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


-- =============================================================================
-- 第 6 段：本仓库后端**只读**、不需要新建的表
--
-- 这些表由 lynxtonapi 侧维护，伙伴后端直接复用。列在这里是为了让上线时
-- 有一个完整的「依赖清单」，漏了它们会比缺列报更难懂的错。
--   · users        —— 客户列表（/api/partner/users 按 merchant_id 过滤）
--                     ★ 依赖第 1 段加的 merchant_id 列
--   · logs         —— 调用日志、用量统计、计费汇总
--                     ★ 依赖 lynxtonapi 自己的日志表结构，本仓库不建
--   · options      —— 对象存储配置（brand/upload 从这里读 AK/SK/端点/桶）
--                     ★ 键前缀 object_storage_setting.
-- =============================================================================


-- =============================================================================
-- 第 7 段：上线后验证
--
-- 执行完以上各段后跑这段，全部是只读查询，用来确认「该有的都有了」。
-- =============================================================================

-- 7.1 商户表列是否齐全（期望至少 24 列）
SELECT count(*) AS merchant_column_count
FROM information_schema.columns
WHERE table_name = 'lc_distribution_merchants';

-- 7.2 关键列逐个点名检查（任何一行 missing 都要回去补对应段落）
SELECT
    'merchant_id'                        AS need, to_regclass('public.users') IS NOT NULL AS has_table,
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_name='users' AND column_name='merchant_id')             AS has_column
UNION ALL SELECT 'partner_password_hash',
    true, EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_name='lc_distribution_merchants' AND column_name='partner_password_hash')
UNION ALL SELECT 'partner_login_enabled',
    true, EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_name='lc_distribution_merchants' AND column_name='partner_login_enabled')
UNION ALL SELECT 'partner_password_change_required',
    true, EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_name='lc_distribution_merchants' AND column_name='partner_password_change_required')
UNION ALL SELECT 'partner_session_version',
    true, EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_name='lc_distribution_merchants' AND column_name='partner_session_version')
UNION ALL SELECT 'has_own_web',
    true, EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_name='lc_distribution_merchants' AND column_name='has_own_web')
UNION ALL SELECT 'brand_name',
    true, EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_name='lc_distribution_merchants' AND column_name='brand_name')
UNION ALL SELECT 'brand_landing',
    true, EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_name='lc_distribution_merchants' AND column_name='brand_landing')
UNION ALL SELECT 'brand_support',
    true, EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_name='lc_distribution_merchants' AND column_name='brand_support');

-- 7.3 约束是否都建上了（期望 3 条）
SELECT conname
FROM pg_constraint
WHERE conrelid = 'lc_distribution_merchants'::regclass
  AND conname IN (
      'lc_distribution_merchants_primary_color_format',
      'lc_distribution_merchants_brand_name_not_blank',
      'lc_distribution_merchants_brand_json_shape'
  )
ORDER BY conname;

-- 7.4 自运营平台那条记录是否在（id 通常为 1）
SELECT id, merchant_code, merchant_name, has_own_web, partner_login_enabled
FROM lc_distribution_merchants
WHERE merchant_code = 'self-operated';

-- 7.5 文档表与索引
SELECT tablename FROM pg_tables
WHERE schemaname='public' AND tablename LIKE 'lc_partner_doc%' ORDER BY tablename;

SELECT indexname FROM pg_indexes
WHERE schemaname='public' AND tablename LIKE 'lc_partner_doc%' ORDER BY indexname;


-- =============================================================================
-- 补充：MySQL 部署
--
-- 上面全部是 PostgreSQL 语法。若目标库是 MySQL：
--   · 第 1~2 段用 lynxtonapi 的对应迁移改写（bigserial → bigint auto_increment，
--     timestamptz → datetime，bytea → varbinary(32)，jsonb → json，
--     DO 块 → 先查 information_schema 再拼 SQL）
--   · 第 5 段可直接依赖后端启动时的 AutoMigrate 建表
--     （doc_tables.sql 末尾已注明这一点；MySQL 不支持 CREATE INDEX IF NOT EXISTS）
--   · CHECK 约束在 MySQL 8.0.16+ 才真正生效，更低版本会被静默忽略 ——
--     这意味着 brand_primary_color 的格式校验只剩 Go 层一道防线
-- =============================================================================
