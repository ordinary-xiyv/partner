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
 * 视频文件不打包进 bundle（5 条共 20MB，走 import 会被 vite 内联进
 * assets 并生成 hash 名，既拖慢首屏也让运维换视频变成重新构建）。
 * 改为按 VIDEO_PRESET_ORDER 的顺序固定生成卡片，
 * src 指向 public/videos/welcome/{id}.mp4。
 *
 * public/ 下的文件 vite 原样拷贝、不改名，所以运维换一条视频只要
 * 覆盖同名文件即可，不需要动代码、不需要重新 build。
 *
 * 封面：这些视频没有配套封面图，靠 ChatWelcomeVideoMedia 在 loadeddata 时
 * seek 到第 0.05 秒那一帧当静态预览。所以 coverSrc 留空是正确的，
 * 不要为了「有封面」去传一个不存在的路径 —— 那会让 poster 属性发出 404。
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
