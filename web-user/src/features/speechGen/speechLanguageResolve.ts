import type { SpeechLanguageType } from './speechTypes';

const LATIN_LANGS: SpeechLanguageType[] = [
  'English',
  'German',
  'Italian',
  'Portuguese',
  'Spanish',
  'French',
  'Russian',
];

const CJK_LANGS: SpeechLanguageType[] = ['Chinese', 'Japanese', 'Korean'];

function countCjkChars(text: string): number {
  return (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length;
}

function countLatinChars(text: string): number {
  return (text.match(/[a-zA-Z]/g) ?? []).length;
}

/**
 * 百炼 TTS：单一语种文本应传匹配的 language_type，否则易报错或音质差。
 * 中文正文 + English 等拉丁语种选项时，自动改为 Chinese。
 */
export function resolveSpeechLanguageType(
  text: string,
  languageType: SpeechLanguageType,
): SpeechLanguageType {
  if (languageType === 'Auto') return 'Auto';

  const trimmed = text.trim();
  if (!trimmed) return languageType;

  const meaningfulLen = trimmed.replace(/\s/g, '').length;
  if (meaningfulLen === 0) return languageType;

  const cjkRatio = countCjkChars(trimmed) / meaningfulLen;
  const latinRatio = countLatinChars(trimmed) / meaningfulLen;

  if (cjkRatio >= 0.3 && LATIN_LANGS.includes(languageType)) {
    return 'Chinese';
  }

  if (latinRatio >= 0.5 && CJK_LANGS.includes(languageType)) {
    return 'English';
  }

  return languageType;
}
