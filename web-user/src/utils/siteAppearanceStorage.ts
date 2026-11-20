import type { SiteAppearance } from '../types/siteAppearance';

const STORAGE_KEY = 'lynx_site_appearance_v1';

export const SITE_APPEARANCE_CHANGED_EVENT = 'lynx-site-appearance-changed';

export function readStoredSiteAppearance(): SiteAppearance | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SiteAppearance;
  } catch {
    return null;
  }
}

export function writeStoredSiteAppearance(data: SiteAppearance): SiteAppearance {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent(SITE_APPEARANCE_CHANGED_EVENT, { detail: data }));
  return data;
}

export function clearStoredSiteAppearance(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(SITE_APPEARANCE_CHANGED_EVENT));
}
