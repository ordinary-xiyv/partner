import axios from 'axios';
import type { TFunction } from 'i18next';

const DOC_CENTER_ERROR_PREFIX = 'doccenter.';

const BACKEND_MESSAGE_TO_CODE: Record<string, string> = {
  'not found': 'not_found',
  'slug already exists': 'slug_conflict',
  'category is not empty': 'category_not_empty',
  'kind cannot be changed': 'category_kind_immutable',
  'category must be articles kind': 'invalid_category',
  'parent must be articles category': 'invalid_category',
  'invalid parent_id': 'invalid_category',
  'openapi category cannot be deleted': 'category_not_empty',
};

function normalizeBackendMessage(message: string): string {
  return message.trim().toLowerCase();
}

function mapBackendMessageToCode(message: string): string | null {
  const normalized = normalizeBackendMessage(message);
  if (!normalized) return null;

  const exact = BACKEND_MESSAGE_TO_CODE[normalized];
  if (exact) return exact;

  for (const [needle, code] of Object.entries(BACKEND_MESSAGE_TO_CODE)) {
    if (normalized.includes(needle)) return code;
  }
  return null;
}

export function toDocCenterError(error: unknown, fallbackCode = 'request_failed'): Error {
  if (axios.isAxiosError(error)) {
    const responseMessage = error.response?.data?.message;
    if (typeof responseMessage === 'string' && responseMessage.trim()) {
      const code = mapBackendMessageToCode(responseMessage);
      if (code) return new Error(`${DOC_CENTER_ERROR_PREFIX}${code}`);
      return new Error(responseMessage.trim());
    }
  }

  if (typeof error === 'string' && error.trim()) {
    const code = mapBackendMessageToCode(error);
    if (code) return new Error(`${DOC_CENTER_ERROR_PREFIX}${code}`);
    return new Error(error.trim());
  }

  if (error instanceof Error) {
    if (error.message.startsWith(DOC_CENTER_ERROR_PREFIX)) {
      return error;
    }
    const code = mapBackendMessageToCode(error.message);
    if (code) return new Error(`${DOC_CENTER_ERROR_PREFIX}${code}`);
    if (error.message.trim()) return error;
  }

  return new Error(`${DOC_CENTER_ERROR_PREFIX}${fallbackCode}`);
}

export function formatDocCenterError(
  error: unknown,
  t: TFunction,
  fallbackKey: string,
): string {
  const normalized = toDocCenterError(error);

  const { message } = normalized;
  if (message.startsWith(DOC_CENTER_ERROR_PREFIX)) {
    const code = message.slice(DOC_CENTER_ERROR_PREFIX.length);
    const i18nKey = `docCenter.error.${code}`;
    const translated = t(i18nKey);
    if (translated !== i18nKey) {
      return translated;
    }
  }

  return message.trim() || t(fallbackKey);
}
