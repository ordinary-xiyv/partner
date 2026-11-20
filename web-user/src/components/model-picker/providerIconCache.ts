import { fetchCatalogProviders } from '../../api/catalog';
import type { CatalogProviderPublic } from '../../types/catalog';

/**
 * 供应商图标引用前缀。
 * ModelImg 里存 `provider:<provider_key>`，渲染时据此去供应商表取 icon_data_uri。
 * 这样供应商换 logo 时，所有引用它的模型图标会自动跟着变（无需逐个模型重配）。
 */
export const PROVIDER_ICON_PREFIX = 'provider:';

/** 由 provider_key 生成 ModelImg 存储值 */
export function toProviderIconValue(providerKey: string): string {
  return PROVIDER_ICON_PREFIX + providerKey;
}

/** 从 ModelImg 值里取出 provider_key；非供应商引用返回空串 */
export function parseProviderIconKey(value: string | undefined): string {
  const raw = (value || '').trim();
  if (!raw.toLowerCase().startsWith(PROVIDER_ICON_PREFIX)) return '';
  return raw.slice(PROVIDER_ICON_PREFIX.length).trim();
}

let cache: Record<string, string> | null = null;
let rows: CatalogProviderPublic[] = [];
let inflight: Promise<Record<string, string>> | null = null;
const listeners = new Set<(map: Record<string, string>) => void>();

function buildMap(list: CatalogProviderPublic[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of list) {
    const key = (p.provider_key || '').trim();
    if (!key) continue;
    const uri = (p.icon_data_uri || '').trim();
    if (uri) map[key] = uri;
  }
  return map;
}

function notify(map: Record<string, string>) {
  for (const fn of listeners) {
    try {
      fn(map);
    } catch {
      /* 单个订阅者异常不影响其它订阅者 */
    }
  }
}

/** 已加载的图标表；未加载返回 null */
export function getProviderIconMap(): Record<string, string> | null {
  return cache;
}

/** 取单个供应商的图标 data URI；未加载或未配图标返回 undefined */
export function getProviderIcon(providerKey: string): string | undefined {
  const key = (providerKey || '').trim();
  if (!key || !cache) return undefined;
  return cache[key];
}

/** 已加载的供应商列表（含未配图标的，供下拉展示） */
export function getProviderList(): CatalogProviderPublic[] {
  return rows;
}

/**
 * 确保供应商数据已加载。并发调用共享同一个请求。
 * 失败不缓存空结果，允许下次重试。
 */
export function ensureProviderIconsLoaded(): Promise<Record<string, string>> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetchCatalogProviders()
    .then((list) => {
      rows = Array.isArray(list) ? list : [];
      const map = buildMap(rows);
      cache = map;
      notify(map);
      return map;
    })
    .catch(() => {
      // 不缓存失败结果，允许下次重试
      return {} as Record<string, string>;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** 订阅图标表更新，返回取消订阅函数 */
export function subscribeProviderIcons(fn: (map: Record<string, string>) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 供应商数据变更后主动失效（如 admin 上传新 logo 后） */
export function invalidateProviderIcons(): void {
  cache = null;
  rows = [];
  inflight = null;
}
