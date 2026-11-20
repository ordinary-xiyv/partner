import type {
  DocCategory,
  DocLang,
  DocStoreSnapshot,
  PublicDocsTree,
  PublicDocsTreeArticle,
  PublicDocsTreeCategory,
  PublicDocsTreeNode,
} from '../../../types/doccenter';
import { pickLocalizedField } from './resolveDocLang';

function mapPublicArticle(
  article: {
    slug: string;
    title_zh: string;
    title_en: string;
    title_labels?: Partial<Record<DocLang, string>>;
    summary_zh: string;
    summary_en: string;
    summary_labels?: Partial<Record<DocLang, string>>;
    sort: number;
  },
  lang: DocLang,
): PublicDocsTreeArticle {
  return {
    slug: article.slug,
    title: pickLocalizedField(lang, article.title_labels, article.title_zh, article.title_en),
    summary: pickLocalizedField(lang, article.summary_labels, article.summary_zh, article.summary_en),
    sort: article.sort,
    path: `/docs/${article.slug}`,
  };
}

function buildSortedChildNodes(
  categoryId: number,
  snapshot: DocStoreSnapshot,
  lang: DocLang,
): PublicDocsTreeNode[] {
  const childItems: { sort: number; node: PublicDocsTreeNode }[] = [];

  snapshot.categories
    .filter((item) => item.parent_id === categoryId && item.visible)
    .sort((a, b) => a.sort - b.sort)
    .forEach((subCategory) => {
      const built = buildPublicCategoryBranch(subCategory, snapshot, lang);
      if (built) {
        childItems.push({ sort: subCategory.sort, node: { type: 'category', data: built } });
      }
    });

  snapshot.articles
    .filter((item) => item.category_id === categoryId && item.published)
    .sort((a, b) => a.sort - b.sort)
    .forEach((article) => {
      childItems.push({
        sort: article.sort,
        node: { type: 'article', data: mapPublicArticle(article, lang) },
      });
    });

  childItems.sort((a, b) => a.sort - b.sort);
  return childItems.map((item) => item.node);
}

/** 目录节点：有已发布内容则返回分类节点，否则不展示 */
function buildPublicCategoryBranch(
  category: DocCategory,
  snapshot: DocStoreSnapshot,
  lang: DocLang,
): PublicDocsTreeCategory | null {
  if (!category.visible) return null;

  const childNodes = buildSortedChildNodes(category.id, snapshot, lang);

  if (childNodes.length === 0) return null;

  return {
    id: category.id,
    slug: category.slug,
    kind: category.kind,
    title: pickLocalizedField(lang, category.title_labels, category.title_zh, category.title_en),
    summary: pickLocalizedField(lang, category.summary_labels, category.summary_zh, category.summary_en),
    sort: category.sort,
    nodes: childNodes,
  };
}

/** 规范化后端/API 返回的公开树：剔除空分支（目录保留原样，不再 1:1 折叠） */
function normalizePublicCategoryNodes(
  nodes: PublicDocsTreeNode[] | undefined,
): PublicDocsTreeNode[] | undefined {
  if (!nodes?.length) return undefined;

  const normalized: PublicDocsTreeNode[] = [];

  nodes.forEach((node) => {
    if (node.type === 'article') {
      normalized.push(node);
      return;
    }

    const childNodes = normalizePublicCategoryNodes(node.data.nodes);
    if (!childNodes?.length) return;

    normalized.push({
      type: 'category',
      data: { ...node.data, nodes: childNodes },
    });
  });

  return normalized.length > 0 ? normalized : undefined;
}

/** 规范化后端/API 返回的公开树：剔除空分支（目录保留原样，不再 1:1 折叠） */
export function normalizePublicDocsTree(tree: PublicDocsTree): PublicDocsTree {
  const categories: PublicDocsTreeCategory[] = [];
  const articles: PublicDocsTreeArticle[] = [...(tree.articles ?? [])];

  tree.categories.forEach((category) => {
    const nodes = normalizePublicCategoryNodes(category.nodes);
    if (!nodes?.length) return;

    categories.push({ ...category, nodes });
  });

  return {
    ...tree,
    categories,
    articles: articles.length > 0 ? articles : undefined,
  };
}

export type PublicDocsRootEntry =
  | { kind: 'article'; sort: number; article: PublicDocsTreeArticle }
  | { kind: 'category'; sort: number; category: PublicDocsTreeCategory };

/** 顶级菜单项按 sort 与后台目录顺序一致 */
export function getPublicDocsRootEntries(tree: PublicDocsTree): PublicDocsRootEntry[] {
  const entries: PublicDocsRootEntry[] = [];

  (tree.articles ?? []).forEach((article) => {
    entries.push({ kind: 'article', sort: article.sort, article });
  });

  tree.categories.forEach((category) => {
    if (!category.nodes?.length) return;
    entries.push({ kind: 'category', sort: category.sort, category });
  });

  entries.sort((a, b) => a.sort - b.sort);
  return entries;
}

export function buildPublicDocsTree(snapshot: DocStoreSnapshot, lang: DocLang, baseUrl: string): PublicDocsTree {
  const categories: PublicDocsTreeCategory[] = [];

  snapshot.categories
    .filter((item) => (item.parent_id ?? null) === null && item.visible)
    .sort((a, b) => a.sort - b.sort)
    .forEach((category) => {
      const branch = buildPublicCategoryBranch(category, snapshot, lang);
      if (!branch) return;
      categories.push(branch);
    });

  return normalizePublicDocsTree({
    lang,
    base_url: baseUrl,
    categories,
  });
}

