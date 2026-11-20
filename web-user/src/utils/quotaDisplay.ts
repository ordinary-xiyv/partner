import type { User } from '../types';

export interface QuotaDisplay {
  is_org_member?: boolean;
  quota_limit?: number;
  personal_remaining?: number;
  pool_remaining?: number;
}

/** Operations-facing primary balance for dashboard / profile. */
export function getUserDisplayQuota(user: User | null | undefined): number {
  if (!user) return 0;
  const display = user.quota_display;
  if (display?.is_org_member && display.personal_remaining != null) {
    return display.personal_remaining;
  }
  return user.quota ?? 0;
}

export function getUserPoolRemaining(user: User | null | undefined): number | null {
  const display = user?.quota_display;
  if (display?.is_org_member && display.pool_remaining != null) {
    return display.pool_remaining;
  }
  return null;
}

export function isQuotaOverdraft(quotaUnits: number): boolean {
  return Number.isFinite(quotaUnits) && quotaUnits < 0;
}

export function parseQuotaDisplay(raw: unknown): QuotaDisplay | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const data = raw as Record<string, unknown>;
  return {
    is_org_member: Boolean(data.is_org_member),
    quota_limit: data.quota_limit != null ? Number(data.quota_limit) : undefined,
    personal_remaining: data.personal_remaining != null ? Number(data.personal_remaining) : undefined,
    pool_remaining: data.pool_remaining != null ? Number(data.pool_remaining) : undefined,
  };
}
