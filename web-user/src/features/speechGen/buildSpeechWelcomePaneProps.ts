import type { TFunction } from 'i18next';
import type { ChatWelcomePaneProps, ImageWelcomeCard } from '../../components/chat-welcome/types';
import { indexMapFromAssetGlob } from '../chat-welcome/welcomeAssetGlob';

const WELCOME_IMAGE_MODULES = {
  ...import.meta.glob('../../assets/speech-gen/welcome/*.{png,jpg,jpeg,webp}', {
    eager: true,
    import: 'default',
  }),
} as Record<string, string>;

const IMAGE_BY_INDEX = indexMapFromAssetGlob(WELCOME_IMAGE_MODULES);

const SPEECH_WELCOME_CARD_KEYS = [
  { id: 'speech-welcome-1', index: 1, titleKey: 'speechGen.welcomeCard1Title', promptKey: 'speechGen.welcomeCard1Prompt' },
  { id: 'speech-welcome-2', index: 2, titleKey: 'speechGen.welcomeCard2Title', promptKey: 'speechGen.welcomeCard2Prompt' },
  { id: 'speech-welcome-3', index: 3, titleKey: 'speechGen.welcomeCard3Title', promptKey: 'speechGen.welcomeCard3Prompt' },
  { id: 'speech-welcome-4', index: 4, titleKey: 'speechGen.welcomeCard4Title', promptKey: 'speechGen.welcomeCard4Prompt' },
  { id: 'speech-welcome-5', index: 5, titleKey: 'speechGen.welcomeCard5Title', promptKey: 'speechGen.welcomeCard5Prompt' },
] as const;

/** 欢迎卡片 id → 自动选择的音色 voice id（阿闻 / 凯 / 沧明子 / 芊悦 / 千雪） */
export const SPEECH_WELCOME_CARD_VOICE_MAP: Record<string, string> = {
  'speech-welcome-1': 'neil',
  'speech-welcome-2': 'kai',
  'speech-welcome-3': 'eldric sage',
  'speech-welcome-4': 'cherry',
  'speech-welcome-5': 'chelsie',
};

export function buildSpeechWelcomePaneProps(
  t: TFunction,
): Omit<ChatWelcomePaneProps, 'onApply' | 'disabled'> {
  const cards: ImageWelcomeCard[] = SPEECH_WELCOME_CARD_KEYS.map((item) => {
    const src = IMAGE_BY_INDEX.get(item.index) ?? '';
    const title = t(item.titleKey);
    return {
      type: 'image',
      id: item.id,
      coverSrc: src,
      mediaSrc: src,
      mediaName: `${title}.png`,
      prompt: t(item.promptKey),
      caption: title,
    };
  });

  return {
    title: t('speechGen.welcomeTitle'),
    modifierClass: 'chat-text-welcome--preset-row chat-text-welcome--image-row',
    columns: 5,
    cards,
  };
}
