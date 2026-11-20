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

export interface DocStoreSnapshot {
  /** Mock-only: tracks built-in template generation for localStorage migration */
  seed_version?: number;
  categories: DocCategory[];
  articles: DocArticle[];
}

/** 公开导航 — GET /api/lynx/docs/tree（顶级 categories + 嵌套 nodes，顺序与管理端一致） */
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
