import type { RateLimit, RateLimitFormState, RateLimitReq, RateLimitScopeType } from '../types/modelRateLimit';

export function displayScopeName(item: Pick<RateLimit, 'scope_type' | 'scope_name' | 'scope_key'>): string {
  if (item.scope_type === 'global') return '*';
  return item.scope_name?.trim() || item.scope_key;
}

export function displayModelName(item: Pick<RateLimit, 'model_name' | 'model_id'>): string {
  if (item.model_id === '*' || item.model_name === '*') return '*';
  return item.model_name?.trim() || item.model_id || '-';
}

export function formatLimitValue(value: number, unlimitedLabel: string): string {
  if (value <= 0) return unlimitedLabel;
  return value.toLocaleString();
}

export function defaultRateLimitFormState(): RateLimitFormState {
  return {
    scope_type: 'global',
    scope_key: '*',
    model_name: '',
    concurrency_limit: 0,
    tpm_limit: 0,
    rpm_limit: 0,
    enabled: true,
    priority: 0,
    remark: '',
  };
}

export function rateLimitToFormState(item: RateLimit): RateLimitFormState {
  const state: RateLimitFormState = {
    scope_type: item.scope_type,
    scope_key: item.scope_key,
    model_name: item.model_name || (item.model_id === '*' ? '*' : item.model_id),
    concurrency_limit: item.concurrency_limit ?? 0,
    tpm_limit: item.tpm_limit ?? 0,
    rpm_limit: item.rpm_limit ?? 0,
    enabled: item.enabled,
    priority: item.priority ?? 0,
    remark: item.remark ?? '',
  };
  if (item.scope_type === 'org') {
    state.org_id = Number(item.scope_key) || undefined;
  } else if (item.scope_type === 'group') {
    state.group_name = item.scope_key;
  } else if (item.scope_type === 'user') {
    state.user_id = Number(item.scope_key) || undefined;
  }
  return state;
}

export function formStateToPayload(state: RateLimitFormState): RateLimitReq {
  let scope_key = state.scope_key;
  if (state.scope_type === 'global') {
    scope_key = '*';
  } else if (state.scope_type === 'org' && state.org_id != null) {
    scope_key = String(state.org_id);
  } else if (state.scope_type === 'group' && state.group_name) {
    scope_key = state.group_name;
  } else if (state.scope_type === 'user' && state.user_id != null) {
    scope_key = String(state.user_id);
  }

  return {
    scope_type: state.scope_type,
    scope_key,
    model_name: state.model_name.trim(),
    concurrency_limit: state.concurrency_limit,
    tpm_limit: state.tpm_limit,
    rpm_limit: state.rpm_limit,
    enabled: state.enabled,
    priority: state.priority,
    remark: state.remark.trim(),
  };
}

export interface RateLimitFormValidation {
  ok: boolean;
  messageKey?: string;
}

export function validateRateLimitForm(state: RateLimitFormState): RateLimitFormValidation {
  if (!state.model_name.trim()) {
    return { ok: false, messageKey: 'modelRateLimit.validation.modelNameRequired' };
  }
  if (state.concurrency_limit < 0 || state.tpm_limit < 0 || state.rpm_limit < 0) {
    return { ok: false, messageKey: 'modelRateLimit.validation.limitNonNegative' };
  }
  if (state.scope_type === 'org' && (state.org_id == null || state.org_id <= 0)) {
    return { ok: false, messageKey: 'modelRateLimit.validation.orgRequired' };
  }
  if (state.scope_type === 'group' && !state.group_name?.trim()) {
    return { ok: false, messageKey: 'modelRateLimit.validation.groupRequired' };
  }
  if (state.scope_type === 'user' && (state.user_id == null || state.user_id <= 0)) {
    return { ok: false, messageKey: 'modelRateLimit.validation.userRequired' };
  }
  return { ok: true };
}

export function scopeTypeI18nKey(scopeType: RateLimitScopeType): string {
  return `modelRateLimit.scope.${scopeType}`;
}
