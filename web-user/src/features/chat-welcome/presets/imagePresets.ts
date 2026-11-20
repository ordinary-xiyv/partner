import type { TFunction } from 'i18next';
import i18n from '../../../i18n';
import type { ChatWelcomePaneProps, ImageWelcomeCard } from '../../../components/chat-welcome';
import { idMapFromAssetGlob } from '../welcomeAssetGlob';
import {
  IMAGE_PRESET_ORDER,
  IMAGE_PRESET_PROMPTS,
  resolveWelcomePresetPrompt,
  welcomePresetFallbackPrompt,
} from '../content';

const IMAGE_ASSETS = import.meta.glob('../../../assets/welcome-presets/image/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const IMAGE_BY_ID = idMapFromAssetGlob(IMAGE_ASSETS);

function buildImageCards(): ImageWelcomeCard[] {
  const language = i18n.language;
  const cards: ImageWelcomeCard[] = [];
  const orderedIds = [
    ...IMAGE_PRESET_ORDER.filter((id) => IMAGE_BY_ID.has(id)),
    ...Array.from(IMAGE_BY_ID.keys()).filter(
      (id) => !IMAGE_PRESET_ORDER.includes(id as (typeof IMAGE_PRESET_ORDER)[number]),
    ),
  ];
  for (const id of orderedIds) {
    const src = IMAGE_BY_ID.get(id);
    if (!src) continue;
    const prompt =
      resolveWelcomePresetPrompt(IMAGE_PRESET_PROMPTS[id], language)
      ?? welcomePresetFallbackPrompt('image', id, language);
    cards.push({
      type: 'image',
      id: `image-${id}`,
      coverSrc: src,
      mediaSrc: src,
      mediaName: `${id}.png`,
      prompt,
    });
  }
  return cards;
}

export function buildImageWelcomePaneProps(t: TFunction): Omit<ChatWelcomePaneProps, 'onApply'> {
  return {
    title: t('chat.imageWelcomeHeading'),
    columns: 5,
    modifierClass: 'chat-text-welcome--preset-row',
    cards: buildImageCards(),
  };
}
