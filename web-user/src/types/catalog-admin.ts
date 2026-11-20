/** Admin catalog model — aligned with internal/catalog/model.go + adminCatalogRow */

export type CatalogKind = 'direct' | 'alias';

export type CatalogCategory = 'llm' | 'audio' | 'image' | 'video' | 'embedding';

export type CatalogBillingUnit = 'token' | 'request' | 'second' | 'image';

export type CatalogFreeQuotaUnit = 'quota' | 'tokens' | 'calls' | '';

export interface CatalogExtraPriceInput {
  key: string;
  label: string;
  value: number;
  unit: string;
  note?: string;
}

export type CatalogExtraPriceUnit = '1M_tokens' | 'request' | 'second' | 'image';

export type CatalogScenarioUnit = CatalogExtraPriceUnit | 'token';

export interface CatalogPriceScenarioRowInput {
  label: string;
  value: number;
  unit: string;
  note?: string;
}

export interface CatalogPriceScenarioInput {
  key?: string;
  label: string;
  note?: string;
  card?: boolean;
  rows: CatalogPriceScenarioRowInput[];
}

export interface AdminCatalogModel {
  id: number;
  model_id: string;
  display_name: string;
  provider: string;
  provider_key?: string;
  description?: string;
  tags?: string[];
  input_price: number;
  output_price: number;
  per_request_price: number;
  cache_input_price?: number;
  cache_creation_price?: number;
  input_price_with_video?: number;
  extra_prices?: CatalogExtraPriceInput[] | string;
  price_scenarios?: CatalogPriceScenarioInput[] | string;
  pricing_tiers?: string;
  context_length: number;
  input_context_limit?: number;
  output_context_limit?: number;
  multimodal_input?: boolean;
  capabilities?: string[];
  modalities?: string[];
  category?: string;
  short_description?: string;
  marketing_badge?: string;
  usage_description?: string;
  release_date?: string | null;
  rate_limit_rpm?: number;
  rate_limit_tpm?: number;
  free_quota_total?: number;
  free_quota_unit?: string;
  billing_unit?: string;
  unit_price?: number;
  doc_slug?: string;
  api_endpoint?: string;
  featured: boolean;
  sort_order?: number;
  enabled: boolean;
  kind?: CatalogKind | string;
  selection_policy?: string;
  callable?: boolean;
  listed?: boolean;
  target_count?: number;
  available_channels?: number;
}

export interface CatalogAliasTarget {
  id?: number;
  catalog_model_id?: string;
  target_model_id: string;
  priority: number;
  weight: number;
  enabled: boolean;
  extra_config?: string;
}

export interface CatalogAliasTargetInput {
  target_model_id: string;
  priority?: number;
  weight?: number;
  enabled?: boolean;
  extra_config?: string;
}

export interface CatalogTargetsResponse {
  catalog_model_id: string;
  targets: CatalogAliasTarget[];
}

export interface CatalogSelectableTarget {
  model_id: string;
  kind?: string;
  display_name?: string;
  available?: boolean;
  reason?: string;
}

export interface AdminListCatalogParams {
  search?: string;
  kind?: CatalogKind;
  category?: string;
  /** provider_key */
  provider?: string;
  /** true / false；不传表示全部 */
  featured?: boolean;
  /** true / false；不传表示全部 */
  listed?: boolean;
}
