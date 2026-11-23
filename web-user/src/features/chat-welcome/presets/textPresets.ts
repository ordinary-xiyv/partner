import type { TFunction } from 'i18next';
import type { ChatWelcomePaneProps } from '../../../components/chat-welcome';

import PromptIcon1 from '../../../assets/chat-prompts/1.svg?react';
import PromptIcon2 from '../../../assets/chat-prompts/2.svg?react';
import PromptIcon3 from '../../../assets/chat-prompts/3.svg?react';
import PromptIcon4 from '../../../assets/chat-prompts/4.svg?react';
import PromptIcon5 from '../../../assets/chat-prompts/5.svg?react';

/**
 * 文本欢迎卡图标。
 *
 * 原来是 `import.meta.glob('assets/chat-prompts/*.png')` 拉 5 张 112×112
 * 的 3D 玻璃质感位图（合计 80KB）。那两个问题都解决不掉：
 *
 *   1. 配不了品牌色 —— 紫色是渲染进像素的，伙伴把主色改成橙/粉/绿之后
 *      卡片底跟着变了，图标还是紫的。位图对 CSS 变量无能为力。
 *   2. 体积和清晰度 —— 要为每种品牌色重出一套图，且 Retina 屏上 112px 也偏糊。
 *
 * 换成 SVG 组件后 `currentColor` 继承父级 color，配色零成本；
 * 5 个文件合计约 3KB，任意缩放都清晰。
 *
 * 这里用显式 import 而不是 glob：glob 拿不到 `?react` 的组件形态
 * （只能拿到 URL 字符串，`<img src>` 渲染时 currentColor 不生效），
 * 而且 5 个图标本来就是固定顺序，显式列表更直白。
 */
const PROMPT_ICONS = [PromptIcon1, PromptIcon2, PromptIcon3, PromptIcon4, PromptIcon5];

export function buildTextWelcomePaneProps(
  t: TFunction,
): Omit<ChatWelcomePaneProps, 'onApply' | 'disabled'> {
  const cards = PROMPT_ICONS.map((Icon, i) => ({
    type: 'text' as const,
    id: `text-preset-${i + 1}`,
    title: t(`chat.prompt${i + 1}Title`),
    desc: t(`chat.prompt${i + 1}Desc`),
    Icon,
  }));

  return {
    title: t('chat.textWelcomeHeading'),
    columns: 5,
    modifierClass: 'chat-text-welcome--preset-row',
    cards,
  };
}
