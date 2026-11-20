/** 与后端 internal/storage/template.go 保持一致的设置页预览逻辑 */

import type { PublicObjectStorageConfig } from '../types';

export function endpointHost(endpoint: string): string {
  return endpoint.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

export function deriveRegionFromEndpoint(endpoint: string): string {
  const host = endpointHost(endpoint);
  const oss = host.match(/oss-([a-z0-9-]+?)(?:-internal)?\.aliyuncs\.com/i);
  if (oss?.[1]) return oss[1];
  const tos = host.match(/tos-(?:s3-)?([a-z0-9-]+?)\.(?:i)?volces\.com/i);
  if (tos?.[1]) return tos[1];
  return '';
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  let out = tpl.trim();
  if (!out) return '';
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
}

export function resolvePublicHost(values: {
  bucket: string;
  endpoint: string;
  bucket_domain: string;
  public_url_host_template: string;
}): string {
  const custom = endpointHost(values.bucket_domain || '');
  if (custom) return custom;
  const tpl = values.public_url_host_template.trim() || '{bucket}.{endpoint_host}';
  return renderTemplate(tpl, {
    bucket: values.bucket.trim(),
    endpoint_host: endpointHost(values.endpoint),
  });
}

export function previewPublicUrl(values: {
  bucket: string;
  endpoint: string;
  bucket_domain: string;
  public_url_host_template: string;
  key_prefix: string;
  key_template_upload_public_read: string;
}): string {
  const host = resolvePublicHost(values);
  if (!host) return '';
  const keyPrefix = (values.key_prefix || 'lynx').replace(/^\/+|\/+$/g, '');
  const keyTpl = values.key_template_upload_public_read.trim()
    || '{key_prefix}/public/gen-input/{user_id}/{file_id}/{filename}';
  const objectKey = renderTemplate(keyTpl, {
    key_prefix: keyPrefix,
    user_id: '1',
    file_id: 'sample-file-id',
    filename: 'demo.mp4',
  });
  return `https://${host}/${objectKey}`;
}

export function buildPublicUrlFromConfig(
  cfg: Pick<PublicObjectStorageConfig, 'public_url_host' | 'bucket_domain' | 'endpoint' | 'bucket' | 'public_url_host_template' | 'key_prefix' | 'key_template_site_logo'>,
  objectKey: string,
): string {
  const host = cfg.public_url_host?.trim()
    || resolvePublicHost({
      bucket: cfg.bucket || '',
      endpoint: cfg.endpoint || '',
      bucket_domain: cfg.bucket_domain || '',
      public_url_host_template: cfg.public_url_host_template || '{bucket}.{endpoint_host}',
    });
  const key = objectKey.trim().replace(/^\/+|\/+$/g, '');
  if (!host || !key) return '';
  return `https://${host}/${key}`;
}

export const PROVIDER_ENDPOINT_HINT: Record<string, string> = {
  aliyun_oss: 'https://oss-cn-beijing.aliyuncs.com',
  volcengine_tos: 'https://tos-cn-beijing.volces.com',
};
