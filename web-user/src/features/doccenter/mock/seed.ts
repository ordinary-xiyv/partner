import type { DocArticle, DocCategory, DocStoreSnapshot } from '../../../types/doccenter';
import {
  API_REFERENCE_ARTICLE_SEEDS,
  API_REFERENCE_CATEGORY_SEEDS,
  GUIDE_ARTICLE_TEMPLATES,
  loadApiReferenceMarkdown,
} from '../templates/templateContent';

/** bump when default template structure/content changes */
export const DOC_CENTER_SEED_VERSION = 6;

const ROOT_CATEGORY_IDS = {
  'getting-started': 1,
  'model-guides': 2,
  'api-reference': 99,
} as const;

const now = () => Math.floor(Date.now() / 1000);

function buildCategories(ts: number): DocCategory[] {
  const categoryIdBySlug = new Map<string, number>(Object.entries(ROOT_CATEGORY_IDS));
  let nextCategoryId = 1001;

  API_REFERENCE_CATEGORY_SEEDS.forEach((seed) => {
    categoryIdBySlug.set(seed.slug, nextCategoryId);
    nextCategoryId += 1;
  });

  const roots: DocCategory[] = [
    {
      id: 1,
      parent_id: null,
      slug: 'getting-started',
      kind: 'articles',
      title_zh: '入门',
      title_en: 'Getting Started',
      summary_zh: '',
      summary_en: '',
      sort: 10,
      visible: true,
      created_at: ts,
      updated_at: ts,
    },
    {
      id: 2,
      parent_id: null,
      slug: 'model-guides',
      kind: 'articles',
      title_zh: '模型指南',
      title_en: 'Model Guides',
      summary_zh: '',
      summary_en: '',
      sort: 20,
      visible: true,
      created_at: ts,
      updated_at: ts,
    },
    {
      id: 99,
      parent_id: null,
      slug: 'api-reference',
      kind: 'articles',
      title_zh: 'API 参考',
      title_en: 'API Reference',
      summary_zh: '',
      summary_en: '',
      sort: 90,
      visible: true,
      created_at: ts,
      updated_at: ts,
    },
  ];

  const nested = API_REFERENCE_CATEGORY_SEEDS.map((seed) => ({
    id: categoryIdBySlug.get(seed.slug)!,
    parent_id: seed.parentSlug === 'api-reference'
      ? ROOT_CATEGORY_IDS['api-reference']
      : categoryIdBySlug.get(seed.parentSlug)!,
    slug: seed.slug,
    kind: 'articles' as const,
    title_zh: seed.title_zh,
    title_en: seed.title_en,
    summary_zh: '',
    summary_en: '',
    sort: seed.sort,
    visible: true,
    created_at: ts,
    updated_at: ts,
  }));

  return [...roots, ...nested];
}

function buildArticles(ts: number, categories: DocCategory[]): DocArticle[] {
  const categoryIdBySlug = new Map(categories.map((item) => [item.slug, item.id]));
  let nextArticleId = 101;

  const guideArticles = GUIDE_ARTICLE_TEMPLATES.map((template) => ({
    id: nextArticleId++,
    category_id: categoryIdBySlug.get(template.categorySlug)!,
    slug: template.slug,
    title_zh: template.title_zh,
    title_en: template.title_en,
    summary_zh: '',
    summary_en: '',
    content_zh: template.content_zh,
    content_en: '',
    sort: template.sort,
    published: true,
    updated_by: 0,
    created_at: ts,
    updated_at: ts,
  }));

  const apiArticles = API_REFERENCE_ARTICLE_SEEDS.map((seed) => ({
    id: nextArticleId++,
    category_id: categoryIdBySlug.get(seed.categorySlug)!,
    slug: seed.slug,
    title_zh: seed.title_zh,
    title_en: seed.title_en,
    summary_zh: '',
    summary_en: '',
    content_zh: loadApiReferenceMarkdown(seed.file),
    content_en: '',
    sort: seed.sort,
    published: true,
    updated_by: 0,
    created_at: ts,
    updated_at: ts,
  }));

  return [...guideArticles, ...apiArticles];
}

export function buildDocCenterSeed(): DocStoreSnapshot {
  const ts = now();
  const categories = buildCategories(ts);
  return {
    seed_version: DOC_CENTER_SEED_VERSION,
    categories,
    articles: buildArticles(ts, categories),
  };
}
