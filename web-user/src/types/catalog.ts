/** Lynx-Public catalog types — aligned with internal/catalog/dto.go */

export interface KeyLabel {
  key: string;
  label: string;
}

export interface CatalogFiltersDTO {
  categories: KeyLabel[];
  providers: KeyLabel[];
  groups: KeyLabel[];
  tags: string[];
  pricing_types: KeyLabel[];
}

export interface PlazaBannerPublic {
  id: number;
  image_url: string;
  catalog_model_id: number;
  display_name: string;
  description: string;
  sort_order: number;
}

export type CatalogPublicKind = 'direct' | 'alias';

export interface CatalogCardDTO {
  id: number;
  name: string;
  provider: string;
  provider_key: string;
  kind?: CatalogPublicKind;
  category: string;
  description: string;
  tags: string[];
  marketing_badge: string;
  usage_description?: string;
  pricing_type: string;
  billing_unit: string;
  unit: string;
  price_label: string;
  price_summary: string;
  input_price: number | null;
  output_price: number | null;
  unit_price: number | null;
  default_scenario?: ScenarioDTO;
  scenario_count?: number;
  available_groups: string[];
  available: boolean;
  context_length: number;
  featured: boolean;
}

export interface FreeQuotaDTO {
  total: number;
  remaining: number | null;
  unit: string;
}

export interface PricesDTO {
  input_per_1m: number | null;
  output_per_1m: number | null;
  cache_read_per_1m: number | null;
  cache_write_per_1m: number | null;
  unit_price: number | null;
}

export interface SpecDTO {
  context_length: number;
  rate_limit: string;
  release_date: string | null;
}

export interface ExtraPriceDTO {
  key: string;
  label: string;
  value: number;
  unit: string;
  note?: string;
}

export interface ScenarioRowDTO {
  label: string;
  value: number;
  unit: string;
  note?: string;
}

export interface ScenarioDTO {
  key?: string;
  label: string;
  note?: string;
  card?: boolean;
  rows: ScenarioRowDTO[];
}

export interface GroupPricingDTO {
  group: string;
  group_name: string;
  pricing_type: string;
  billing_unit: string;
  unit: string;
  price_label: string;
  price_summary: string;
  prices: PricesDTO;
  extra_prices?: ExtraPriceDTO[];
  scenarios?: ScenarioDTO[];
  spec?: SpecDTO;
  collapsed: boolean;
}

export interface DocHTTPApiDTO {
  endpoint: string;
  curl: string;
  anthropic_endpoint?: string;
  anthropic_curl?: string;
}

export interface DocsDTO {
  http_api: DocHTTPApiDTO;
  claude_code: Record<string, unknown>;
  opencode: Record<string, unknown>;
  openclaw: Record<string, unknown>;
}

export interface CatalogDetailDTO {
  id: number;
  name: string;
  provider: string;
  provider_key: string;
  kind?: CatalogPublicKind;
  category: string;
  description: string;
  tags: string[];
  marketing_badge?: string;
  usage_description?: string;
  free_quota: FreeQuotaDTO | null;
  available: boolean;
  auto_group_route: string[];
  groups: GroupPricingDTO[];
  docs: DocsDTO;
}

export interface CatalogProviderPublic {
  provider_key: string;
  display_name: string;
  icon_data_uri: string;
  website_url: string;
  description: string;
  sort_order: number;
}

export interface CatalogListParams {
  category?: string;
  provider?: string;
  group?: string;
  tag?: string;
  pricing_type?: string;
  featured?: boolean;
  search?: string;
  include_unavailable?: boolean;
  page?: number;
  page_size?: number;
}

export interface CatalogListFilters {
  category: string | null;
  provider: string | null;
  group: string | null;
  tags: string[];
  pricingType: string | null;
  search: string;
}

export const DEFAULT_CATALOG_LIST_FILTERS: CatalogListFilters = {
  category: null,
  provider: null,
  group: null,
  tags: [],
  pricingType: null,
  search: '',
};

export const CATALOG_PAGE_SIZE = 20;
