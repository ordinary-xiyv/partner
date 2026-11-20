import { theme as antdTheme } from 'antd';
import type { MappingAlgorithm, SeedToken, MapToken } from 'antd/es/theme/interface';
import { deriveBrandPalette, primaryRgba, type ThemeModeResolved } from './brandTokens';
import { buildPresetColorTokens } from './presetPalette';

/**
 * ============================================================================
 *  品牌保真算法
 * ============================================================================
 *
 *  为什么需要这一层：
 *
 *  antd 的 `genColorMapToken` 不直接用你传入的 colorPrimary，而是先
 *  `generate(colorPrimary)` 生成 10 阶调色板，然后取**第 6 阶**当 colorPrimary。
 *  浅色算法下第 6 阶恰好约等于原色，看着没问题；但 `darkAlgorithm` 的
 *  `generate(color, { theme: 'dark' })` 会整体偏移色阶，结果：
 *
 *    经销商配置 #d97706（琥珀）→ 实际渲染 #bb6808
 *    经销商配置 #0d9488（青绿）→ 实际渲染 #0e8177
 *    平台默认   #8b73ff（紫）  → 实际渲染 #7965dc
 *
 *  对白标产品来说这是致命缺陷：经销商在自己后台里挑好的品牌色，
 *  到了暗色模式下变成另一个颜色，「白标」就不成立了。
 *
 *  更糟的是对比度还降了（暗底 #09090b）：
 *    #0d9488 → 5.31 ✓    被改写后 #0e8177 → 4.19 ✗ 跌破 AA
 *    #8b73ff → 5.68 ✓    被改写后 #7965dc → 4.46 ✗ 跌破 AA
 *  也就是说 antd 这个「自动适配」不但丢品牌，还让字更看不清。
 *
 *  解法：包一层算法，先让 antd 正常算（保住它内部的派生关系），
 *  最后把主色系的几个 token 覆写回精确的品牌色。
 *  这样既保留 algorithm 带来的完整兜底（原因见 antdTheme 注释），
 *  又保证品牌色一个字节都不偏。
 */
export function createBrandAlgorithm(
  mode: ThemeModeResolved,
  primaryInput?: string,
): MappingAlgorithm {
  const base = mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm;
  const { primary, hover, active, text } = deriveBrandPalette(mode, primaryInput);

  // 主色系浅底 / 描边仍走品牌色的透明度版本，保证与品牌同色相
  const brandMap: Partial<MapToken> = {
    colorPrimary: primary,
    colorPrimaryHover: hover,
    colorPrimaryActive: active,
    colorPrimaryBg: primaryRgba(primary, mode === 'dark' ? 0.14 : 0.08),
    colorPrimaryBgHover: primaryRgba(primary, mode === 'dark' ? 0.2 : 0.14),
    colorPrimaryBorder: primaryRgba(primary, mode === 'dark' ? 0.4 : 0.28),
    colorPrimaryBorderHover: primaryRgba(primary, mode === 'dark' ? 0.55 : 0.4),
    colorPrimaryText: primary,
    colorPrimaryTextHover: hover,
    colorPrimaryTextActive: active,
    /*
     * 链接色走「已校准明度」的版本，不能用原始品牌色。
     *
     * `type="link"` 的按钮、<a>、文字按钮都在白/黑底上渲染成主色文字，
     * 这时 main 色是**文字色**、不是背景色 —— 原始品牌色在这种场景下常常不够：
     * 实测 #0d9488 青绿在白底只有 3.74、#d97706 琥珀只有 3.19（AA 要 4.5）。
     * palette.text 是沿明度方向最小幅度调到达标的同色相版本
     * （青绿→#0c857a 4.51，琥珀→#b36205 4.50），品牌观感基本不变。
     */
    colorLink: text,
    colorLinkHover: hover,
    colorLinkActive: active,
  };

  // 预设色板：修正 9 种颜色的文字对比度（详见 presetPalette 注释）
  const presetTokens = buildPresetColorTokens(mode) as Partial<MapToken>;

  return (seed: SeedToken, map?: MapToken): MapToken => {
    const computed = base(seed, map);
    return { ...computed, ...presetTokens, ...brandMap } as MapToken;
  };
}
