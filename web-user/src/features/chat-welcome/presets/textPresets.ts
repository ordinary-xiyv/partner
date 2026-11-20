import type { TFunction } from 'i18next';
import type { ChatWelcomePaneProps } from '../../../components/chat-welcome';
import { indexMapFromAssetGlob } from '../welcomeAssetGlob';

const TEXT_ICON_MODULES = {
  ...import.meta.glob('../../../assets/chat-prompts/*.{png,jpg,jpeg,webp,svg}', {
    eager: true,
    import: 'default',
  }),
  ...import.meta.glob('../../../assets/chat_prompts/*.{png,jpg,jpeg,webp,svg}', {
    eager: true,
    import: 'default',
  }),
} as Record<string, string>;

const ICON_BY_INDEX = indexMapFromAssetGlob(TEXT_ICON_MODULES);

export function buildTextWelcomePaneProps(
  t: TFunction,
): Omit<ChatWelcomePaneProps, 'onApply' | 'disabled'> {
  const cards = [1, 2, 3, 4, 5].map((i) => ({
    type: 'text' as const,
    id: `text-preset-${i}`,
    title: t(`chat.prompt${i}Title`),
    desc: t(`chat.prompt${i}Desc`),
    iconSrc: ICON_BY_INDEX.get(i) ?? '',
  }));

  return {
    title: t('chat.textWelcomeHeading'),
    columns: 5,
    modifierClass: 'chat-text-welcome--preset-row',
    cards,
  };
}
