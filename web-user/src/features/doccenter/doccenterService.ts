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
import {
  getPartnerPublicDocArticle,
  getPartnerPublicDocsTree,
} from '../../api/partnerDocs';
import { buildDocTemplateContext, applyDocTemplate } from './utils/renderTemplate';

/** 设为 true 时强制使用浏览器 localStorage mock，不走后端 */
const USE_MOCK_ONLY = import.meta.env.VITE_DOC_CENTER_USE_MOCK === 'true';

type ApiResponse<T> = { data?: LynxApiEnvelope<T> };

/*
伙伴侧下发的「接口基地址」+「品牌名」，由 StatusContext 读到站点品牌后注入。

为什么用模块级变量而不是把 brand 一路透传进 docCenterService：
这个 service 被 6 个页面/hook 调用，全是 init 时一次性拉数据。为了一个
base_url 把 partner 品牌塞进每一个签名，会让「文档服务」和「白标」耦合到
所有调用点上。而这两个数据的生命周期又很接近（都是站点级、页面加载时定）。
所以这里开一个极窄的注入口：谁拿到品牌谁调 setDocBrandOverride，
service 内部在返回前统一套用。

覆盖范围：
  · base_url   —— 文档正文里 {{baseUrl}} 的替换结果
  · brand_name —— {{brandName}} 的替换结果
标题、正文、目录一律不碰 —— 那些是文档内容，属于站点自己的数据。
*/
let baseUrlOverride = '';
let brandNameOverride = '';

/**
 * 设置文档模板覆盖值。传空串表示不覆盖（走后端/环境默认）。
 *
 * 幂等，可以每次渲染都调；只有值变了才真正写入。
 */
export function setDocBaseUrlOverride(partnerApiBaseUrl: string | undefined): void {
  baseUrlOverride = (partnerApiBaseUrl || '').trim().replace(/\/+$/, '');
}

/**
 * 设置品牌名覆盖值（{{brandName}}）。
 *
 * 为什么需要：主站后端渲染文档时会把 {{brandName}} 替换成主站品牌，
 * 分销商的客户读到「某某平台提供」会以为自己不在分销商站点上。
 * 伙伴文档是伙伴后端返回的原始 Markdown（不做服务端替换），
 * 由客户站用伙伴品牌名在前端补这一步。
 */
export function setDocBrandNameOverride(partnerBrandName: string | undefined): void {
  brandNameOverride = (partnerBrandName || '').trim();
}

/** 把覆盖值套到文档树上。没有覆盖值就原样返回，不动后端的 base_url。 */
function applyBaseUrlOverride<T extends { base_url: string }>(tree: T): T {
  if (!baseUrlOverride) return tree;
  return { ...tree, base_url: baseUrlOverride };
}

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

/**
 * 文档树读取顺序的实现（见 docCenterService.getPublicTree 的注释）。
 *
 * 抽成独立函数，是因为「伙伴接口通了但树为空」这个判断不好塞进
 * callRemoteOrMock 的二元语义里 —— 它只有「成功/失败」，没有「空」。
 */
async function fetchPartnerTreeOrFallback(lang: DocLang): Promise<PublicDocsTree> {
  if (!USE_MOCK_ONLY) {
    const partner = await getPartnerPublicDocsTree(lang);
    /*
     * 只要伙伴接口通了、且这个站点确实有文档，就用伙伴的。
     *
     * hasPartyDocs 的判断标准是「根部分类或顶级文章有任何一条」——
     * 不能用 categories.length 单独判，因为顶级独立文章走 articles 字段
     * （见 buildPublicTree 的注释：category_id 必填，所以 articles 通常是
     * undefined，但保留这个判断以免将来后端支持无分类文章时这里漏掉）。
     *
     * 注意这里**不**用 normalizePublicDocsTree 的结果判断空：
     * 规范化的职责是剔除空分支，如果伙伴后端给了一堆空分类，
     * 规范化后变空 —— 那确实应该回落，所以用规范化后的结果判空是对的。
     * 但规范化本身有开销，先粗判再规范化，省掉大多数情况下的多余计算。
     */
    if (partner.outcome === 'ok' && partner.data && hasAnyDocContent(partner.data)) {
      return partner.data;
    }
    /*
     * outcome === 'unbound' / 'error' / 空树 → 继续往下回落主站。
     * 空树也回落这个决定见 getPublicTree 的注释：新商户还没写文档时，
     * 给他看平台默认文档比看空白页有用。
     */
  }

  return callRemoteOrMock(
    () => getPublicDocsTree(lang),
    () => docCenterMockStore.getPublicTree(lang),
  );
}

function hasAnyDocContent(tree: PublicDocsTree): boolean {
  return (tree.categories?.length ?? 0) > 0 || (tree.articles?.length ?? 0) > 0;
}

