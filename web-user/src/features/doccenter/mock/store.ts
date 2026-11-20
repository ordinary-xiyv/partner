import type {
  AdminDocsTreeCategory,
  DocArticle,
  DocArticleInput,
  DocArticlePreviewInput,
  DocArticlePreviewResult,
  DocCategory,
  DocCategoryInput,
  DocLang,
  DocStoreSnapshot,
  PublicDocArticle,
  PublicDocsTree,
} from '../../../types/doccenter';
import { buildDocCenterSeed } from './seed';
import { syncDefaultTemplateSnapshot } from './syncDefaultTemplate';
import { pickLocalizedField } from '../utils/resolveDocLang';
import { applyDocTemplate, buildDocTemplateContext } from '../utils/renderTemplate';
import {
  buildPublicDocsTree,
  collectPublishedArticlesInDisplayOrder,
  normalizePublicDocsTree,
} from '../utils/publicDocsTree';

const STORAGE_KEY = 'lynx_doccenter_store_v1';

let nextId = 1000;

function now() {
  return Math.floor(Date.now() / 1000);
}

function cloneSnapshot(snapshot: DocStoreSnapshot): DocStoreSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as DocStoreSnapshot;
}

function hydrateSnapshot(parsed: DocStoreSnapshot): DocStoreSnapshot {
  nextId = Math.max(
    1000,
    ...parsed.categories.map((item) => item.id),
    ...parsed.articles.map((item) => item.id),
  ) + 1;

  const { snapshot, changed } = syncDefaultTemplateSnapshot(parsed, () => nextId++);
  if (changed) {
    saveSnapshot(snapshot);
  }
  return snapshot;
}

