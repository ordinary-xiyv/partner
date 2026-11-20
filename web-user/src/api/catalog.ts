/**
 * Catalog API — Lynx-Public（模型广场 / 定价展示）+ Admin CRUD
 * 公开接口统一走 assertSuccess + types/catalog；页面禁止直接解析 res.data
 */
import API from './index';
import type {
  CatalogCardDTO,
  CatalogDetailDTO,
  CatalogFiltersDTO,
  CatalogListFilters,
  CatalogListParams,
  CatalogProviderPublic,
  PlazaBannerPublic,
} from '../types/catalog';
import type {
  AdminCatalogModel,
  AdminListCatalogParams,
  CatalogAliasTargetInput,
  CatalogSelectableTarget,
  CatalogTargetsResponse,
} from '../types/catalog-admin';

// ─── Lynx response envelopes ───

interface LynxOk<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface LynxListOk<T> extends LynxOk<T> {
  total: number;
  page: number;
  page_size: number;
}

function assertSuccess<T>(res: { data: LynxOk<T> & { message?: string } }, fallback: string): T {
  if (!res.data.success) {
    throw new Error(res.data.message || fallback);
  }
  return res.data.data;
}

// ─── Lynx-Public ───

export function fetchCatalogFilters() {
  return API.get<LynxOk<CatalogFiltersDTO>>('/api/lynx/catalog/filters').then((res) =>
    assertSuccess(res, 'Failed to load filters'),
  );
}

export function fetchCatalogProviders() {
  return API.get<LynxOk<CatalogProviderPublic[]>>('/api/lynx/catalog/providers').then((res) =>
    assertSuccess(res, 'Failed to load providers'),
  );
}

export function fetchPlazaBanners(limit = 3) {
  return API.get<LynxOk<PlazaBannerPublic[]>>('/api/lynx/catalog/plaza-banners', {
    params: { limit },
  }).then((res) => assertSuccess(res, 'Failed to load banners') ?? []);
}

export function fetchCatalogModels(params: CatalogListParams = {}) {
  return API.get<LynxListOk<CatalogCardDTO[]>>('/api/lynx/catalog/models', { params }).then((res) => {
    if (!res.data.success) {
      throw new Error(res.data.message || 'Failed to load models');
    }
    return {
      items: res.data.data ?? [],
      total: res.data.total ?? 0,
      page: res.data.page ?? 1,
      pageSize: res.data.page_size ?? 20,
    };
  });
}

/** 拉取全部公开模型卡片（分页合并，供定价页等） */
export async function fetchAllCatalogModels(
  params: Omit<CatalogListParams, 'page' | 'page_size'> = {},
): Promise<CatalogCardDTO[]> {
  const pageSize = 100;
  const all: CatalogCardDTO[] = [];
  let page = 1;
  let total = 0;

  do {
    const batch = await fetchCatalogModels({ ...params, page, page_size: pageSize });
    total = batch.total;
    all.push(...batch.items);
    page += 1;
  } while (all.length < total);

  return all;
}

export function fetchCatalogModelById(id: number) {
  return API.get<LynxOk<CatalogDetailDTO>>(`/api/lynx/catalog/models/${id}`).then((res) =>
    assertSuccess(res, 'Failed to load model detail'),
  );
}

export function buildCatalogListQueryParams(
  filters: CatalogListFilters,
  page: number,
  pageSize: number,
): CatalogListParams {
  const params: CatalogListParams = {
    page,
    page_size: pageSize,
    include_unavailable: false,
  };
  if (filters.category) params.category = filters.category;
  if (filters.provider) params.provider = filters.provider;
  if (filters.group) params.group = filters.group;
  if (filters.tags.length > 0) params.tag = filters.tags.join(',');
  if (filters.pricingType) params.pricing_type = filters.pricingType;
  const search = filters.search.trim();
  if (search) params.search = search;
  return params;
}

// ─── Admin ───

export function adminListCatalogModels(params: AdminListCatalogParams = {}) {
  const query: Record<string, string> = {};
  if (params.search?.trim()) query.search = params.search.trim();
  if (params.kind) query.kind = params.kind;
  if (params.category?.trim()) query.category = params.category.trim();
  if (params.provider?.trim()) query.provider = params.provider.trim();
  if (params.featured === true) query.featured = 'true';
  if (params.featured === false) query.featured = 'false';
  if (params.listed === true) query.listed = 'true';
  if (params.listed === false) query.listed = 'false';

  return API.get<LynxOk<AdminCatalogModel[]>>('/api/lynx/admin/catalog/models', { params: query }).then(
    (res) => assertSuccess(res, 'Failed to load catalog models'),
  );
}

export function adminCreateCatalogModel(data: Record<string, unknown>) {
  return API.post<LynxOk<AdminCatalogModel>>('/api/lynx/admin/catalog/models', data).then((res) =>
    assertSuccess(res, 'Failed to create catalog model'),
  );
}

export function adminUpdateCatalogModel(id: number, data: Record<string, unknown>) {
  return API.put<LynxOk<AdminCatalogModel>>(`/api/lynx/admin/catalog/models/${id}`, data).then((res) =>
    assertSuccess(res, 'Failed to update catalog model'),
  );
}

export function adminGetCatalogTargets(catalogId: number, params: { kind?: string } = {}) {
  const query: Record<string, string> = {};
  if (params.kind) query.kind = params.kind;

  return API.get<LynxOk<CatalogTargetsResponse>>(`/api/lynx/admin/catalog/models/${catalogId}/targets`, {
    params: query,
  }).then((res) => assertSuccess(res, 'Failed to load targets'));
}

export function adminListSelectableTargets(params: { alias_id?: string } = {}) {
  const query: Record<string, string> = {};
  const aliasId = params.alias_id?.trim();
  if (aliasId) query.alias_id = aliasId;

  return API.get<LynxOk<CatalogSelectableTarget[]>>('/api/lynx/admin/catalog/selectable-targets', {
    params: query,
  }).then((res) => assertSuccess(res, 'Failed to load selectable targets'));
}

export function adminReplaceCatalogTargets(
  catalogId: number,
  targets: CatalogAliasTargetInput[],
  params: { kind?: string } = {},
) {
  const query: Record<string, string> = {};
  if (params.kind) query.kind = params.kind;

  return API.put<LynxOk<CatalogTargetsResponse>>(
    `/api/lynx/admin/catalog/models/${catalogId}/targets`,
    { targets },
    { params: query },
  ).then((res) => assertSuccess(res, 'Failed to save targets'));
}

export const adminDeleteCatalogModel = (id: number) =>
  API.delete(`/api/lynx/admin/catalog/models/${id}`);

export const adminToggleFeatured = (id: number) =>
  API.put(`/api/lynx/admin/catalog/models/${id}/featured`);

export const adminBatchImportCatalogModels = (data: Record<string, unknown>[]) =>
  API.post('/api/lynx/admin/catalog/models/batch', data);
