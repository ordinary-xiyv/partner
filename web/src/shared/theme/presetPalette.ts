import { generate } from '@ant-design/colors';
import type { ThemeModeResolved } from './brandTokens';

/**
 * ============================================================================
 *  预设色板（Tag / Badge / Alert 的 color="blue|orange|..."）
 * ============================================================================
 *
 *  antd 的 13 种预设色不是随便挑的，各自有语义。但它们存在一个系统性问题：
 *  `Tag color="orange"` 用的是 orange-7 当文字、orange-1 当底色，
 *  这个组合在浅色模式下大量达不到 WCAG AA 4.5。
 *
 *  实测（textColor 对 lightColor）：
 *    浅色：yellow 2.05 ✗  lime 2.48 ✗  gold 2.76 ✗  orange 3.34 ✗
 *          green 3.37 ✗   cyan 3.39 ✗  volcano 4.37 ✗
 *    暗色：purple 3.39 ✗  geekblue 4.16 ✗
 *
 *  13 种里有 9 种不达标。项目实际用到了 orange（代理等级）和 purple（折扣），
 *  这两个正好都在问题名单里。
 *
 *  处理方式：不改语义（还是那 13 个颜色键），只在算法层把「文字色」沿明度方向
 *  调到达标，底色保持 antd 原样。这样 Tag 看起来仍是橙色/紫色，只是文字深一档。
 *
 *  为什么不直接在组件里写 style：全项目 Tag 有 20+ 处，逐个改必然漏；
 *  且以后新增 Tag 又会回归。在算法层改，一次性覆盖所有组件（Tag / Badge /
 *  Alert / Progress）。
 */

/** antd 预设色的种子值（与 antd 内部 PresetColors 对应的 seed） */
export const PRESET_COLOR_SEEDS: Record<PresetColorKey, string> = {
  blue: '#1677ff',
  purple: '#722ed1',
  cyan: '#13c2c2',
  green: '#52c41a',
  magenta: '#eb2f96',
  pink: '#eb2f96',
  red: '#f5222d',
  orange: '#fa8c16',
  yellow: '#fadb14',
  volcano: '#fa541c',
  geekblue: '#2f54eb',
  lime: '#a0d911',
  gold: '#faad14',
};

export type PresetColorKey =
  | 'blue'
  | 'purple'
  | 'cyan'
  | 'green'
  | 'magenta'
  | 'pink'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'volcano'
  | 'geekblue'
  | 'lime'
  | 'gold';

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = hexRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(a: string, b: string, t: number): string {
  const A = hexRgb(a);
  const B = hexRgb(b);
  const to = (i: number) => Math.round(A[i] + (B[i] - A[i]) * t);
  return `#${[0, 1, 2].map((i) => to(i).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * 把预设色的「文字阶」调到对「底色阶」达到 AA 4.5。
 * 只动文字，不动底色 —— 底色是 Tag 的视觉主体，改了就不像那个颜色了。
 *
 * @param textColor  原本 antd 取的第 7 阶（浅色）/ 第 7 阶（暗色）
 * @param lightColor Tag 底色，即第 1 阶
 * @param mode       用于决定往哪个方向调（暗底往白、亮底往黑）
 */
export function liftPresetTextColor(
  textColor: string,
  lightColor: string,
  mode: ThemeModeResolved,
): string {
  if (contrast(textColor, lightColor) >= 4.5) return textColor;

  const towards = mode === 'dark' ? '#ffffff' : '#000000';
  // 每步 2.5%，最多 40 步；正常情况下 3~10 步就够了
  for (let i = 1; i <= 40; i += 1) {
    const candidate = mix(textColor, towards, i * 0.025);
    if (contrast(candidate, lightColor) >= 4.5) return candidate;
  }
  return towards;
}

/**
 * 生成一组「纠正过文字对比度」的预设色 token。
 *
 * antd 的 Tag 预设色样式读取的是 `${colorKey}1`（底）/ `3`（描边）/ `6`（深底）/ `7`（文字），
 * 所以我们按同样阶位算出来，只替换 `7`。
 */
export function buildPresetColorTokens(mode: ThemeModeResolved): Record<string, string> {
  const out: Record<string, string> = {};
  (Object.keys(PRESET_COLOR_SEEDS) as PresetColorKey[]).forEach((key) => {
    const palette = generate(PRESET_COLOR_SEEDS[key], {
      theme: mode === 'dark' ? 'dark' : 'default',
    });
    out[`${key}1`] = palette[0];
    out[`${key}2`] = palette[1];
    out[`${key}3`] = palette[2];
    out[`${key}4`] = palette[3];
    out[`${key}5`] = palette[4];
    out[`${key}6`] = palette[5];
    // 第 7 阶是 Tag 正文色，这里做对比度纠正
    out[`${key}7`] = liftPresetTextColor(palette[6], palette[0], mode);
    out[`${key}8`] = palette[7];
    out[`${key}9`] = palette[8];
    out[`${key}10`] = palette[9];
  });
  return out;
}
