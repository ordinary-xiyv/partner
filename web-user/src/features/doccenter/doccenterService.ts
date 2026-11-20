import axios from 'axios';
import {
  createAdminDocArticle,
  createAdminDocCategory,
  deleteAdminDocArticle,
  deleteAdminDocCategory,
  getAdminDocArticle,
  getAdminDocsTree,
  getPublicDocArticle,
  getPublicDocsTree,
  importAdminDocSeed,
  previewAdminDocArticle,
  reorderAdminDocArticles,
  reorderAdminDocCategories,
  updateAdminDocArticle,
  updateAdminDocCategory,
} from '../../api/doccenter';
import type {
  DocArticle,
  DocArticleInput,
  DocArticlePreviewInput,
  DocArticlePreviewResult,
  DocCategory,
  DocCategoryInput,
  DocLang,
  LynxApiEnvelope,
  PublicDocArticle,
  PublicDocsTree,
} from '../../types/doccenter';
import { toDocCenterError } from './utils/formatDocCenterError';
import { normalizePublicDocsTree } from './utils/publicDocsTree';
import { docCenterMockStore } from './mock/store';

/** 设为 true 时强制使用浏览器 localStorage mock，不走后端 */
const USE_MOCK_ONLY = import.meta.env.VITE_DOC_CENTER_USE_MOCK === 'true';

type ApiResponse<T> = { data?: LynxApiEnvelope<T> };

async function callRemote<T>(call: () => Promise<ApiResponse<T>>): Promise<T> {
  try {
    const res = await call();
    if (res.data?.success && res.data.data !== undefined) {
      return res.data.data;
    }
    throw toDocCenterError(res.data?.message);
  } catch (error) {
    throw toDocCenterError(error);
  }
}

async function callRemoteOrMock<T>(
  call: () => Promise<ApiResponse<T>>,
  fallback: () => T,
): Promise<T> {
  if (USE_MOCK_ONLY) return fallback();
  try {
    return await callRemote(call);
  } catch {
    return fallback();
  }
}

export const docCenterService = {
  async getPublicTree(lang: DocLang): Promise<PublicDocsTree> {
    const tree = await callRemoteOrMock(
      () => getPublicDocsTree(lang),
      () => docCenterMockStore.getPublicTree(lang),
    );
    return normalizePublicDocsTree(tree);
  },

  async getPublicArticle(slug: string, lang: DocLang): Promise<PublicDocArticle | null> {
    if (USE_MOCK_ONLY) {
      return docCenterMockStore.getPublicArticle(slug, lang);
    }
    try {
      const res = await getPublicDocArticle(slug, lang);
      if (res.status === 404 || !res.data?.success) return null;
      return res.data.data ?? null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      return docCenterMockStore.getPublicArticle(slug, lang);
    }
  },

  getAdminTree(): Promise<{ categories: ReturnType<typeof docCenterMockStore.getAdminTree>['categories'] }> {
    if (USE_MOCK_ONLY) {
      return Promise.resolve(docCenterMockStore.getAdminTree());
    }
    return callRemote(() => getAdminDocsTree());
  },

  async getArticle(id: number): Promise<DocArticle | null> {
    if (USE_MOCK_ONLY) {
      return docCenterMockStore.getArticle(id);
    }
    try {
      const res = await getAdminDocArticle(id);
      if (res.data?.success && res.data.data) {
        return res.data.data;
      }
      return null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw toDocCenterError(error);
    }
  },

  createCategory(input: DocCategoryInput, updatedBy: number): Promise<DocCategory> {
    if (USE_MOCK_ONLY) {
      return Promise.resolve(docCenterMockStore.createCategory(input, updatedBy));
    }
    return callRemote(() => createAdminDocCategory(input));
  },

  updateCategory(id: number, input: DocCategoryInput): Promise<DocCategory> {
    if (USE_MOCK_ONLY) {
      return Promise.resolve(docCenterMockStore.updateCategory(id, input));
    }
    return callRemote(() => updateAdminDocCategory(id, input));
  },

  deleteCategory(id: number): Promise<void> {
    if (USE_MOCK_ONLY) {
      docCenterMockStore.deleteCategory(id);
      return Promise.resolve();
    }
    return callRemote(() => deleteAdminDocCategory(id)).then(() => undefined);
  },

  reorderCategories(items: { id: number; sort: number }[]): Promise<{ updated: number }> {
    if (USE_MOCK_ONLY) {
      return Promise.resolve(docCenterMockStore.reorderCategories(items));
    }
    return callRemote(() => reorderAdminDocCategories(items));
  },

  createArticle(input: DocArticleInput, updatedBy: number): Promise<DocArticle> {
    if (USE_MOCK_ONLY) {
      return Promise.resolve(docCenterMockStore.createArticle(input, updatedBy));
    }
    return callRemote(() => createAdminDocArticle(input));
  },

  updateArticle(id: number, input: DocArticleInput, updatedBy: number): Promise<DocArticle> {
    if (USE_MOCK_ONLY) {
      return Promise.resolve(docCenterMockStore.updateArticle(id, input, updatedBy));
    }
    return callRemote(() => updateAdminDocArticle(id, input));
  },

  deleteArticle(id: number): Promise<void> {
    if (USE_MOCK_ONLY) {
      docCenterMockStore.deleteArticle(id);
      return Promise.resolve();
    }
    return callRemote(() => deleteAdminDocArticle(id)).then(() => undefined);
  },

  reorderArticles(categoryId: number, items: { id: number; sort: number }[]): Promise<{ updated: number }> {
    if (USE_MOCK_ONLY) {
      return Promise.resolve(docCenterMockStore.reorderArticles(categoryId, items));
    }
    return callRemote(() => reorderAdminDocArticles(categoryId, items));
  },

  previewArticle(input: DocArticlePreviewInput): Promise<DocArticlePreviewResult> {
    if (USE_MOCK_ONLY) {
      return Promise.resolve(docCenterMockStore.previewArticle(input));
    }
    return callRemote(() => previewAdminDocArticle(input));
  },

  async resetSeed(): Promise<void> {
    if (USE_MOCK_ONLY) {
      docCenterMockStore.resetSeed();
      return;
    }
    await callRemote(() => importAdminDocSeed('overwrite'));
  },
};
