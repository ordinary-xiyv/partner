/**
 * Catalog provider admin API
 */
import API from './index';
import type {
  AdminListProvidersParams,
  ModelProvider,
  ProviderCreatePayload,
  ProviderDeleteConflictData,
  ProviderIconUploadResult,
  ProviderUpdatePayload,
} from '../types/provider';

interface LynxOk<T> {
  success: boolean;
  data: T;
  message?: string;
}

function assertSuccess<T>(res: { data: LynxOk<T> }, fallback: string): T {
  if (!res.data.success) {
    throw new Error(res.data.message || fallback);
  }
  return res.data.data;
}

export function adminListProviders(params: AdminListProvidersParams = {}) {
  const query: Record<string, string> = {};
  if (params.search?.trim()) query.search = params.search.trim();
  if (params.enabled !== undefined) query.enabled = String(params.enabled);

  return API.get<LynxOk<ModelProvider[]>>('/api/lynx/admin/catalog/providers', { params: query }).then(
    (res) => assertSuccess(res, 'Failed to load providers'),
  );
}

export function adminCreateProvider(payload: ProviderCreatePayload) {
  return API.post<LynxOk<ModelProvider>>('/api/lynx/admin/catalog/providers', payload).then((res) =>
    assertSuccess(res, 'Failed to create provider'),
  );
}

export function adminUpdateProvider(providerKey: string, payload: ProviderUpdatePayload) {
  const encoded = encodeURIComponent(providerKey);
  return API.put<LynxOk<ModelProvider>>(`/api/lynx/admin/catalog/providers/${encoded}`, payload).then(
    (res) => assertSuccess(res, 'Failed to update provider'),
  );
}

export interface ProviderDeleteResult {
  cleared_catalog_keys?: number;
}

export async function adminDeleteProvider(
  providerKey: string,
  options?: { force?: boolean },
): Promise<ProviderDeleteResult> {
  const encoded = encodeURIComponent(providerKey);
  const params = options?.force ? { force: 'true' } : undefined;
  const res = await API.delete<LynxOk<ProviderDeleteResult>>(
    `/api/lynx/admin/catalog/providers/${encoded}`,
    { params },
  );
  if (!res.data.success) {
    const err = new Error(res.data.message || 'Failed to delete provider') as Error & {
      response?: { status?: number; data?: { message?: string; data?: ProviderDeleteConflictData } };
    };
    err.response = { status: res.status, data: res.data };
    throw err;
  }
  return res.data.data ?? {};
}

export function adminUploadProviderIcon(providerKey: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  const encoded = encodeURIComponent(providerKey);
  return API.post<LynxOk<ProviderIconUploadResult>>(
    `/api/lynx/admin/catalog/providers/${encoded}/icon`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  ).then((res) => assertSuccess(res, 'Failed to upload icon'));
}
