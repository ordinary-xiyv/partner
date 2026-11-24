import type { AppLocale } from '../i18n/config';

export type DocLang = AppLocale;

export type DocCategoryKind = 'articles';

export interface DocCategory {
  id: number;
  parent_id: number | null;
  slug: string;
  kind: DocCategoryKind;
  title_zh: string;
  title_en: string;
  title_labels?: Partial<Record<DocLang, string>>;
  summary_zh: string;
  summary_en: string;
  summary_labels?: Partial<Record<DocLang, string>>;
  sort: number;
  visible: boolean;
  created_at: number;
  updated_at: number;
}

export interface DocArticle {
  id: number;
  category_id: number;
  slug: string;
  title_zh: string;
  title_en: string;
  title_labels?: Partial<Record<DocLang, string>>;
  summary_zh: string;
  summary_en: string;
  summary_labels?: Partial<Record<DocLang, string>>;
  content_zh: string;
  content_en: string;
  content_labels?: Partial<Record<DocLang, string>>;
  sort: number;
  published: boolean;
  updated_by: number;
  created_at: number;
  updated_at: number;
}

/**
 * 一棵完整的文档快照（扁平分类 + 扁平文章）。
 *
 * 用途：publicDocsTree.ts 里那几个树构建函数的输入类型 —— 把「扁平的
 * 分类/文章表」拼成客户站要的嵌套树。它和「数据存在哪」无关，任何
 * 符合这个形状的数据都能用（当前调用方是 normalizePublicDocsTree）。
 *
 * 名字里的 Snapshot 是历史遗留：它最早只服务于 localStorage mock。
 * mock 已经从客户站移除（模板搬到后端做种子），这个类型本身仍然有用，
 * 所以保留，但不要再把它当「mock 专用」理解。
 */
export interface DocStoreSnapshot {
  categories: DocCategory[];
  articles: DocArticle[];
}

/**
 * 公开导航 — GET /api/lynx/docs/tree（顶级 categories + 嵌套 nodes，顺序与管理端一致）
 */
export interface PublicDocsTreeArticle {
  slug: string;
  title: string;
  summary: string;
  sort: number;
  path: string;
}

export interface PublicDocsTreeCategory {
  id: number;
  slug: string;
  kind: DocCategoryKind;
  title: string;
  summary: string;
  sort: number;
  path?: string;
  /** Child articles and subcategories in display order (matches admin tree) */
  nodes?: PublicDocsTreeNode[];
}

export type PublicDocsTreeNode =
  | { type: 'article'; data: PublicDocsTreeArticle }
  | { type: 'category'; data: PublicDocsTreeCategory };

export interface PublicDocsTree {
  lang: DocLang;
  base_url: string;
  categories: PublicDocsTreeCategory[];
  /** 顶级独立文章（无子级时的 1:1 文档，已发布） */
  articles?: PublicDocsTreeArticle[];
}

/** 公开文章 — GET /api/lynx/docs/articles/:slug */
export interface PublicDocArticle {
  slug: string;
  category_slug: string;
  category_title: string;
  lang: DocLang;
  title: string;
  summary: string;
  content: string;
  updated_at: number;
  prev: PublicDocNavLink | null;
  next: PublicDocNavLink | null;
}

export interface PublicDocNavLink {
  slug: string;
  title: string;
  path: string;
}

export interface AdminDocsTreeCategory extends DocCategory {
  articles: AdminDocsTreeArticle[];
}

export interface AdminDocsTreeArticle {
  id: number;
  slug: string;
  title_zh: string;
  title_en: string;
  sort: number;
  published: boolean;
  updated_at: number;
  updated_by: number;
}

export interface DocArticleInput {
  category_id: number;
  slug: string;
  title_zh: string;
  title_en: string;
  title_labels?: Partial<Record<DocLang, string>>;
  summary_zh: string;
  summary_en: string;
  summary_labels?: Partial<Record<DocLang, string>>;
  content_zh: string;
  content_en: string;
  content_labels?: Partial<Record<DocLang, string>>;
  sort: number;
  published: boolean;
}

export interface DocCategoryInput {
  parent_id: number | null;
  slug: string;
  kind: DocCategoryKind;
  title_zh: string;
  title_en: string;
  title_labels?: Partial<Record<DocLang, string>>;
  summary_zh: string;
  summary_en: string;
  summary_labels?: Partial<Record<DocLang, string>>;
  sort: number;
  visible: boolean;
}

export interface DocArticlePreviewInput {
  slug?: string;
  lang: DocLang;
  title_zh: string;
  title_en: string;
  title_labels?: Partial<Record<DocLang, string>>;
  content_zh: string;
  content_en: string;
  content_labels?: Partial<Record<DocLang, string>>;
}

export interface DocArticlePreviewResult {
  lang: DocLang;
  title: string;
  content: string;
}

export interface LynxApiEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T;
}
