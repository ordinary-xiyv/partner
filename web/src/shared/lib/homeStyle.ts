/**
 * 首页风格的解析与标签 —— 伙伴后台（web）副本。
 *
 * 与客户站 web-user/src/config/homeStyle.ts 逻辑一致，故意重复而不是抽公共包：
 * 两个前端是独立构建产物，没有共享依赖。为一个字符串常量建包，
 * 会让两边都被迫跟着对方的构建配置走。
 *
 * 两边的约定必须一致：未知值 → editorial。否则会出现
 * 「后台显示 A、客户站渲染 B」这种极难发现的错位。
 */

export const HOME_STYLE_EDITORIAL = 'editorial';
export const HOME_STYLE_TERMINAL = 'terminal';

export type HomeStyle = typeof HOME_STYLE_EDITORIAL | typeof HOME_STYLE_TERMINAL;

export const DEFAULT_HOME_STYLE: HomeStyle = HOME_STYLE_EDITORIAL;

/**
 * 把任意输入归一到合法风格。
 *
 * 注意 'brutal' 会落到 editorial：这是早期版本的取值，已无对应实现。
 * 不归一的话，历史商户在后台会看到一个「都选中」的怪状态。
 */
export function parseHomeStyle(raw: unknown): HomeStyle {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === HOME_STYLE_TERMINAL) return HOME_STYLE_TERMINAL;
  return DEFAULT_HOME_STYLE;
}
