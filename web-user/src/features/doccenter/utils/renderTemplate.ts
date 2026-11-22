export interface DocTemplateContext {
  baseUrl: string;
  brandName: string;
  docsUrl: string;
}

/**
 * 决定文档正文里 {{baseUrl}} 该替换成什么。
 *
 * 优先级与首页代码示例完全一致（见 pages/home-style/shared/sdkSnippets.ts）：
 * 伙伴配的 api_base_url > VITE_API_URL > 当前域名。
 *
 * 原来这里是「VITE_API_URL > window.location.origin > 硬编码
 * tokens.lynxtoncloud.com」。前两步其实还行，真正的问题是第三步 ——
 * catch 不到 origin 时直接编出主站域名。而且更根本的问题是：
 * 伙伴配的那个地址压根没被读，文档里就一直显示自己的域名或主站域名，
 * 分销商配了网关也白配。
 *
 * 走到最后返回空串：调用方拼出 `/docs` 之类会变成一个相对路径，
 * 至少不会把访客指向别人的站点。
 */
export function resolveDocsBaseUrl(partnerApiBaseUrl?: string): string {
  const fromPartner = (partnerApiBaseUrl || '').trim();
  if (fromPartner) return fromPartner.replace(/\/+$/, '');

  const fromEnv = import.meta.env.VITE_API_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return '';
}

export function applyDocTemplate(content: string, ctx: DocTemplateContext): string {
  return content
    .replace(/\{\{baseUrl\}\}/g, ctx.baseUrl)
    .replace(/\{\{brandName\}\}/g, ctx.brandName)
    .replace(/\{\{docsUrl\}\}/g, ctx.docsUrl);
}

import type { AppLocale } from '../../../i18n/config';
import { pickLocalizedLabel } from '../../../utils/localeLabels';

/**
 * 组装模板变量。
 *
 * 注意 partnerApiBaseUrl 与 partnerBrandName 这两个入参是「伙伴后台配的值」，
 * 由调用方从 usePartnerSiteBrand() 读出来传进来。传空就是没配，走上面的兜底链。
 *
 * brandName 的兜底原来是硬编码 'Lynxton' —— 分销商的文档正文里出现平台主站名，
 * 和白标是冲突的：客户读到「Lynxton 提供……」会以为自己不是在分销商站点上。
 * 现在改成空串，宁可让 {{brandName}} 渲染成空，也不冒充主站。
 * 真正该显示什么，取决于伙伴后台有没有填品牌名，那是配置问题不是代码问题。
 */
export function buildDocTemplateContext(options: {
  lang: AppLocale;
  brandNameZh?: string;
  brandNameEn?: string;
  brandNames?: Partial<Record<AppLocale, string>>;
  /** 伙伴后台「接口基地址」，空/未传表示没配 */
  partnerApiBaseUrl?: string;
  /** 伙伴后台「品牌名」，作为多语种都没配时的兜底 */
  partnerBrandName?: string;
}): DocTemplateContext {
  const baseUrl = resolveDocsBaseUrl(options.partnerApiBaseUrl);
  const brandName = pickLocalizedLabel(
    options.brandNames,
    options.lang,
  ) || pickLocalizedLabel(
    { 'zh-CN': options.brandNameZh, en: options.brandNameEn },
    options.lang,
  ) || (options.partnerBrandName ?? '').trim();
  return {
    baseUrl,
    brandName,
    docsUrl: `${baseUrl}/docs`,
  };
}
