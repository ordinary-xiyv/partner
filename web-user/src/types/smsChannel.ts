/** SMS channel admin API types (aligned with internal/smschannel/dto.go). */

export const SMS_SECRET_MASK = '********';

export type SmsConfigFieldType = 'string' | 'secret' | 'number' | 'select' | 'template_map';

export interface SmsConfigField {
  key: string;
  label: string;
  type: SmsConfigFieldType;
  required?: boolean;
  default?: string;
  options?: string[];
  help?: string;
  purposes?: string[];
}

export interface SmsDriverDescriptor {
  type: string;
  display_name: string;
  category: string;
  config_schema: SmsConfigField[];
  secret_keys: string[];
}

export interface SmsChannel {
  id: number;
  name: string;
  type: string;
  config: Record<string, unknown> | string;
  enabled: boolean;
  status: string;
  last_error: string;
  total_sent: number;
  total_failed: number;
  last_used_at: string | null;
  updated_by: number;
  created_at: string;
  updated_at: string;
}

export interface SmsChannelCreatePayload {
  name: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
}

export interface SmsChannelUpdatePayload {
  name: string;
  type: string;
  config: Record<string, unknown>;
}

export interface SmsTestSendPayload {
  phone: string;
  purpose?: string;
}

export interface SmsTestSendResult {
  message_ids: string[];
  request_id: string;
  driver_type: string;
}

export const SMS_PHONE_PURPOSES = [
  'phone_register',
  'phone_login',
  'phone_reset_password',
  'phone_bind',
] as const;

export type SmsPhonePurpose = (typeof SMS_PHONE_PURPOSES)[number];