/**
 * 把伙伴品牌套进文章正文/标题里的 {{baseUrl}} / {{brandName}} / {{docsUrl}}。
 *
 * 为什么前端做而不是后端做：
 * 伙伴后端存的是原始 Markdown，不掺任何站点信息 —— 同一篇文章如果哪天
 * 要导出/迁移，带着渲染结果的正文是没法用的。而 baseUrl 和品牌名取决于
 * 「访客从哪个域名进来」，本质上是展示层的事，就该在展示层拼。
 *
 * 和主站链路的差异要记住：主站后端**已经**把模板替换过了（返回的 content
 * 里没有 {{...}}），再套一遍是空操作，不会重复替换。所以这个函数对两条
 * 链路都安全，统一在出口处调用即可。
 */
function applyArticleTemplate(article: PublicDocArticle): PublicDocArticle {
  if (!article.content || !article.content.includes('{{')) return article;

  const ctx = buildDocTemplateContext({
    lang: article.lang,
    partnerApiBaseUrl: baseUrlOverride || undefined,
    partnerBrandName: brandNameOverride || undefined,
  });
  return { ...article, content: applyDocTemplate(article.content, ctx) };
}

export const docCenterService = {
  /**
   * 读公开文档树。
   *
   * 读取顺序（重要，改之前先看这段）：
   *
   *   1. 伙伴后端 /api/partner/public/docs/tree —— 按站点身份返回**这个商户
   *      自己写的**文档。这是目标形态：伙伴用户在伙伴平台写了文档，他的域名
   *      就显示他的文档，与主站和其他分销商互不影响。
   *   2. 主站 /api/lynx/docs/tree —— 伙伴没写过文档、或伙伴后端不可用时回落。
   *      保住「老站点什么都不配也能看到平台默认真实文档」这个既有效果。
   *   3. 本地 mock —— 后端整个不可用时的最后兜底，页面不至于白屏。
   *
   * 关键判据是「伙伴接口通了且树非空」才用伙伴的。不能只看 HTTP 200：
   * 伙伴后端对未配置文档的站点会正大光明地返回空树（categories: []），
   * 那是「这个商户还没写」，不是「这个商户写了空文档」—— 这种情况下
   * 应该继续走主站的默认文档，否则新商户的客户会看到一个空白的文档中心，
   * 以为产品坏了。
   */
  async getPublicTree(lang: DocLang): Promise<PublicDocsTree> {
    const tree = await fetchPartnerTreeOrFallback(lang);
    /*
     * 先套 base_url 覆盖，再规范化。
     *
     * 顺序不能反：normalizePublicDocsTree 会把树里为空的分类剔掉，
     * 但它对 base_url 是原样透传（用的是 { ...tree }），所以先后其实
     * 都不影响字段值。放在规范化之前是为了让「最终产物」只有一个出口，
     * 以后谁再加规范化逻辑也不必惦记 base_url 这回事。
     */
    return normalizePublicDocsTree(applyBaseUrlOverride(tree));
  },

  /**
   * 读单篇文章。
   *
   * 与 getPublicTree 同一套顺序，但多一个细节：如果伙伴接口明确回了 404
   * （这篇 slug 在伙伴库里不存在），**不能**接着去主站找 —— 那会把主站
   * 里同名 slug 的文章端出来，等于让分销商的客户看到别家的内容。
   * 只有「伙伴接口整体不可用 / 未绑定」才回落主站。
   */
  async getPublicArticle(slug: string, lang: DocLang): Promise<PublicDocArticle | null> {
    if (USE_MOCK_ONLY) {
      return docCenterMockStore.getPublicArticle(slug, lang);
    }

    const partner = await getPartnerPublicDocArticle(slug, lang);
    if (partner.outcome === 'ok' && partner.data) {
      return applyArticleTemplate(partner.data);
    }
    if (partner.outcome === 'unbound') {
      /*
       * 403/404 有歧义：可能是「站点没绑身份」，也可能是「绑了但没这篇文章」。
       * 这两种在 HTTP 层都是 404，分不开。保守起见按「没这篇文章」处理 ——
       * 返回 null 让页面显示「文章不存在」，不要去主站捞同名文章。
       *
       * 代价：真没绑身份的站点，文档页会显示空而不是主站默认文档。
       * 但那种站点的文档中心本来就该是空的（它没有伙伴配置），
       * 显示主站默认文档反而是更严重的错误 —— 会让访客看到别家品牌的文档。
       */
      return null;
    }

    try {
      const res = await getPublicDocArticle(slug, lang);
      if (res.status === 404 || !res.data?.success) return null;
      const data = res.data.data ?? null;
      return data ? applyArticleTemplate(data) : null;
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
