import type { SmsConfigField } from '../types/smsChannel';
import { SMS_SECRET_MASK } from '../types/smsChannel';

export function parseSmsChannelConfig(config: unknown): Record<string, unknown> {
  if (!config) return {};
  if (typeof config === 'string') {
    try {
      const parsed = JSON.parse(config) as unknown;
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof config === 'object' && config !== null) {
    return config as Record<string, unknown>;
  }
  return {};
}

export function initConfigValuesFromSchema(
  schema: SmsConfigField[],
  existing?: Record<string, unknown>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of schema) {
    if (field.type === 'template_map') {
      const templates: Record<string, string> = {};
      const existingTemplates = (existing?.templates as Record<string, string> | undefined) ?? {};
      for (const purpose of field.purposes ?? []) {
        templates[purpose] = existingTemplates[purpose] ?? '';
      }
      values.templates = templates;
      continue;
    }
    const raw = existing?.[field.key];
    if (field.type === 'secret' && raw === SMS_SECRET_MASK) {
      values[field.key] = '';
      continue;
    }
    if (raw !== undefined && raw !== null) {
      values[field.key] = raw;
    } else if (field.default) {
      values[field.key] = field.default;
    } else {
      values[field.key] = '';
    }
  }
  return values;
}

export function buildSmsConfigPayload(
  schema: SmsConfigField[],
  values: Record<string, unknown>,
  isEdit: boolean,
): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  for (const field of schema) {
    if (field.type === 'template_map') {
      const templates: Record<string, string> = {};
      const src = (values.templates as Record<string, string> | undefined) ?? {};
      for (const purpose of field.purposes ?? []) {
        templates[purpose] = String(src[purpose] ?? '').trim();
      }
      config.templates = templates;
      continue;
    }

    const raw = values[field.key];

    if (field.type === 'secret') {
      const trimmed = String(raw ?? '').trim();
      if (isEdit) {
        config[field.key] = !trimmed || trimmed === SMS_SECRET_MASK ? SMS_SECRET_MASK : trimmed;
      } else if (trimmed) {
        config[field.key] = trimmed;
      }
      continue;
    }

    if (field.type === 'number') {
      const num = raw === '' || raw === undefined || raw === null ? undefined : Number(raw);
      if (num !== undefined && !Number.isNaN(num)) {
        config[field.key] = num;
      } else if (field.default) {
        config[field.key] = Number(field.default);
      }
      continue;
    }

    const trimmed = String(raw ?? '').trim();
    if (trimmed) {
      config[field.key] = trimmed;
    } else if (!isEdit && field.default) {
      config[field.key] = field.default;
    } else if (isEdit) {
      config[field.key] = trimmed;
    } else if (field.required) {
      config[field.key] = '';
    }
  }

  return config;
}
