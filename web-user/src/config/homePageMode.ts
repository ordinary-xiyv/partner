/** 复用 option HomePageContent + GET /api/home_page_content，仅存首页风格标记 */
export const HOME_PAGE_CONTENT_OPTION_KEY = 'HomePageContent';

export const HOME_PAGE_MODE_DEFAULT = 'default';
export const HOME_PAGE_MODE_ALT = 'alt';

export type HomePageMode = typeof HOME_PAGE_MODE_DEFAULT | typeof HOME_PAGE_MODE_ALT;

export function parseHomePageMode(value: unknown): HomePageMode {
  return typeof value === 'string' && value.trim() === HOME_PAGE_MODE_ALT
    ? HOME_PAGE_MODE_ALT
    : HOME_PAGE_MODE_DEFAULT;
}
