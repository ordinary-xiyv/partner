/** 三个对话应用路由，选中态需一致 */
export const CHAT_APP_PATHS = ['/chat', '/image-chat', '/video', '/speech'] as const;

export function isChatAppPath(pathname: string): boolean {
  return CHAT_APP_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

export type SelectableVariant = 'nav' | 'nav-sub' | 'header' | 'conv' | 'tab' | 'pill';

const VARIANT_CLASS: Record<SelectableVariant, string> = {
  nav: 'lynx-selectable--nav',
  'nav-sub': 'lynx-selectable--nav-sub',
  header: 'lynx-selectable--header',
  conv: 'lynx-selectable--conv',
  tab: 'lynx-selectable--tab',
  pill: 'lynx-selectable--pill',
};

export function selectableClass(
  isActive: boolean,
  variant: SelectableVariant,
  ...extra: Array<string | false | undefined>
): string {
  return ['lynx-selectable', VARIANT_CLASS[variant], isActive && 'lynx-selectable--active', ...extra]
    .filter(Boolean)
    .join(' ');
}

export function isHeaderNavItemActive(to: string, pathname: string): boolean {
  if (to === '/chat') return isChatAppPath(pathname);
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function isSidebarNavItemActive(key: string, pathname: string): boolean {
  return pathname === key || pathname.startsWith(`${key}/`);
}

/** 文本 / 图像 / 视频会话列表行（三处共用） */
export function convSidebarClass(isActive: boolean): string {
  return selectableClass(isActive, 'conv', 'sidebar-item');
}
