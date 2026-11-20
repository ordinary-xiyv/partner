import type { WelcomePresetCopy } from './types';
import { isChineseLocale } from '../../../i18n/resolveLocale';

function isZhLanguage(language: string): boolean {
  return isChineseLocale(language);
}

export function resolveWelcomePresetPrompt(
  copy: WelcomePresetCopy | undefined,
  language: string,
): string | undefined {
  if (!copy) return undefined;
  return isZhLanguage(language) ? copy.zh : copy.en;
}

export function welcomePresetFallbackPrompt(
  kind: 'image' | 'video',
  id: string,
  language: string,
): string {
  if (isZhLanguage(language)) {
    return kind === 'image' ? `根据参考图生成：${id}` : `根据参考视频生成：${id}`;
  }
  return kind === 'image' ? `Generate from reference: ${id}` : `Generate from reference video: ${id}`;
}
