import type { DocLang, PublicDocArticle, PublicDocsTree } from '../types/doccenter';

/**
 * 伙伴侧文档接口（按站点隔离）。
 *
 * 为什么单独一个模块、且不走 axios 的 API 实例：
 *
 *   · 这是匿名公网接口，和主站业务接口不是同一个后端（伙伴 backend）。
 *     走 API 实例会带上主站的鉴权头和 baseURL，一旦 VITE_API_URL 指向主站，
 *     请求就会打到主站上拿 404 —— 和 site-brand 踩过的坑完全一样。
 *   · 站点身份（X-Site-ID / X-Site-Host / X-Site-Credential）由 nginx 或
 *     vite 代理注入，前端不该也不能自己拼。用相对路径 + 原生 fetch 最省事，
 *     和 usePartnerSiteBrand 保持同一套约定。
 */

/**
 * 请求结果的三种语义，必须分开：
 *
 *   · 'ok'        —— 接口通了，data 可能是「空站点」（categories 为空）
 *   · 'unbound'   —— 403/404：这个站点没绑伙伴身份，或伙伴后端没这条路由。
 *                     属于「本站没有伙伴文档」，不是错误。
 *   · 'error'     —— 网络错 / 5xx。也是降级处理，但要能和上面区分开，
 *                     方便排查是「没配」还是「挂了」。
 */
export type PartnerDocsOutcome = 'ok' | 'unbound' | 'error';

export interface PartnerDocsResponse<T> {
  outcome: PartnerDocsOutcome;
  data: T | null;
}

/**
 * 语种收敛到伙伴后端认识的两种。
 *
 * 伙伴后端只认 zh / en（见 doc_api.go 的 langParam），其余语种一律按 zh 返回。
 * 这里提前收敛，是为了让「请求参数」和「响应里的 lang」一致 ——
 * 否则前端以为要了 ru、后端回 zh，缓存键和实际内容就对不上了。
 */
export function toPartnerDocLang(lang: DocLang): 'zh' | 'en' {
  return lang === 'en' ? 'en' : 'zh';
}

async function requestJson<T>(path: string, signal?: AbortSignal): Promise<PartnerDocsResponse<T>> {
  try {
    const res = await fetch(path, {
      method: 'GET',
      credentials: 'omit',
      headers: { 'Cache-Control': 'no-cache' },
      signal,
    });
    if (res.status === 403 || res.status === 404) {
      return { outcome: 'unbound', data: null };
    }
    if (!res.ok) {
      return { outcome: 'error', data: null };
    }
    const body = (await res.json()) as { success?: boolean; data?: T };
    if (!body.success || body.data === undefined || body.data === null) {
      return { outcome: 'error', data: null };
    }
    return { outcome: 'ok', data: body.data };
  } catch {
    /*
     * 中断（切页/切语种）也走这里。调用方拿到 'error' 会降级到主站链路，
     * 但那次请求本身已被 abort —— 降级请求会立刻被下一次 effect 覆盖，
     * 不会产生可见的闪动。
     */
    return { outcome: 'error', data: null };
  }
}

export async function getPartnerPublicDocsTree(
  lang: DocLang,
  signal?: AbortSignal,
): Promise<PartnerDocsResponse<PublicDocsTree>> {
  const q = `?lang=${toPartnerDocLang(lang)}`;
  return requestJson<PublicDocsTree>(`/api/partner/public/docs/tree${q}`, signal);
}

export async function getPartnerPublicDocArticle(
  slug: string,
  lang: DocLang,
  signal?: AbortSignal,
): Promise<PartnerDocsResponse<PublicDocArticle>> {
  const q = `?lang=${toPartnerDocLang(lang)}`;
  return requestJson<PublicDocArticle>(
    `/api/partner/public/docs/articles/${encodeURIComponent(slug)}${q}`,
    signal,
  );
}
