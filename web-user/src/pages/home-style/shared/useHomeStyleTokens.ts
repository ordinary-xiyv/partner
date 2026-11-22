import { useMemo } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import { BRAND_PRIMARY_HEX } from '../../../theme/brandTokens';
import {
  buildHomeStyleTokens,
  homeStyleTokenVars,
  type HomeSurface,
  type HomeStyleTokens,
} from './tokens';

/**
 * 首页风格令牌的计算入口。
 *
 * 一份数据，三个输入：伙伴主色、风格骨架、当前明暗模式。
 * 三者任一变化都要重算 —— 尤其是模式：同一个主色在亮底和暗底上
 * 需要的派生方向是相反的（见 tokens.ts 的注释），
 * 不重算就会出现「切到暗色后强调词突然看不清」。
 *
 * 主色的来源是 useTheme().primaryColor，那里面已经是「伙伴配了用伙伴的、
 * 没配用平台默认」的最终值（见 contexts/ThemeContext.tsx）。
 * 这里不再自己判断一遍，避免两处逻辑不一致。
 */
export function useHomeStyleTokens(surface: HomeSurface): {
  tokens: HomeStyleTokens;
  cssVars: Record<string, string>;
} {
  const { resolved, primaryColor } = useTheme();

  return useMemo(() => {
    /*
     * primaryColor 为空串表示「还没读到伙伴品牌」。
     * 此时用平台默认色兜底，而不是留空 —— 留空会让 var(--x) 失效，
     * 整片文字变成浏览器默认黑色，比用错颜色更难看。
     *
     * 用 resolved 对应的默认色而不是固定某一个：
     * 平台默认色在明暗两套里本来就不一样（暗色下略提亮）。
     */
    const brandHex = primaryColor?.trim() || BRAND_PRIMARY_HEX[resolved];
    const tokens = buildHomeStyleTokens(brandHex, surface, resolved);
    return { tokens, cssVars: homeStyleTokenVars(tokens, surface) };
  }, [primaryColor, resolved, surface]);
}
