import API from './index';
import type {
  ComplimentaryQuota,
  GrantComplimentaryQuotaBody,
  MyComplimentaryQuotasResponse,
  UpdateComplimentaryQuotaBody,
} from '../types';

interface LynxApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  total?: number;
}

export interface ComplimentaryQuotaListParams {
  /** UI 从 1 起；请求时会转为后端 0-based */
  p?: number;
  page_size?: number;
  user_id?: number;
  /** -1 或不传表示全部；0/1/2 为状态筛选 */
  status?: number;
}

/** 后端 Go 结构体无 json tag，响应为 PascalCase；兼容 snake_case */
type RawComplimentaryQuota = Record<string, unknown>;

function pickNum(raw: RawComplimentaryQuota, ...keys: string[]): number {
  for (const key of keys) {
    const v = raw[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return 0;
}

function pickStr(raw: RawComplimentaryQuota, ...keys: string[]): string {
  for (const key of keys) {
    const v = raw[key];
    if (typeof v === 'string') return v;
  }
  return '';
}

function pickExpiredAt(raw: RawComplimentaryQuota): number | null {
  for (const key of ['expired_at', 'ExpiredAt']) {
    const v = raw[key];
    if (v == null) continue;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function pickTime(raw: RawComplimentaryQuota, snake: string, pascal: string): number | string | undefined {
  const v = raw[snake] ?? raw[pascal];
  if (v == null) return undefined;
  if (typeof v === 'number' || typeof v === 'string') return v;
  return undefined;
}

export function normalizeComplimentaryQuota(raw: unknown): ComplimentaryQuota {
  const r = (raw && typeof raw === 'object' ? raw : {}) as RawComplimentaryQuota;
  return {
    id: pickNum(r, 'id', 'ID'),
    user_id: pickNum(r, 'user_id', 'UserID'),
    amount: pickNum(r, 'amount', 'Amount'),
    used: pickNum(r, 'used', 'Used'),
    remain: pickNum(r, 'remain', 'Remain'),
    status: pickNum(r, 'status', 'Status'),
    source: pickStr(r, 'source', 'Source'),
    operator_id: pickNum(r, 'operator_id', 'OperatorID'),
    remark: pickStr(r, 'remark', 'Remark'),
    expired_at: pickExpiredAt(r),
    created_at: pickTime(r, 'created_at', 'CreatedAt'),
    updated_at: pickTime(r, 'updated_at', 'UpdatedAt'),
  };
}

function normalizeMyResponse(raw: unknown): MyComplimentaryQuotasResponse {
  const r = (raw && typeof raw === 'object' ? raw : {}) as RawComplimentaryQuota;
  const list = (r.quotas ?? r.Quotas ?? []) as unknown[];
  const totalRemain = pickNum(r, 'total_remain', 'TotalRemain');
  return {
    quotas: (Array.isArray(list) ? list : []).map(normalizeComplimentaryQuota),
    total_remain: totalRemain,
  };
}

/** 当前登录用户的赠送金列表 */
export const getMyComplimentaryQuotas = () =>
  API.get<LynxApiResponse<MyComplimentaryQuotasResponse>>('/api/lynx/complimentary-quotas/my').then((res) => {
    if (res.data.success && res.data.data) {
      res.data.data = normalizeMyResponse(res.data.data);
    }
    return res;
  });

/** 管理端分页列表。响应 data 为数组（非 items） */
export const getComplimentaryQuotas = (params: ComplimentaryQuotaListParams = {}) => {
  const { p = 1, page_size = 10, user_id, status } = params;
  const query: Record<string, number> = {
    // 后端 List 将 p 当作 0-based（内部 +1）
    p: Math.max(0, p - 1),
    page_size,
  };
  if (user_id != null && user_id > 0) query.user_id = user_id;
  // 缺省 status 会被 Atoi 成 0（只查生效中）；全部时显式传 -1
  query.status = status == null ? -1 : status;
  return API.get<LynxApiResponse<ComplimentaryQuota[]>>('/api/lynx/admin/complimentary-quotas', {
    params: query,
  }).then((res) => {
    if (res.data.success && Array.isArray(res.data.data)) {
      res.data.data = res.data.data.map(normalizeComplimentaryQuota);
    }
    return res;
  });
};

export const grantComplimentaryQuota = (body: GrantComplimentaryQuotaBody) =>
  API.post<LynxApiResponse<ComplimentaryQuota>>('/api/lynx/admin/complimentary-quotas', body).then((res) => {
    if (res.data.success && res.data.data) {
      res.data.data = normalizeComplimentaryQuota(res.data.data);
    }
    return res;
  });

export const getComplimentaryQuota = (id: number) =>
  API.get<LynxApiResponse<ComplimentaryQuota>>(`/api/lynx/admin/complimentary-quotas/${id}`).then((res) => {
    if (res.data.success && res.data.data) {
      res.data.data = normalizeComplimentaryQuota(res.data.data);
    }
    return res;
  });

export const updateComplimentaryQuota = (id: number, body: UpdateComplimentaryQuotaBody) =>
  API.put<LynxApiResponse<unknown>>(`/api/lynx/admin/complimentary-quotas/${id}`, body);

export const deleteComplimentaryQuota = (id: number) =>
  API.delete<LynxApiResponse<unknown>>(`/api/lynx/admin/complimentary-quotas/${id}`);
