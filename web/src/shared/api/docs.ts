/**
 * ============================================================================
 *  文档中心 API
 * ============================================================================
 *
 *  对接 partner/backend/internal/partner/doc_api.go。
 *  数据在 lc_partner_doc_categories / lc_partner_doc_articles，按 site_id 隔离 ——
 *  每个分销商站点管自己那份文档，彼此看不见也改不到。
 *
 *  ---------------------------------------------------------------------------
 *  和老项目的关系：
 *
 *  接口形状（tree / categories / articles / reorder / preview）刻意与
 *  lynxtonapi 的 /api/lynx/admin/docs/* 保持一致，页面代码也是照着
 *  web-admin 的 SettingsDocs 搬过来的。这样两边的心智模型相同：
 *  以后要同步功能，diff 起来不会面目全非。
 *
 *  但**数据是两套**：老库的 lc_doc_* 表 slug 是全局唯一索引，第二个站点
 *  建同名分类会撞键，所以另起了 lc_partner_doc_*。这一点在 backend 的
 *  doc_model.go 顶部有完整说明。
 */

import { EP } from './endpoints';
import { fillPath, request, USE_MOCK } from './http';

/** 多语种字段：key 是语种代码（zh / en），value 是文案 */
export type DocLocaleMap = Record<string, string>;

/** 分类：articles = 展开后是文章列表；openapi = 承载 OpenAPI 规范（本期只展示不编辑） */
export type DocKind = 'articles' | 'openapi';

export interface PartnerDocCategory {
  id: number;
  site_id: string;
  parent_id: number | null;
  slug: string;
  kind: DocKind;
  title_zh: string;
  title_en: string;
  title_labels?: DocLocaleMap;
  summary_zh: string;
  summary_en: string;
  summary_labels?: DocLocaleMap;
  sort: number;
  visible: boolean;
  created_at: number;
  updated_at: number;
}

export interface PartnerDocArticle {
  id: number;
  site_id: string;
  category_id: number;
  slug: string;
  title_zh: string;
  title_en: string;
  title_labels?: DocLocaleMap;
  summary_zh: string;
  summary_en: string;
  summary_labels?: DocLocaleMap;
  content_zh: string;
  content_en: string;
  content_labels?: DocLocaleMap;
  sort: number;
  published: boolean;
  updated_by: number;
  created_at: number;
  updated_at: number;
}

export interface PartnerDocTree {
  site_id: string;
  categories: PartnerDocCategory[];
  articles: PartnerDocArticle[];
}

export interface DocCategoryPayload {
  parent_id?: number | null;
  slug: string;
  kind?: DocKind;
  title_zh: string;
  title_en?: string;
  title_labels?: DocLocaleMap;
  summary_zh?: string;
  summary_en?: string;
  summary_labels?: DocLocaleMap;
  sort?: number;
  visible?: boolean;
}

export interface DocArticlePayload {
  category_id: number;
  slug: string;
  title_zh: string;
  title_en?: string;
  title_labels?: DocLocaleMap;
  summary_zh?: string;
  summary_en?: string;
  summary_labels?: DocLocaleMap;
  content_zh?: string;
  content_en?: string;
  content_labels?: DocLocaleMap;
  sort?: number;
  published?: boolean;
}

export interface DocSortItem {
  id: number;
  sort: number;
}

/** 一次拿到分类 + 文章（含正文）。后台树面板需要同时渲染两层，拆开会闪。 */
export async function fetchDocTree(): Promise<PartnerDocTree> {
  if (USE_MOCK) {
    return { site_id: 'mock', categories: [], articles: [] };
  }
  return request<PartnerDocTree>({ url: EP.dealer.docsTree });
}

export async function createDocCategory(payload: DocCategoryPayload): Promise<PartnerDocCategory> {
  return request<PartnerDocCategory>({
    url: EP.dealer.docsCategoryCreate,
    method: 'POST',
    data: payload,
  });
}

export async function updateDocCategory(
  id: number,
  payload: DocCategoryPayload,
): Promise<PartnerDocCategory> {
  return request<PartnerDocCategory>({
    url: fillPath(EP.dealer.docsCategoryUpdate, { id }),
    method: 'PUT',
    data: payload,
  });
}

export async function deleteDocCategory(id: number): Promise<{ deleted_categories: number; deleted_articles: number }> {
  return request({
    url: fillPath(EP.dealer.docsCategoryDelete, { id }),
    method: 'DELETE',
  });
}

export async function reorderDocCategories(items: DocSortItem[]): Promise<{ updated: number }> {
  return request({
    url: EP.dealer.docsCategoryReorder,
    method: 'PUT',
    data: { items },
  });
}

export async function createDocArticle(payload: DocArticlePayload): Promise<PartnerDocArticle> {
  return request<PartnerDocArticle>({
    url: EP.dealer.docsArticleCreate,
    method: 'POST',
    data: payload,
  });
}

/**
 * 取单篇文章（含正文）。
 *
 * tree 接口已经带了正文，所以正常情况下不需要单独调这个。保留它是因为
 * 「打开编辑器」和「列表刷新」可能相隔很久：用户可能在别处改过这篇文章，
 * 重新拉一次能拿到最新版本，避免用旧正文覆盖别人的修改。
 */
