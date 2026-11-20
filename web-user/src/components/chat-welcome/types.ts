/** 对话欢迎区：标题 + 预设卡片（text / image / video） */

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
  iconSrc: string;
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
