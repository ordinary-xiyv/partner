/** Admin catalog provider — aligned with internal/catalog/provider_model.go */

export interface ModelProvider {
  id: number;
  provider_key: string;
  display_name: string;
  website_url: string;
  description: string;
  sort_order: number;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ProviderCreatePayload {
  provider_key: string;
  display_name: string;
  website_url?: string;
  description?: string;
  sort_order?: number;
  enabled?: boolean;
}

export interface ProviderUpdatePayload {
  display_name?: string;
  website_url?: string;
  description?: string;
  sort_order?: number;
  enabled?: boolean;
}

export interface ProviderDeleteConflictData {
  occupied_total: number;
  occupied_models: string[];
}

export interface ProviderIconUploadResult {
  icon_data_uri: string;
}

export interface AdminListProvidersParams {
  search?: string;
  enabled?: boolean;
}
