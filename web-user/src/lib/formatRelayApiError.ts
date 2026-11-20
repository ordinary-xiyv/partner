import i18n from '../i18n';

interface RelayErrorPayload {
  code?: string;
  message?: string;
}

/** 网关 OpenAI 风格错误体：error.code + error.message */
function parseRelayErrorPayload(bodyText: string): RelayErrorPayload | null {
  const raw = bodyText.trim();
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const errObj = j.error;
    if (errObj && typeof errObj === 'object' && errObj !== null) {
      const e = errObj as Record<string, unknown>;
      let code: string | undefined;
      if (typeof e.code === 'string') {
        code = e.code;
      } else if (e.code != null && typeof e.code !== 'object') {
        code = String(e.code);
      }
      const message = typeof e.message === 'string' ? e.message.trim() : undefined;
      if (code || message) return { code, message };
    }
    const topCode = typeof j.code === 'string' ? j.code : undefined;
    const topMessage = typeof j.message === 'string' ? j.message.trim() : undefined;
    if (topCode || topMessage) return { code: topCode, message: topMessage };
  } catch {
    /* 非 JSON */
  }
  return null;
}

/** 从网关英文 quota 文案中提取剩余/所需金额（格式稳定） */
function parseQuotaPairFromMessage(message: string): { remain?: string; need?: string } {
  const remainNeed = message.match(/remain quota:\s*([^,]+),\s*need quota:\s*(\S+)/i);
  if (remainNeed) {
    return { remain: remainNeed[1].trim(), need: remainNeed[2].trim() };
  }
  const userQuota = message.match(/user quota:\s*([^,]+),\s*need quota:\s*(\S+)/i);
  if (userQuota) {
    return { remain: userQuota[1].trim(), need: userQuota[2].trim() };
  }
  return {};
}

const RELAY_ERROR_CODE_KEYS: Record<string, string> = {
  pre_consume_token_quota_failed: 'relay.error.preConsumeTokenQuotaFailed',
  insufficient_user_quota: 'relay.error.insufficientUserQuota',
};

const RELAY_ERROR_CODE_SHORT_KEYS: Record<string, string> = {
  pre_consume_token_quota_failed: 'relay.error.preConsumeTokenQuotaFailedShort',
  insufficient_user_quota: 'relay.error.insufficientUserQuotaShort',
};

function localizeByErrorCode(code: string, message?: string): string | undefined {
  const key = RELAY_ERROR_CODE_KEYS[code];
  if (!key) return undefined;

  const { remain, need } = message ? parseQuotaPairFromMessage(message) : {};
  if (remain && need) {
    return i18n.t(key, { remain, need });
  }

  const shortKey = RELAY_ERROR_CODE_SHORT_KEYS[code];
  return shortKey ? i18n.t(shortKey) : i18n.t(key, { remain: '—', need: '—' });
}

/**
 * 将 /v1/chat/completions、/v1/images/generations、/v1/videos 等网关错误转为当前语言展示文案。
 */
function inferErrorCodeFromMessage(message: string): string | undefined {
  const lower = message.toLowerCase();
  if (lower.includes('token quota is not enough') || lower.includes('token remain quota:')) {
    return 'pre_consume_token_quota_failed';
  }
  if (lower.includes('user quota is not enough')) {
    return 'insufficient_user_quota';
  }
  return undefined;
}

export function formatRelayApiErrorBody(status: number, bodyText: string): string {
  const raw = bodyText.trim();
  const parsed = parseRelayErrorPayload(bodyText);

  const code = parsed?.code ?? (parsed?.message ? inferErrorCodeFromMessage(parsed.message) : undefined);
  if (code) {
    const localized = localizeByErrorCode(code, parsed?.message);
    if (localized) return localized;
  }

  if (parsed?.message) return parsed.message;
  if (raw) return raw.slice(0, 500);
  return i18n.t('relay.error.httpStatus', { status });
}
