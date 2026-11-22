/**
 * 页脚版权行的文字解析。
 *
 * 原文件叫 footerColumnsFromConfig.ts，除这里之外还负责把页脚五列配置
 * 解析成可渲染的链接树。五列导航下线后那段逻辑没有任何调用方，整块删掉，
 * 只留下这一支 —— 所以文件名也一并改掉，免得后来的人以为这里还管着栏目。
 */
import type { AppLocale } from '../i18n/config';
import { pickLocalizedLabel, type LegacyLabelFields } from './localeLabels';

/**
 * 取版权 / 条款 / 隐私 / 备案这类单行文字。
 *
 * 优先级：多语言 labels（按当前语言）→ 旧版单值字段 → 兜底值。
 * 顺序不能反：伙伴后台在 labels 里存的是完整多语言，legacy 字段只是
 * 早期单语版本的残值，让它优先会把后台改过的文案盖掉。
 */
export function resolveFooterLegalLabel(
  labels: LegacyLabelFields['labels'],
  legacy?: string,
  locale?: AppLocale,
  fallback?: string,
): string {
  const picked = pickLocalizedLabel(labels, locale ?? 'zh-CN');
  if (picked) return picked;
  if (legacy?.trim()) return legacy.trim();
  return fallback ?? '';
}