/** DFS article order — matches admin tree / public sidebar */
export function collectPublishedArticlesInDisplayOrder(snapshot: DocStoreSnapshot): typeof snapshot.articles {
  const result: typeof snapshot.articles = [];

  const walkCategory = (categoryId: number) => {
    const category = snapshot.categories.find((item) => item.id === categoryId);
    if (!category?.visible || category.kind !== 'articles') return;

    const childItems: { sort: number; category?: DocCategory; article?: (typeof snapshot.articles)[number] }[] = [];

    snapshot.categories
      .filter((item) => item.parent_id === categoryId && item.visible)
      .forEach((subCategory) => {
        childItems.push({ sort: subCategory.sort, category: subCategory });
      });

    snapshot.articles
      .filter((item) => item.category_id === categoryId && item.published)
      .forEach((article) => {
        childItems.push({ sort: article.sort, article });
      });

    childItems.sort((a, b) => a.sort - b.sort);

    childItems.forEach((item) => {
      if (item.article) result.push(item.article);
      if (item.category) walkCategory(item.category.id);
    });
  };

  snapshot.categories
    .filter((item) => (item.parent_id ?? null) === null && item.visible && item.kind === 'articles')
    .sort((a, b) => a.sort - b.sort)
    .forEach((category) => walkCategory(category.id));

  return result;
}

export function findFirstArticlePath(tree: PublicDocsTree | null): string | null {
  if (!tree) return null;

  for (const entry of getPublicDocsRootEntries(tree)) {
    if (entry.kind === 'article') return entry.article.path;
    const path = walkFirstArticlePath(entry.category.nodes);
    if (path) return path;
  }
  return null;
}

function walkFirstArticlePath(nodes: PublicDocsTreeNode[] | undefined): string | null {
    if (!nodes) return null;
    for (const node of nodes) {
      if (node.type === 'article') return node.data.path;
      const nested = walkFirstArticlePath(node.data.nodes);
      if (nested) return nested;
    }
    return null;
}

/** 在指定分类 slug 下找第一篇已发布文章；找不到返回 null */
function findArticlePathInCategory(tree: PublicDocsTree, categorySlug: string): string | null {
  const findInNodes = (nodes: PublicDocsTreeNode[] | undefined): string | null => {
    if (!nodes) return null;
    for (const node of nodes) {
      if (node.type === 'article') return node.data.path;
      const nested = findInNodes(node.data.nodes);
      if (nested) return nested;
    }
    return null;
  };

  const rootCategory = tree.categories.find((category) => category.slug === categorySlug);
  if (rootCategory) {
    const path = findInNodes(rootCategory.nodes);
    if (path) return path;
  }
  return null;
}

/**
 * /docs/api 的跳转目标：优先落在「API 参考」分类的第一篇已发布文章，
 * 该分类缺失或为空时退回文档树第一篇，兜底 null（由调用方决定去向）。
 * 不写死任何具体 slug，避免文章被删改后跳转到不存在的页面。
 */
export function findApiReferenceEntryPath(tree: PublicDocsTree | null): string | null {
  if (!tree) return null;
  return findArticlePathInCategory(tree, 'api-reference') ?? findFirstArticlePath(tree);
}

function nodeMatchesQuery(node: PublicDocsTreeNode, query: string): boolean {
  if (node.type === 'article') {
    return node.data.title.toLowerCase().includes(query) || node.data.slug.toLowerCase().includes(query);
  }
  if (node.data.title.toLowerCase().includes(query)) return true;
  return (node.data.nodes ?? []).some((child) => nodeMatchesQuery(child, query));
}

function filterNodes(nodes: PublicDocsTreeNode[] | undefined, query: string): PublicDocsTreeNode[] | undefined {
  if (!nodes) return undefined;
  const filtered = nodes
    .map((node) => {
      if (node.type === 'article') {
        return nodeMatchesQuery(node, query) ? node : null;
      }
      const childNodes = filterNodes(node.data.nodes, query);
      const titleMatches = node.data.title.toLowerCase().includes(query);
      if (titleMatches || (childNodes && childNodes.length > 0)) {
        return {
          type: 'category' as const,
          data: {
            ...node.data,
            nodes: titleMatches ? node.data.nodes : childNodes,
          },
        };
      }
      return null;
    })
    .filter((item) => item != null) as PublicDocsTreeNode[];
  return filtered.length > 0 ? filtered : undefined;
}

export function filterPublicDocsTree(tree: PublicDocsTree, query: string): PublicDocsTree | null {
  const q = query.trim().toLowerCase();
  if (!q) return tree;

  const articles = (tree.articles ?? []).filter(
    (article) => article.title.toLowerCase().includes(q) || article.slug.toLowerCase().includes(q),
  );

  const categories = tree.categories
    .map((category) => {
      const nodes = filterNodes(category.nodes, q);
      if (category.title.toLowerCase().includes(q)) {
        return category;
      }
      if (nodes && nodes.length > 0) {
        return { ...category, nodes };
      }
      return null;
    })
    .filter((item): item is PublicDocsTreeCategory => item != null);

  if (articles.length === 0 && categories.length === 0) return null;
  return {
    ...tree,
    articles: articles.length > 0 ? articles : undefined,
    categories,
  };
}