export async function fetchDocArticle(id: number): Promise<PartnerDocArticle> {
  return request<PartnerDocArticle>({
    url: fillPath(EP.dealer.docsArticleGet, { id }),
    method: 'GET',
  });
}

export async function updateDocArticle(
  id: number,
  payload: DocArticlePayload,
): Promise<PartnerDocArticle> {
  return request<PartnerDocArticle>({
    url: fillPath(EP.dealer.docsArticleUpdate, { id }),
    method: 'PUT',
    data: payload,
  });
}

export async function deleteDocArticle(id: number): Promise<{ deleted: number }> {
  return request({
    url: fillPath(EP.dealer.docsArticleDelete, { id }),
    method: 'DELETE',
  });
}

export async function reorderDocArticles(items: DocSortItem[]): Promise<{ updated: number }> {
  return request({
    url: EP.dealer.docsArticleReorder,
    method: 'PUT',
    data: { items },
  });
}

/** 导入结果：只报数量，够前端做提示文案。 */
export interface DocSeedImportSummary {
  categories_created: number;
  categories_updated: number;
  categories_skipped: number;
  articles_created: number;
  articles_updated: number;
  articles_skipped: number;
}

export interface DocSeedImportResult {
  site_id: string;
  mode: 'skip' | 'overwrite';
  summary: DocSeedImportSummary;
}

/**
 * 导入内置默认文档（入门 / 模型指南 / API 参考）。
 *
 * mode=skip（默认）只补缺失的分类与文章，不动已有内容；
 * mode=overwrite 会用模板覆盖同 slug 的标题和正文。
 * 两种模式都不会删除商户自己新建的东西。
 */
export async function importDocSeed(
  mode: 'skip' | 'overwrite' = 'skip',
): Promise<DocSeedImportResult> {
  return request<DocSeedImportResult>({
    url: EP.dealer.docsSeedImport,
    method: 'POST',
    params: { mode },
  });
}

/* ------------------------------------------------------------------ */
/* 纯函数：树构建                                                       */
/* ------------------------------------------------------------------ */

export interface DocTreeNode {
  key: string;
  /** category 节点本身是分类；article 是文章 */
  type: 'category' | 'article';
  title: string;
  /** 分类：是否显示；文章：是否已发布 */
  active: boolean;
  /** 分类：子节点数（含文章）；文章：无意义 */
  count: number;
  category?: PartnerDocCategory;
  article?: PartnerDocArticle;
  children?: DocTreeNode[];
}

/**
 * 把扁平的 categories + articles 拼成 antd Tree 要的嵌套结构。
 *
 * 排序规则与后端一致：sort 升序、同 sort 按 id 升序。
 * 这条必须两边一样 —— 否则后台看到的顺序和客户站看到的顺序会不同，
 * 而用户拖拽排序时是以后台为准的，会以为自己没保存成功。
 */
export function buildDocTreeNodes(
  categories: PartnerDocCategory[],
  articles: PartnerDocArticle[],
): DocTreeNode[] {
  const byCategory = new Map<number, PartnerDocArticle[]>();
  articles.forEach((a) => {
    const list = byCategory.get(a.category_id) ?? [];
    list.push(a);
    byCategory.set(a.category_id, list);
  });

  const kindOf = (c: PartnerDocCategory) => c.title_zh || c.title_en || c.slug;

  const build = (cat: PartnerDocCategory): DocTreeNode => {
    const children: DocTreeNode[] = [];

    categories
      .filter((c) => c.parent_id === cat.id)
      .sort((a, b) => a.sort - b.sort || a.id - b.id)
      .forEach((sub) => children.push(build(sub)));

    (byCategory.get(cat.id) ?? [])
      .sort((a, b) => a.sort - b.sort || a.id - b.id)
      .forEach((a) => {
        children.push({
          key: `a-${a.id}`,
          type: 'article',
          title: a.title_zh || a.title_en || a.slug,
          active: a.published,
          count: 0,
          article: a,
          children: [],
        });
      });

    return {
      key: `c-${cat.id}`,
      type: 'category',
      title: kindOf(cat),
      active: cat.visible,
      count: children.length,
      category: cat,
      children,
    };
  };

  return categories
    .filter((c) => c.parent_id == null)
    .sort((a, b) => a.sort - b.sort || a.id - b.id)
    .map(build);
}

/**
 * 校验 slug：只放行小写字母、数字、连字符。
 *
 * 和后端 normalizeDocSlug 同一套规则，这里先拦一道是为了让用户
 * 即时看到错误，而不是提交后等接口报错。两处规则必须同步改 ——
 * 前端放宽而后端拒绝，用户会看到「明明能填却保存不了」。
 */
export function validateDocSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  if (!slug) return '标识不能为空';
  if (slug.length > 64) return '标识不能超过 64 个字符';
  if (!/^[a-z0-9-]+$/.test(slug)) return '标识只能包含小写字母、数字和连字符';
  if (slug.startsWith('-') || slug.endsWith('-')) return '标识不能以连字符开头或结尾';
  return null;
}
