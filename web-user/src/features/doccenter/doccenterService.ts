import axios from 'axios';
import {
  createAdminDocArticle,
  createAdminDocCategory,
  deleteAdminDocArticle,
  deleteAdminDocCategory,
  getAdminDocArticle,
  getAdminDocsTree,
  previewAdminDocArticle,
  reorderAdminDocArticles,
  reorderAdminDocCategories,
  updateAdminDocArticle,
  updateAdminDocCategory,
} from '../../api/doccenter';
import type {
  AdminDocsTreeCategory,
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
import {
  getPartnerPublicDocArticle,
  getPartnerPublicDocsTree,
} from '../../api/partnerDocs';
import { buildDocTemplateContext, applyDocTemplate } from './utils/renderTemplate';

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
 * 为什么需要：伙伴后端渲染文档时不做任何服务端替换，正文里的
 * {{brandName}} 会原样落给访客。分销商的客户读到「某某平台提供」
 * 会以为自己不在分销商站点上。所以由客户站用伙伴品牌名在前端补这一步。
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

/**
 * 文档树读取的实现（见 docCenterService.getPublicTree 的注释）。
 *
 * 抽成独立函数，是因为「伙伴接口通了但树为空」这个判断不好塞进
 * callRemote 的二元语义里 —— 它只有「成功/失败」，没有「空」。
 */
async function fetchPartnerTreeOrFallback(lang: DocLang): Promise<PublicDocsTree> {
  const partner = await getPartnerPublicDocsTree(lang);
  /*
   * 只要伙伴接口通了、且这个站点确实有文档，就用伙伴的。
   *
   * hasAnyDocContent 的判断标准是「根部分类或顶级文章有任何一条」——
   * 不能用 categories.length 单独判，因为顶级独立文章走 articles 字段
   * （见 buildPublicTree 的注释：category_id 必填，所以 articles 通常是
   * undefined，但保留这个判断以免将来后端支持无分类文章时这里漏掉）。
   *
   * 注意这里**不**用 normalizePublicDocsTree 的结果判断空：
   * 规范化的职责是剔除空分支。规范化后变空 —— 那确实应该算空态，所以
   * 最终判空交给规范化之后的长度判断（见 getPublicTree）。
   */
  if (partner.outcome === 'ok' && partner.data && hasAnyDocContent(partner.data)) {
    return partner.data;
  }

  /*
   * ★ 到此结束：返回空树，**不再往主站找**（2026-11-24 起，不分站点性质）。
   *
   * 这是「我的文档页为什么依赖主站」这个问题的答案 —— 它本来就不该依赖。
   * 主站后端（3002）和伙伴后端（3004）是两个独立服务，主站挂掉时
   * 文档页不能跟着打不开（实测过：主站 3002 没起时整页 500）。
   *
   * 原来这里还有一层「主站也没成功 → 用浏览器本地 mock 种子」，那是个假兜底：
   * 目录是前端编的，正文走另一条链、根本不会去 mock 取，结果就是
   * 「左边有目录、右边写着文档不存在」。mock 已彻底删除。
   *
   * 代价（明确的取舍）：还没导入文档的站点会看到「暂无文档」，
   * 而不是借用主站内容装成有文档。这是有意的 —— 假内容比空态更糟，
   * 因为用户会以为自己的文档丢了。
   */
  return {
    lang,
    base_url: '',
    categories: [],
  } as PublicDocsTree;
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
 * 现在只有伙伴一条链路了（主站回落已移除），所以这个函数是文章出口的
 * 唯一一处模板替换点。
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
   *   2. 站点没有文档 → 空态。**不再回落主站**（2026-11-24 起）。
   *   3. （没有 mock 了，见 fetchPartnerTreeOrFallback 的注释）
   *
   * 关键判据是「伙伴接口通了且树非空」才用伙伴的。不能只看 HTTP 200：
   * 伙伴后端对未配置文档的站点会正大光明地返回空树（categories: []），
   * 那是「这个商户还没写」，不是「这个商户写了空文档」。
   *
   * ★ 为什么不回落主站（不分经销商还是自营）：
   *   主站后端（3002）和伙伴后端（3004）是两个独立服务。文档页一旦回落主站，
   *   主站挂掉时这里也会跟着 500（实测过）。文档是站点自己的内容，不是平台
   *   的附属品 —— 没写就显示空态，让用户知道要去伙伴后台导入/编写，
   *   而不是拿主站内容充数。
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
   * ★ 只认伙伴库。伙伴接口返回什么就是什么：
   *   · ok + data   → 用伙伴的文章
   *   · 404 / 5xx   → 没有就是没有，返回 null（页面显示「文章不存在」）
   *
   * **不去主站**（2026-11-24 起，不分站点性质）。理由和 getPublicTree 一致：
   * 文档页不能依赖主站后端；而且主站文章讲的是平台方的接口地址和品牌，
   * 端给分销商的客户就是串了品牌，这个错误比「文档打不开」更严重。
   *
   * ★ 这条链必须和 getPublicTree 完全同源。历史上两边各自降级过一次，
   *   结果就是「左边有目录、右边写文档不存在」的矛盾页面。
   */
  async getPublicArticle(slug: string, lang: DocLang): Promise<PublicDocArticle | null> {
    const partner = await getPartnerPublicDocArticle(slug, lang);
    if (partner.outcome === 'ok' && partner.data) {
      return applyArticleTemplate(partner.data);
    }
    return null;
  },

  /*
   * ------------------------------------------------------------------
   * 管理侧方法。
   *
   * ★ 客户站不提供文档编辑能力 —— 那是伙伴后台（web/ 的「文档设置」页）的职责。
   *   这几个方法留在这里只为一个用途：让 useDocCenter 之类的旧调用方
   *   在类型上还能编译通过。实际调用点经逐一核对是 0 个。
   *
   * 原来每个方法都带一条 `if (USE_MOCK_ONLY) return docCenterMockStore.xxx()`，
   * 那是把 mock 当成编辑后端。mock 已经从客户站移除（它只该是种子来源，
   * 而种子现在在后端），这里同步去掉那些分支，别再让人以为「本地能编辑文档」。
   * ------------------------------------------------------------------
   */
  getAdminTree(): Promise<{ categories: AdminDocsTreeCategory[] }> {
    return callRemote(() => getAdminDocsTree()).then((res) => ({
      categories: res.categories ?? [],
    }));
  },

  async getArticle(id: number): Promise<DocArticle | null> {
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

  createCategory(input: DocCategoryInput): Promise<DocCategory> {
    return callRemote(() => createAdminDocCategory(input));
  },

  updateCategory(id: number, input: DocCategoryInput): Promise<DocCategory> {
    return callRemote(() => updateAdminDocCategory(id, input));
  },

  deleteCategory(id: number): Promise<void> {
    return callRemote(() => deleteAdminDocCategory(id)).then(() => undefined);
  },

  reorderCategories(items: { id: number; sort: number }[]): Promise<{ updated: number }> {
    return callRemote(() => reorderAdminDocCategories(items));
  },

  createArticle(input: DocArticleInput): Promise<DocArticle> {
    return callRemote(() => createAdminDocArticle(input));
  },

  updateArticle(id: number, input: DocArticleInput): Promise<DocArticle> {
    return callRemote(() => updateAdminDocArticle(id, input));
  },

  deleteArticle(id: number): Promise<void> {
    return callRemote(() => deleteAdminDocArticle(id)).then(() => undefined);
  },

  reorderArticles(categoryId: number, items: { id: number; sort: number }[]): Promise<{ updated: number }> {
    return callRemote(() => reorderAdminDocArticles(categoryId, items));
  },

  previewArticle(input: DocArticlePreviewInput): Promise<DocArticlePreviewResult> {
    return callRemote(() => previewAdminDocArticle(input));
  },
};
