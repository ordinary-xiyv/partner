import i18n from '../i18n';
import { isChineseLocale } from '../i18n/resolveLocale';
import zhToEn from '../i18n/api-messages/zh-to-en.json';

const ZH_TO_EN: Record<string, string> = zhToEn;

/** Longest-prefix first for dynamic backend messages */
const DYNAMIC_PREFIXES: { zh: string; en: string }[] = [
  { zh: '保存失败:', en: 'Save failed:' },
  { zh: '参数错误:', en: 'Invalid parameters:' },
  { zh: '查询失败:', en: 'Query failed:' },
  { zh: '创建失败:', en: 'Create failed:' },
  { zh: '更新失败:', en: 'Update failed:' },
  { zh: '参数错误', en: 'Invalid parameters' },
  { zh: '系统错误', en: 'System error' },
].sort((a, b) => b.zh.length - a.zh.length);

function isZhLocale(): boolean {
  return isChineseLocale(i18n.language);
}

/** new-api 等常返回「中文；English」双语拼接，按当前语言只保留一半 */
function pickMonolingualMessage(text: string): string {
  const parts = text.split(/[;；]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return text;

  const hasCjk = (s: string) => /[\u4e00-\u9fff]/.test(s);
  const latinScore = (s: string) => (s.match(/[A-Za-z]/g) || []).length;

  const first = parts[0];
  const rest = parts.slice(1).join(' ');

  if (hasCjk(first) && latinScore(rest) > latinScore(first)) {
    return isZhLocale() ? first : rest;
  }

  if (hasCjk(rest) && latinScore(first) > latinScore(rest)) {
    return isZhLocale() ? rest : first;
  }

  return isZhLocale() ? first : rest;
}

function translateExact(zh: string): string | undefined {
  return ZH_TO_EN[zh];
}

function translateByPrefix(text: string): string | undefined {
  for (const { zh, en } of DYNAMIC_PREFIXES) {
    if (text.startsWith(zh)) {
      return en + text.slice(zh.length);
    }
  }
  return undefined;
}

export type FormatApiMessageOptions = {
  /** i18n key when message is empty */
  fallbackKey?: string;
  /** @deprecated ignored; kept for migrated call sites */
  toastId?: string;
};

/**
 * 后端 MessageWithRequestId 会在文案尾部拼 `(request id: xxx)`，用于排查问题。
 * 但它是一串 40+ 位的无空格长字符串，放进 toast 会强制换行、把气泡撑成两行，很不美观。
 * 展示层统一剥离：request id 仍保留在浏览器 Network 响应与后端日志里，排查时照样能拿到。
 */
const REQUEST_ID_SUFFIX = /\s*[(（]\s*request[\s_-]?id\s*[:：][^)）]*[)）]\s*$/i;

function stripRequestId(text: string): string {
  let out = text;
  // 循环剥离：极少数链路会叠加多段 request id
  while (REQUEST_ID_SUFFIX.test(out)) {
    const next = out.replace(REQUEST_ID_SUFFIX, '').trim();
    if (next === out || !next) break;
    out = next;
  }
  // 整条消息只有 request id 时不要变成空串，退回原文交给上层兜底
  return out || text;
}

/**
 * Map Lynx/new-api `message` strings for display (zh passthrough, en lookup + prefix rules).
 */
export function formatApiMessage(
  message?: string | null,
  options?: FormatApiMessageOptions,
): string {
  const trimmed = pickMonolingualMessage(stripRequestId((message ?? '').trim()));
  if (!trimmed) {
    const key = options?.fallbackKey ?? 'notify.unknownError';
    return i18n.t(key);
  }

  if (isZhLocale()) {
    return trimmed;
  }

  const exact = translateExact(trimmed);
  if (exact) return exact;

  const prefixed = translateByPrefix(trimmed);
  if (prefixed) return prefixed;

  return trimmed;
}

type AxiosLikeError = {
  response?: {
    data?: {
      message?: string;
      msg?: string;
    };
  };
  message?: string;
};

export function extractApiMessageFromError(err: unknown): string | undefined {
  const e = err as AxiosLikeError;
  const data = e?.response?.data;
  const fromBody = data?.message ?? data?.msg;
  if (typeof fromBody === 'string' && fromBody.trim()) return fromBody.trim();
  if (typeof e?.message === 'string' && e.message.trim() && !e.message.includes('Network Error')) {
    return e.message.trim();
  }
  return undefined;
}

export function formatApiMessageFromError(
  err: unknown,
  options?: FormatApiMessageOptions,
): string {
  const raw = extractApiMessageFromError(err);
  if (raw) {
    return formatApiMessage(raw, options);
  }
  const key = options?.fallbackKey ?? 'notify.networkError';
  return i18n.t(key);
}
