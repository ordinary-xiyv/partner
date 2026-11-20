import type { TFunction } from 'i18next';
import i18n from '../../../i18n';
import type { ChatWelcomePaneProps, VideoWelcomeCard } from '../../../components/chat-welcome';
import {
  VIDEO_PRESET_ORDER,
  VIDEO_PRESET_PROMPTS,
  resolveWelcomePresetPrompt,
  welcomePresetFallbackPrompt,
} from '../content';

/**
 * 视频欢迎卡。
 *
 * 视频文件不再打包进仓库（原厂那几条 mp4 体积太大且与业务无关），
 * 改为按 VIDEO_PRESET_ORDER 的顺序固定生成卡片，src 指向 public/videos/welcome/{id}.mp4。
 * 把同名 mp4 放进 web/public/videos/welcome/ 即可生效；文件缺失时卡片仍在，
 * 只是封面/预览为空白，不会报错。
 */
const VIDEO_PRESET_BASE = '/videos/welcome';

function buildVideoCards(): VideoWelcomeCard[] {
  const language = i18n.language;
  const cards: VideoWelcomeCard[] = [];

  for (const id of VIDEO_PRESET_ORDER) {
    const prompt =
      resolveWelcomePresetPrompt(VIDEO_PRESET_PROMPTS[id], language)
      ?? welcomePresetFallbackPrompt('video', id, language);
    cards.push({
      type: 'video',
      id: `video-${id}`,
      coverSrc: '',
      mediaSrc: `${VIDEO_PRESET_BASE}/${id}.mp4`,
      mediaName: `${id}.mp4`,
      prompt,
    });
  }
  return cards;
}

export function buildVideoWelcomePaneProps(t: TFunction): Omit<ChatWelcomePaneProps, 'onApply'> {
  return {
    title: t('chat.videoWelcomeHeading'),
    modifierClass: 'chat-text-welcome--preset-row chat-text-welcome--video-gen',
    columns: 5,
    cards: buildVideoCards(),
  };
}
