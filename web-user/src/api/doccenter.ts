import API from './index';
import type {
  AdminDocsTreeCategory,
  DocArticle,
  DocArticleInput,
  DocArticlePreviewInput,
  DocArticlePreviewResult,
  DocCategory,
  DocCategoryInput,
  LynxApiEnvelope,
} from '../types/doccenter';

export const getAdminDocsTree = () =>
  API.get<LynxApiEnvelope<{ categories: AdminDocsTreeCategory[] }>>('/api/lynx/admin/docs/tree');

export const getAdminDocCategory = (id: number) =>
  API.get<LynxApiEnvelope<DocCategory>>(`/api/lynx/admin/docs/categories/${id}`);

export const createAdminDocCategory = (data: DocCategoryInput) =>
  API.post<LynxApiEnvelope<DocCategory>>('/api/lynx/admin/docs/categories', data);

export const updateAdminDocCategory = (id: number, data: DocCategoryInput) =>
  API.put<LynxApiEnvelope<DocCategory>>(`/api/lynx/admin/docs/categories/${id}`, data);

export const deleteAdminDocCategory = (id: number) =>
  API.delete<LynxApiEnvelope<{ deleted: boolean }>>(`/api/lynx/admin/docs/categories/${id}`);

export const reorderAdminDocCategories = (items: { id: number; sort: number }[]) =>
  API.put<LynxApiEnvelope<{ updated: number }>>('/api/lynx/admin/docs/categories/reorder', { items });

export const getAdminDocArticle = (id: number) =>
  API.get<LynxApiEnvelope<DocArticle>>(`/api/lynx/admin/docs/articles/${id}`);

export const createAdminDocArticle = (data: DocArticleInput) =>
  API.post<LynxApiEnvelope<DocArticle>>('/api/lynx/admin/docs/articles', data);

export const updateAdminDocArticle = (id: number, data: DocArticleInput) =>
  API.put<LynxApiEnvelope<DocArticle>>(`/api/lynx/admin/docs/articles/${id}`, data);

export const deleteAdminDocArticle = (id: number) =>
  API.delete<LynxApiEnvelope<{ deleted: boolean }>>(`/api/lynx/admin/docs/articles/${id}`);

export const reorderAdminDocArticles = (categoryId: number, items: { id: number; sort: number }[]) =>
  API.put<LynxApiEnvelope<{ updated: number }>>('/api/lynx/admin/docs/articles/reorder', {
    category_id: categoryId,
    items,
  });

export const previewAdminDocArticle = (data: DocArticlePreviewInput) =>
  API.post<LynxApiEnvelope<DocArticlePreviewResult>>('/api/lynx/admin/docs/articles/preview', data);

export const importAdminDocSeed = (mode: 'skip' | 'overwrite' = 'skip') =>
  API.post<LynxApiEnvelope<Record<string, number | boolean>>>(
    '/api/lynx/admin/docs/import/seed',
    {},
    { params: { mode } },
  );
