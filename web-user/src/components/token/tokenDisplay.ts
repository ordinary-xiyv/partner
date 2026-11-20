import type { TFunction } from 'i18next';
import type { Token } from '../../types';

export type TokenStatusTone = 'enabled' | 'disabled' | 'expired' | 'exhausted' | 'unknown';

/** 与后端 TokenStatus* 常量一致 */
export const TOKEN_STATUS_ENABLED = 1;
export const TOKEN_STATUS_DISABLED = 2;
export const TOKEN_STATUS_EXPIRED = 3;
export const TOKEN_STATUS_EXHAUSTED = 4;

/** 仅已启用 / 已禁用可在卡片上互相切换 */
export function isTokenStatusToggleable(status: number): boolean {
  return status === TOKEN_STATUS_ENABLED || status === TOKEN_STATUS_DISABLED;
}

/** 列表展示用掩码，与设计稿 / 后端 MaskTokenKey 一致 */
export function maskTokenKey(key: string): string {
  const normalized = key.startsWith('sk-') ? key : `sk-${key}`;
  if (normalized.length <= 8) {
    if (normalized.length <= 4) return '*'.repeat(normalized.length);
    return `${normalized.slice(0, 2)}****${normalized.slice(-2)}`;
  }
  return `${normalized.slice(0, 8)}**********${normalized.slice(-4)}`;
}

/** 额度使用进度 0–100；无限额度无总量时返回 0 */
export function getTokenQuotaUsagePercent(token: Token): number {
  if (token.unlimited_quota) return 0;
  const total = token.used_quota + token.remain_quota;
  if (total <= 0) return 0;
  return Math.min(100, Math.round((token.used_quota / total) * 100));
}

export type TokenStatusFilter = 'all' | 'enabled' | 'expired';

export function filterTokensByStatus(tokens: Token[], filter: TokenStatusFilter): Token[] {
  if (filter === 'enabled') return tokens.filter((t) => t.status === TOKEN_STATUS_ENABLED);
  if (filter === 'expired') return tokens.filter((t) => t.status === TOKEN_STATUS_EXPIRED);
  return tokens;
}

/** 令牌状态：1 已启用 / 2 停用 / 3 过期 / 4 耗尽（与后端 TokenStatus* 常量一致） */
export function getTokenStatusMeta(
  status: number,
  t: TFunction,
): { label: string; tone: TokenStatusTone } {
  switch (status) {
    case 1:
      return { label: t('tokenStatEnabled'), tone: 'enabled' };
    case 2:
      return { label: t('tokenStatusDisabled'), tone: 'disabled' };
    case 3:
      return { label: t('tokenStatusExpired'), tone: 'expired' };
    case 4:
      return { label: t('tokenStatusExhausted'), tone: 'exhausted' };
    default:
      return { label: t('tokenStatusInactive'), tone: 'unknown' };
  }
}

export function isTokenExpiringSoon(token: Token, withinDays = 7): boolean {
  if (token.expired_time <= 0) return false;
  const now = Math.floor(Date.now() / 1000);
  const horizon = now + withinDays * 86400;
  return token.expired_time > now && token.expired_time <= horizon;
}

export function computeTokenStats(tokens: Token[]) {
  const now = Math.floor(Date.now() / 1000);
  const horizon = now + 7 * 86400;
  return {
    total: tokens.length,
    enabled: tokens.filter((t) => t.status === 1).length,
    expiringSoon: tokens.filter(
      (t) => t.expired_time > 0 && t.expired_time > now && t.expired_time <= horizon,
    ).length,
  };
}

/** 前端选取 API 令牌：优先已启用且 default，否则取第一个已启用 */
export function pickPreferredToken<T extends Pick<Token, 'status' | 'default'>>(
  tokens: T[],
): T | undefined {
  const enabled = tokens.filter((t) => t.status === 1);
  return enabled.find((t) => t.default) ?? enabled[0];
}
