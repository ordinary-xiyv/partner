import type { CustomerServiceConfig } from '../types/siteAppearance';

export function buildDefaultCustomerServiceConfig(): CustomerServiceConfig {
  return {
    enabled: false,
    show_contact: true,
    qr_code_file_id: '',
  };
}

export function normalizeCustomerServiceConfig(
  raw: Partial<CustomerServiceConfig> | undefined,
): CustomerServiceConfig {
  const base = buildDefaultCustomerServiceConfig();
  if (!raw) return base;

  return {
    enabled: raw.enabled ?? base.enabled,
    show_contact: raw.show_contact ?? base.show_contact,
    qr_code_file_id: raw.qr_code_file_id?.trim() || '',
    qr_code_url: raw.qr_code_url,
  };
}