function loadSnapshot(): DocStoreSnapshot {
  if (typeof window === 'undefined') {
    return buildDocCenterSeed();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = buildDocCenterSeed();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as DocStoreSnapshot;
    return hydrateSnapshot(parsed);
  } catch {
    const seed = buildDocCenterSeed();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
}

function saveSnapshot(snapshot: DocStoreSnapshot) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function buildPublicTree(snapshot: DocStoreSnapshot, lang: DocLang): PublicDocsTree {
  const baseUrl = buildDocTemplateContext({ lang }).baseUrl;
  return buildPublicDocsTree(snapshot, lang, baseUrl);
}

function buildPublicArticle(snapshot: DocStoreSnapshot, slug: string, lang: DocLang): PublicDocArticle | null {
  const article = snapshot.articles.find((item) => item.slug === slug && item.published);
  if (!article) return null;
  const category = snapshot.categories.find((item) => item.id === article.category_id && item.visible);
  if (!category || category.kind !== 'articles') return null;

  const ordered = collectPublishedArticlesInDisplayOrder(snapshot);
  const index = ordered.findIndex((item) => item.id === article.id);
  const prevItem = index > 0 ? ordered[index - 1] : null;
  const nextItem = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;

  const ctx = buildDocTemplateContext({ lang });
  const rawContent = pickLocalizedField(lang, article.content_labels, article.content_zh, article.content_en);
  const title = pickLocalizedField(lang, article.title_labels, article.title_zh, article.title_en);
  const summary = pickLocalizedField(lang, article.summary_labels, article.summary_zh, article.summary_en);
  const categoryTitle = pickLocalizedField(lang, category.title_labels, category.title_zh, category.title_en);

  const toNav = (item: DocArticle | null) => {
    if (!item) return null;
    return {
      slug: item.slug,
      title: pickLocalizedField(lang, item.title_labels, item.title_zh, item.title_en),
      path: `/docs/${item.slug}`,
    };
  };

  return {
    slug: article.slug,
    category_slug: category.slug,
    category_title: categoryTitle,
    lang,
    title,
    summary,
    content: applyDocTemplate(rawContent, ctx),
    updated_at: article.updated_at,
    prev: toNav(prevItem),
    next: toNav(nextItem),
  };
}

function buildAdminTree(snapshot: DocStoreSnapshot): { categories: AdminDocsTreeCategory[] } {
  const categories = [...snapshot.categories]
    .sort((a, b) => a.sort - b.sort)
    .map((category) => ({
      ...category,
      articles: snapshot.articles
        .filter((item) => item.category_id === category.id)
        .sort((a, b) => a.sort - b.sort)
        .map((article) => ({
          id: article.id,
          slug: article.slug,
          title_zh: article.title_zh,
          title_en: article.title_en,
          sort: article.sort,
          published: article.published,
          updated_at: article.updated_at,
          updated_by: article.updated_by,
        })),
    }));
  return { categories };
}

export const docCenterMockStore = {
  resetSeed() {
    const seed = buildDocCenterSeed();
    saveSnapshot(seed);
    return seed;
  },

  getPublicTree(lang: DocLang): PublicDocsTree {
    return buildPublicTree(loadSnapshot(), lang);
  },

  getPublicArticle(slug: string, lang: DocLang): PublicDocArticle | null {
    return buildPublicArticle(loadSnapshot(), slug, lang);
  },

  getAdminTree() {
    return buildAdminTree(loadSnapshot());
  },

  getCategory(id: number): DocCategory | null {
    return loadSnapshot().categories.find((item) => item.id === id) ?? null;
  },

  getArticle(id: number): DocArticle | null {
    return loadSnapshot().articles.find((item) => item.id === id) ?? null;
  },

  previewArticle(input: DocArticlePreviewInput): DocArticlePreviewResult {
    const lang = input.lang;
    const ctx = buildDocTemplateContext({ lang });
    const title = pickLocalizedField(lang, input.title_labels, input.title_zh, input.title_en);
    const rawContent = pickLocalizedField(lang, input.content_labels, input.content_zh, input.content_en);
    return {
      lang,
      title,
      content: applyDocTemplate(rawContent, ctx),
    };
  },

  createCategory(input: DocCategoryInput, updatedBy: number): DocCategory {
    const snapshot = cloneSnapshot(loadSnapshot());
    const ts = now();
    const category: DocCategory = {
      id: nextId++,
      parent_id: input.parent_id,
      slug: input.slug,
      kind: input.kind,
      title_zh: input.title_zh,
      title_en: input.title_en,
      summary_zh: input.summary_zh,
      summary_en: input.summary_en,
      sort: input.sort,
      visible: input.visible,
      created_at: ts,
      updated_at: ts,
    };
    snapshot.categories.push(category);
    saveSnapshot(snapshot);
    void updatedBy;
    return category;
  },

  updateCategory(id: number, input: DocCategoryInput): DocCategory {
    const snapshot = cloneSnapshot(loadSnapshot());
    const index = snapshot.categories.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('doccenter.not_found');
    const current = snapshot.categories[index];
    if (current.kind !== input.kind) throw new Error('doccenter.category_kind_immutable');
    snapshot.categories[index] = {
      ...current,
      ...input,
      id,
      kind: current.kind,
      updated_at: now(),
    };
    saveSnapshot(snapshot);
    return snapshot.categories[index];
  },

  deleteCategory(id: number) {
    const snapshot = cloneSnapshot(loadSnapshot());
    const category = snapshot.categories.find((item) => item.id === id);
    if (!category) throw new Error('doccenter.not_found');
    if (snapshot.categories.some((item) => item.parent_id === id)) {
      throw new Error('doccenter.category_not_empty');
    }
    if (snapshot.articles.some((item) => item.category_id === id)) {
      throw new Error('doccenter.category_not_empty');
    }
    snapshot.categories = snapshot.categories.filter((item) => item.id !== id);
    saveSnapshot(snapshot);
  },

  reorderCategories(items: { id: number; sort: number }[]) {
    const snapshot = cloneSnapshot(loadSnapshot());
    items.forEach(({ id, sort }) => {
      const category = snapshot.categories.find((item) => item.id === id);
      if (category) {
        category.sort = sort;
        category.updated_at = now();
      }
    });
    saveSnapshot(snapshot);
    return { updated: items.length };
  },

  createArticle(input: DocArticleInput, updatedBy: number): DocArticle {
    const snapshot = cloneSnapshot(loadSnapshot());
    const category = snapshot.categories.find((item) => item.id === input.category_id);
    if (!category || category.kind !== 'articles') throw new Error('doccenter.invalid_category');
    if (snapshot.articles.some((item) => item.slug === input.slug)) throw new Error('doccenter.slug_conflict');
    const ts = now();
    const article: DocArticle = {
      id: nextId++,
      category_id: input.category_id,
      slug: input.slug,
      title_zh: input.title_zh,
      title_en: input.title_en,
      summary_zh: input.summary_zh,
      summary_en: input.summary_en,
      content_zh: input.content_zh,
      content_en: input.content_en,
      sort: input.sort,
      published: input.published,
      updated_by: updatedBy,
      created_at: ts,
      updated_at: ts,
    };
    snapshot.articles.push(article);
    saveSnapshot(snapshot);
    return article;
  },

  updateArticle(id: number, input: DocArticleInput, updatedBy: number): DocArticle {
    const snapshot = cloneSnapshot(loadSnapshot());
    const index = snapshot.articles.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('doccenter.not_found');
    const current = snapshot.articles[index];
    if (snapshot.articles.some((item) => item.slug === input.slug && item.id !== id)) {
      throw new Error('doccenter.slug_conflict');
    }
    snapshot.articles[index] = {
      ...current,
      ...input,
      id,
      updated_by: updatedBy,
      updated_at: now(),
    };
    saveSnapshot(snapshot);
    return snapshot.articles[index];
  },

  deleteArticle(id: number) {
    const snapshot = cloneSnapshot(loadSnapshot());
    snapshot.articles = snapshot.articles.filter((item) => item.id !== id);
    saveSnapshot(snapshot);
  },

  reorderArticles(categoryId: number, items: { id: number; sort: number }[]) {
    const snapshot = cloneSnapshot(loadSnapshot());
    items.forEach(({ id, sort }) => {
      const article = snapshot.articles.find((item) => item.id === id && item.category_id === categoryId);
      if (article) {
        article.sort = sort;
        article.updated_at = now();
      }
    });
    saveSnapshot(snapshot);
    return { updated: items.length };
  },
};
