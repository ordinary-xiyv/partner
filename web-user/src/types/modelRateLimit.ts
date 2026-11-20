export type RateLimitScopeType = 'global' | 'group' | 'org' | 'user';

export interface RateLimit {
  id: number;
  scope_type: RateLimitScopeType;
  scope_key: string;
  scope_name: string;
  model_id: string;
  model_name: string;
  concurrency_limit: number;
  tpm_limit: number;
  rpm_limit: number;
  enabled: boolean;
  priority: number;
  remark: string;
  created_at: number;
  updated_at: number;
}

export interface RateLimitReq {
  scope_type: RateLimitScopeType;
  scope_key: string;
  model_name: string;
  concurrency_limit: number;
  tpm_limit: number;
  rpm_limit: number;
  enabled?: boolean;
  priority?: number;
  remark?: string;
}

export interface RateLimitListRes {
  items: RateLimit[];
  total: number;
}

export interface RateLimitStats {
  concurrency_reject_total: number;
  tpm_reject_total: number;
  rpm_reject_total: number;
  redis_error_total: number;
}

export interface RateLimitFormState {
  scope_type: RateLimitScopeType;
  scope_key: string;
  org_id?: number;
  group_name?: string;
  user_id?: number;
  model_name: string;
  concurrency_limit: number;
  tpm_limit: number;
  rpm_limit: number;
  enabled: boolean;
  priority: number;
  remark: string;
}
