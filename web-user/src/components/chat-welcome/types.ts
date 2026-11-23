/** 对话欢迎区：标题 + 预设卡片（text / image / video） */

import type { ComponentType, SVGProps } from 'react';

export interface WelcomeMediaRef {
  src: string;
  name: string;
  kind: 'image' | 'video';
}

export interface TextWelcomeCard {
  type: 'text';
  id: string;
  title: string;
  desc: string;
  /**
   * 图标组件（`import Icon from './x.svg?react'`）。
   *
   * 原来是 `iconSrc: string` 指向 112×112 的 3D 玻璃质感 PNG ——
   * 紫色被渲染进像素里，伙伴换品牌主色后卡片底变了、图标还是紫的，
   * 位图没有任何办法跟随 CSS 变量。
   *
   * 改成 SVG 组件后 `currentColor` 能被父级 `color` 继承，
   * 品牌色一变图标跟着变，顺带把 80KB 降到 3KB。
   *
   * 注意必须用 `?react` 导入成组件而不是 `<img src>`：
   * `<img>` 里的 SVG 是独立文档，不继承外部 color，换了也白换。
   */
  Icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** 写入输入框；缺省为 `${title} — ${desc}` */
  prompt?: string;
}

export interface ImageWelcomeCard {
  type: 'image';
  id: string;
  coverSrc: string;
  mediaSrc: string;
  mediaName?: string;
  prompt: string;
  caption?: string;
}

export interface VideoWelcomeCard {
  type: 'video';
  id: string;
  coverSrc: string;
  mediaSrc: string;
  mediaName?: string;
  prompt: string;
  caption?: string;
  referenceImages?: Array<{ src: string; name?: string }>;
}

export type ChatWelcomeCard = TextWelcomeCard | ImageWelcomeCard | VideoWelcomeCard;

export type WelcomeApplyPayload =
  | { kind: 'text'; prompt: string; cardId?: string }
  | { kind: 'image'; prompt: string; images: WelcomeMediaRef[]; cardId?: string }
  | {
      kind: 'video';
      prompt: string;
      videos: WelcomeMediaRef[];
      images?: WelcomeMediaRef[];
      cardId?: string;
    };

export interface ChatWelcomePaneProps {
  title?: string;
  ariaLabel?: string;
  modifierClass?: string;
  /** 网格列数；未传时 text=5、含 media 卡=3 */
  columns?: number;
  cards: ChatWelcomeCard[];
  disabled?: boolean;
  onApply: (payload: WelcomeApplyPayload) => void;
}
