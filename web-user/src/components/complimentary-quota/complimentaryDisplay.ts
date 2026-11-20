import dayjs from 'dayjs';
import { formatTime } from '../../utils';
import type { ComplimentaryQuota } from '../../types';

export const COMPLIMENTARY_STATUS_ACTIVE = 0;
export const COMPLIMENTARY_STATUS_USED_UP = 1;
export const COMPLIMENTARY_STATUS_EXPIRED = 2;

export type ComplimentaryStatusFilter = 'all' | 0 | 1 | 2;

/** 发放原因预设 → source */
export const COMPLIMENTARY_SOURCE_PRESETS = [
  { value: 'new_user_test', labelKey: 'complimentaryQuota.sourceNewUserTest' },
  { value: 'major_client', labelKey: 'complimentaryQuota.sourceMajorClient' },
  { value: 'internal_test', labelKey: 'complimentaryQuota.sourceInternalTest' },
  { value: 'complaint_compensation', labelKey: 'complimentaryQuota.sourceComplaint' },
  { value: 'campaign_gift', labelKey: 'complimentaryQuota.sourceCampaign' },
  { value: 'registration_gift', labelKey: 'complimentaryQuota.sourceRegistrationGift' },
  { value: 'other', labelKey: 'complimentaryQuota.sourceOther' },
] as const;

export function formatComplimentaryTime(value: number | string | null | undefined): string {
  if (value == null || value === '') return '-';
  if (typeof value === 'number') {
    if (value <= 0) return '-';
    return formatTime(value);
  }
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : '-';
}

export function formatComplimentaryExpiredAt(expiredAt: number | null | undefined, neverLabel: string): string {
  if (expiredAt == null || expiredAt <= 0) return neverLabel;
  return formatTime(expiredAt);
}

export function complimentaryStatusTagColor(status: number): string {
  if (status === COMPLIMENTARY_STATUS_ACTIVE) return 'green';
  if (status === COMPLIMENTARY_STATUS_USED_UP) return 'default';
  if (status === COMPLIMENTARY_STATUS_EXPIRED) return 'orange';
  return 'default';
}

export function complimentaryStatusLabelKey(status: number): string {
  if (status === COMPLIMENTARY_STATUS_ACTIVE) return 'topupGiftStatusActive';
  if (status === COMPLIMENTARY_STATUS_USED_UP) return 'topupGiftStatusExhausted';
  if (status === COMPLIMENTARY_STATUS_EXPIRED) return 'topupGiftStatusExpired';
  return 'status';
}

export function complimentaryTitle(record: ComplimentaryQuota): string {
  const remark = (record.remark || '').trim();
  if (remark) return remark;
  return record.source || '-';
}

/** 将 source 映射为预设文案 key；自定义 source 则返回原文 */
export function complimentarySourceLabel(
  source: string,
  t: (key: string) => string,
): string {
  const value = (source || '').trim();
  if (!value) return '-';
  const preset = COMPLIMENTARY_SOURCE_PRESETS.find((p) => p.value === value);
  if (preset) return t(preset.labelKey);
  if (value === 'manual') return t('complimentaryQuota.sourceOther');
  return value;
}
