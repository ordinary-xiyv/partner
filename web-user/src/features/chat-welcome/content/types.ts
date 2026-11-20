/** 欢迎预设文案：与 i18n 分离，便于运营/素材单独维护 */
export interface WelcomePresetCopy {
  zh: string;
  en: string;
}

export type WelcomePresetCopyMap = Record<string, WelcomePresetCopy>;
