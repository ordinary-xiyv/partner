import type { DocArticle, DocStoreSnapshot } from '../../../types/doccenter';
import { buildDocCenterSeed, DOC_CENTER_SEED_VERSION } from './seed';

export { DOC_CENTER_SEED_VERSION };

function articleTemplateFieldsMatch(current: DocArticle, template: DocArticle): boolean {
  return (
    current.title_zh === template.title_zh
    && current.title_en === template.title_en
    && current.content_zh === template.content_zh
    && current.content_en === template.content_en
    && current.sort === template.sort
    && current.published === template.published
    && current.slug === template.slug
  );
}

function remapCategories(snapshot: DocStoreSnapshot, template: DocStoreSnapshot): DocStoreSnapshot['categories'] {
  const existingIdBySlug = new Map(snapshot.categories.map((item) => [item.slug, item.id]));
  let nextId = Math.max(
    1000,
    ...snapshot.categories.map((item) => item.id),
    ...template.categories.map((item) => item.id),
  ) + 1;
  const templateIdToSlug = new Map(template.categories.map((item) => [item.id, item.slug]));

  const slugToId = new Map<string, number>();
  template.categories.forEach((item) => {
    slugToId.set(item.slug, existingIdBySlug.get(item.slug) ?? nextId++);
  });

  return template.categories.map((item) => {
    const parentSlug = item.parent_id != null ? templateIdToSlug.get(item.parent_id) : null;
    return {
      ...item,
      id: slugToId.get(item.slug)!,
      parent_id: parentSlug ? slugToId.get(parentSlug) ?? null : null,
    };
  });
}

function remapArticles(
  templateArticles: DocArticle[],
  categories: DocStoreSnapshot['categories'],
  template: DocStoreSnapshot,
  snapshot: DocStoreSnapshot,
  allocateId: () => number,
): DocArticle[] {
  const categoryIdBySlug = new Map(categories.map((item) => [item.slug, item.id]));
  const existingIdBySlug = new Map(snapshot.articles.map((item) => [item.slug, item.id]));

  return templateArticles.map((item) => {
    const categorySlug = template.categories.find((cat) => cat.id === item.category_id)?.slug ?? '';
    return {
      ...item,
      id: existingIdBySlug.get(item.slug) ?? allocateId(),
      category_id: categoryIdBySlug.get(categorySlug) ?? item.category_id,
    };
  });
}

export function syncDefaultTemplateSnapshot(
  snapshot: DocStoreSnapshot,
  allocateId: () => number,
): { snapshot: DocStoreSnapshot; changed: boolean } {
  const template = buildDocCenterSeed();
  const forceResync = (snapshot.seed_version ?? 1) !== DOC_CENTER_SEED_VERSION;

  if (forceResync) {
    const customizedArticles = snapshot.articles.filter((item) => item.updated_by !== 0);
    const categories = remapCategories(snapshot, template);
    const defaultArticles = remapArticles(
      template.articles.filter((item) => !customizedArticles.some((custom) => custom.slug === item.slug)),
      categories,
      template,
      snapshot,
      allocateId,
    );

    return {
      snapshot: {
        seed_version: DOC_CENTER_SEED_VERSION,
        categories,
        articles: [...defaultArticles, ...customizedArticles],
      },
      changed: true,
    };
  }

  let changed = false;
  const templateBySlug = new Map(template.articles.map((item) => [item.slug, item]));
  const articles = snapshot.articles.map((article) => {
    if (article.updated_by !== 0) return article;
    const tpl = templateBySlug.get(article.slug);
    if (!tpl || articleTemplateFieldsMatch(article, tpl)) return article;
    changed = true;
    return {
      ...article,
      title_zh: tpl.title_zh,
      title_en: tpl.title_en,
      content_zh: tpl.content_zh,
      content_en: tpl.content_en,
      sort: tpl.sort,
      published: tpl.published,
    };
  });

  if (!changed) return { snapshot, changed: false };

  return {
    snapshot: {
      ...snapshot,
      articles,
    },
    changed: true,
  };
}
