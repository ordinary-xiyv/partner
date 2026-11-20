import { useLayoutEffect, type RefObject } from 'react';

function getIconCenterX(container: HTMLElement, icon: HTMLElement): number {
  const containerRect = container.getBoundingClientRect();
  const iconRect = icon.getBoundingClientRect();
  return iconRect.left + iconRect.width / 2 - containerRect.left;
}

/** 竖线起点：整行菜单项（title）底边下方留出间隔 */
function getTreeLineStartY(container: HTMLElement, rowEl: HTMLElement, yGap: number): number {
  const containerRect = container.getBoundingClientRect();
  const rowRect = rowEl.getBoundingClientRect();
  return rowRect.bottom - containerRect.top + yGap;
}

function findSubMenuIcon(sub: HTMLElement): HTMLElement | null {
  return (
    sub.querySelector<HTMLElement>(':scope > .ant-menu-item .ant-menu-item-icon')
    ?? sub.querySelector<HTMLElement>(':scope > .ant-menu-submenu > .ant-menu-submenu-title .ant-menu-item-icon')
  );
}

function setupSubMenuTreeVars(
  ul: HTMLElement,
  contentGap: number,
  yGap: number,
): void {
  const parentLi = ul.parentElement;
  const parentTitle = parentLi?.querySelector<HTMLElement>(':scope > .ant-menu-submenu-title');
  const parentIcon = parentTitle?.querySelector<HTMLElement>('.ant-menu-item-icon');

  let lineX: number;
  let lineStartY = 0;

  if (parentIcon && parentTitle) {
    lineX = getIconCenterX(ul, parentIcon);
    lineStartY = getTreeLineStartY(ul, parentTitle, yGap);
  } else {
    const icon = findSubMenuIcon(ul);
    const row = icon?.closest<HTMLElement>('.ant-menu-item, .ant-menu-submenu-title');
    if (!icon || !row) return;
    lineX = getIconCenterX(ul, icon);
    lineStartY = getTreeLineStartY(ul, row, yGap);
  }

  const contentInset = lineX + 0.5 + contentGap;

  ul.style.setProperty('--sidebar-tree-line-x', `${lineX}px`);
  ul.style.setProperty('--sidebar-tree-line-y', `${lineStartY}px`);
  ul.style.setProperty('--sidebar-tree-content-inset', `${contentInset}px`);
}

export function updateSidebarTreeLines(menuRoot: HTMLElement | null): void {
  if (!menuRoot) return;

  const styles = getComputedStyle(menuRoot);
  const yGap = parseFloat(styles.getPropertyValue('--sidebar-tree-line-y-gap')) || 8;
  const contentGap = parseFloat(styles.getPropertyValue('--sidebar-tree-content-gap')) || 4;

  menuRoot.querySelectorAll<HTMLElement>('.ant-menu-submenu.ant-menu-submenu-open').forEach((li) => {
    const title = li.querySelector<HTMLElement>(':scope > .ant-menu-submenu-title');
    const icon = title?.querySelector<HTMLElement>('.ant-menu-item-icon');
    if (!title || !icon) return;

    li.style.setProperty('--sidebar-tree-line-x', `${getIconCenterX(li, icon)}px`);
    li.style.setProperty('--sidebar-tree-line-y', `${getTreeLineStartY(li, title, yGap)}px`);
  });

  menuRoot.querySelectorAll<HTMLElement>('.ant-menu-submenu:not(.ant-menu-submenu-open)').forEach((li) => {
    li.style.removeProperty('--sidebar-tree-line-x');
    li.style.removeProperty('--sidebar-tree-line-y');
  });

  menuRoot.querySelectorAll<HTMLElement>('.ant-menu-submenu-open > .ant-menu-sub.ant-menu-inline').forEach((ul) => {
    setupSubMenuTreeVars(ul, contentGap, yGap);
  });
}

export function useSidebarTreeLines(
  menuRef: RefObject<HTMLElement | null>,
  deps: readonly unknown[],
): void {
  useLayoutEffect(() => {
    const wrapper = menuRef.current;
    if (!wrapper) return undefined;

    const getMenuRoot = () => wrapper.querySelector<HTMLElement>('.layout-sidebar-menu--nested');

    updateSidebarTreeLines(getMenuRoot());

    let rafId = 0;
    const scheduleUpdate = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        updateSidebarTreeLines(getMenuRoot());
      });
    };

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(wrapper);
    const menuRoot = getMenuRoot();
    if (menuRoot) {
      resizeObserver.observe(menuRoot);
    }

    const nav = wrapper.closest('.layout-sidebar-nav');
    if (nav instanceof HTMLElement) {
      resizeObserver.observe(nav);
    }

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps drive re-measure on menu state changes
  }, deps);
}
