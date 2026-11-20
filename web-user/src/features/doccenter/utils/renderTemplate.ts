export interface DocTemplateContext {
  baseUrl: string;
  brandName: string;
  docsUrl: string;
}

export function resolveDocsBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    return window.location.origin.replace(/\/$/, '');
  }
  return 'https://tokens.lynxtoncloud.com';
}

export function applyDocTemplate(content: string, ctx: DocTemplateContext): string {
  return content
    .replace(/\{\{baseUrl\}\}/g, ctx.baseUrl)
    .replace(/\{\{brandName\}\}/g, ctx.brandName)
    .replace(/\{\{docsUrl\}\}/g, ctx.docsUrl);
}

import type { AppLocale } from '../../../i18n/config';
import { pickLocalizedLabel } from '../../../utils/localeLabels';

export function buildDocTemplateContext(options: {
  lang: AppLocale;
  brandNameZh?: string;
  brandNameEn?: string;
  brandNames?: Partial<Record<AppLocale, string>>;
}): DocTemplateContext {
  const baseUrl = resolveDocsBaseUrl();
  const brandName = pickLocalizedLabel(
    options.brandNames,
    options.lang,
  ) || pickLocalizedLabel(
    { 'zh-CN': options.brandNameZh, en: options.brandNameEn },
    options.lang,
  ) || 'Lynxton';
  return {
    baseUrl,
    brandName,
    docsUrl: `${baseUrl}/docs`,
  };
}
