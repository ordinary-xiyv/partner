import {
  DEFAULT_SITE_BRAND_EN,
  DEFAULT_SITE_BRAND_ZH,
  resolveSiteBrandEn,
  resolveSiteBrandZh,
} from '../config/siteBrand';

const STORAGE_KEY = 'lynx_site_brand_v1';

export interface StoredSiteBrand {
  brand_name_zh: string;
  brand_name_en: string;
}

export function readStoredSiteBrand(): StoredSiteBrand {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        brand_name_zh: DEFAULT_SITE_BRAND_ZH,
        brand_name_en: DEFAULT_SITE_BRAND_EN,
      };
    }
    const parsed = JSON.parse(raw) as Partial<StoredSiteBrand>;
    return {
      brand_name_zh: resolveSiteBrandZh(parsed.brand_name_zh),
      brand_name_en: resolveSiteBrandEn(parsed.brand_name_en),
    };
  } catch {
    return {
      brand_name_zh: DEFAULT_SITE_BRAND_ZH,
      brand_name_en: DEFAULT_SITE_BRAND_EN,
    };
  }
}

export function writeStoredSiteBrand(input: StoredSiteBrand): StoredSiteBrand {
  const next: StoredSiteBrand = {
    brand_name_zh: input.brand_name_zh.trim(),
    brand_name_en: input.brand_name_en.trim(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('lynx-site-brand-changed', { detail: next }));
  return next;
}

export const SITE_BRAND_CHANGED_EVENT = 'lynx-site-brand-changed';
