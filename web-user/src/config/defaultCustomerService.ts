import type { CustomerServiceConfig } from '../types/siteAppearance';

export function buildDefaultCustomerServiceConfig(): CustomerServiceConfig {
  return {
    enabled: false,
    show_contact: true,
    show_feedback: true,
    qr_code_file_id: '',
    feedback_url: '',
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
    show_feedback: raw.show_feedback ?? base.show_feedback,
    qr_code_file_id: raw.qr_code_file_id?.trim() || '',
    qr_code_url: raw.qr_code_url,
    feedback_url: raw.feedback_url?.trim() || '',
  };
}
