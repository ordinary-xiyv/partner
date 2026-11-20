/** 平台板块权限；细粒度 redemption/distribution/gateway_tier 仅前端菜单/路由使用 */
export type PlatformPermission =
  | 'billing'
  | 'redemption'
  | 'distribution'
  | 'gateway_tier'
  | 'log_read_all'
  | 'audit_read'
  | 'user_manage'
  | 'platform_admin'
  | 'root'
  | 'settings'
  | 'channel_secrets';

export interface User {
  aksk_enabled?: boolean;
  id: number;
  username: string;
  display_name: string;
  email: string;
  phone?: string | null;
  wechat_id?: string;
  github_id?: string;
  /** 是否已设置登录密码 */
  has_password?: boolean;
  /** 1=normal, 6=finance, 7=sales, 8=operations, 10=admin, 100=root */
  role: number;
  status: number;     // 1=enabled, 2=disabled
  quota: number;
  used_quota: number;
  /** 运营展示口径（企业成员为个人剩余/企业池剩余） */
  quota_display?: {
    is_org_member?: boolean;
    quota_limit?: number;
    personal_remaining?: number;
    pool_remaining?: number;
  };
  request_count: number;
  group: string;
  remark?: string;
  aff_code: string;
  inviter_id: number;
  created_at: number;
  /** 平台板块权限；GetSelf 未返回平铺 map 时由前端按 role 补齐 */
  permissions?: Partial<Record<PlatformPermission, boolean>>;
  /** GetSelf 遗留 sidebar 权限结构（sidebar_settings / sidebar_modules） */
  permissionsMeta?: Record<string, unknown>;
}

export interface ChannelTypeOption {
  value: number;
  label: string;
}

export interface Channel {
  id: number;
  name: string;
  type: number;
  key: string;
  base_url: string;
  models: string;
  model_mapping: string;
  status: number;     // 1=enabled, 2=disabled, 3=testing
  group: string;
  priority: number;
  weight: number;
  tag: string;
  test_time: number;
  response_time: number;
  balance: number;
  balance_updated_time: number;
  used_quota: number;
  created_at: number;
  created_time?: number;
  param_override?: string;
  settings?: string;
  material_settings?: string;
}

export interface Token {
  id: number;
  user_id: number;
  key: string;
  name: string;
  status: number;     // 1=enabled, 2=disabled, 3=expired, 4=exhausted
  quota: number;
  used_quota: number;
  remain_quota: number;
  unlimited_quota: boolean;
  expired_time: number;  // -1 = never
  created_at: number;
  /** 最后使用时间（unix 秒），后端字段 accessed_time */
  accessed_time?: number;
  models: string;
  group: string;
  self_selectable: boolean;
  default: boolean;
}

export interface DebugStreamEvent {
  id: number;
  user_id: number;
  username: string;
  channel_id: number;
  channel_name: string;
  model_name: string;
  token_name: string;
  type: number;
  prompt_tokens: number;
  completion_tokens: number;
  quota: number;
  content: string;
  duration?: number;
  use_time?: number;
  created_at: number;
  request_id?: string;
  ip?: string;
  group?: string;
  other?: string;
  is_stream?: boolean;
  token_id?: number;
}

export interface LogEntry {
  id: number;
  user_id: number;
  username: string;
  channel_id: number;
  channel_name: string;
  model_name: string;
  token_name: string;
  type: number;
  prompt_tokens: number;
  completion_tokens: number;
  cache_read?: number;
  quota: number;
  display_quota?: number;
  billing_breakdown?: string;
  balance_semantic?: string;
  balance?: number;
  content: string;
  duration?: number;
  use_time?: number;
  created_at: number;
  request_id?: string;
  upstream_request_id?: string;
  ip?: string;
  group?: string;
  is_stream?: boolean;
  token_id?: number;
}

export interface OrgBill {
  id: number;
  user_id: number;
  username: string;
  model_name: string;
  channel: number;
  channel_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  amount: number;
  created_at: number;
}

export interface Redemption {
  id: number;
  user_id: number;
  key: string;
  name: string;
  status: number;   // 1=unused, 2=disabled, 3=used
  expired_time?: number; // -1 = never, >0 = unix seconds
  quota: number;
  count: number;
  used_count: number;
  created_at: number;
  created_time?: number;
  redeemed_time: number;
}

/** 免费额度 / 赠送金。status: 0=生效中, 1=已用完, 2=已过期 */
export interface ComplimentaryQuota {
  id: number;
  user_id: number;
  amount: number;
  used: number;
  remain: number;
  status: number;
  source: string;
  operator_id: number;
  remark: string;
  expired_at?: number | null;
  /** 后端可能返回 unix 秒或 RFC3339 字符串 */
  created_at?: number | string;
  updated_at?: number | string;
}

export interface MyComplimentaryQuotasResponse {
  quotas: ComplimentaryQuota[];
  total_remain: number;
}

export interface GrantComplimentaryQuotaBody {
  user_id: number;
  amount: number;
  source?: string;
  remark?: string;
  expired_at?: number | null;
}

export interface UpdateComplimentaryQuotaBody {
  status?: number;
  remark?: string;
  expired_at?: number | null;
}

/** GET /api/lynx/config/footer、PUT /api/lynx/admin/site/footer（可改四处展示文案；跳转链接前端固定） */
export interface LynxSiteFooterConfig {
  copyright_text?: string;
  terms_label?: string;
  privacy_label?: string;
  beian_label?: string;
  brand_name_zh?: string;
  brand_name_en?: string;
  /** 与 appearance.footer_copyright_config.enabled 同源列 */
  footer_copyright_enabled?: boolean;
}

/** GET /api/lynx/config/object-storage */
export interface PublicObjectStorageConfig {
  configured?: boolean;
  provider?: string;
  region?: string;
  endpoint?: string;
  bucket?: string;
  bucket_domain?: string;
  public_url_host?: string;
  key_prefix?: string;
  public_url_host_template?: string;
  key_template_site_logo?: string;
  sample_public_url?: string;
}

/** GET /api/lynx/branding/logos 单项（字段名随服务端略有差异） */
export interface LynxSiteLogoPublic {
  file_id?: string;
  download_url?: string;
  original_name?: string;
  content_type?: string;
  size_bytes?: number;
  completed_at?: number;
  [key: string]: unknown;
}

export function resolveLynxLogoPublicUrl(row: LynxSiteLogoPublic | null | undefined): string | undefined {
  if (!row || typeof row !== 'object') return undefined;
  const o = row as Record<string, unknown>;
  for (const k of ['public_url', 'url', 'src', 'href', 'download_url']) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/** GET /api/lynx/branding/logos/themed 响应 */
export interface SiteLogosThemed {
  light: LynxSiteLogoPublic | null;
  dark: LynxSiteLogoPublic | null;
}

/** Header Logo：按主题取 light/dark；无配置则不展示 */
export function resolveThemedHeaderLogoUrl(
  theme: 'light' | 'dark',
  themed: SiteLogosThemed | null | undefined,
): string | undefined {
  const row = theme === 'dark' ? themed?.dark : themed?.light;
  return resolveLynxLogoPublicUrl(row ?? undefined);
}

/** @deprecated 请使用 resolveThemedHeaderLogoUrl */
export function resolveHeaderBrandingLogoUrl(
  siteLogos: LynxSiteLogoPublic[] | null | undefined,
  statusLogo: string | null | undefined,
): string | undefined {
  const fromStorage = resolveLynxLogoPublicUrl(siteLogos?.[0]);
  if (fromStorage) return fromStorage;
  const fromStatus = statusLogo?.trim();
  if (!fromStatus) return undefined;
  if (/^https?:\/\//i.test(fromStatus) || fromStatus.startsWith('/')) {
    return fromStatus;
  }
  return undefined;
}

/** POST /api/lynx/admin/site/logo/upload-init data */
export interface LynxStorageUploadInitData {
  bucket?: string;
  expires_in?: number;
  file_id?: string;
  headers?: Record<string, string>;
  method?: string;
  object_key?: string;
  upload_url?: string;
}

export interface StatusInfo {
  system_name: string;
  logo: string;
  version: string;
  footer_html: string;
  setup: boolean;
  email_verification: boolean;
  turnstile_check: boolean;
  turnstile_site_key: string;
  quota_per_unit: number;
  display_in_currency: boolean;
  /** 站点基础 URL（与文档 / 模型广场示例同源，对应 ServerAddress） */
  server_address?: string;
  // OAuth
  github_oauth: boolean;
  github_client_id: string;
  discord_oauth: boolean;
  discord_client_id: string;
  linuxdo_oauth: boolean;
  linuxdo_client_id: string;
  telegram_oauth: boolean;
  telegram_bot_name: string;
  wechat_login: boolean;
  wechat_qrcode: string;
  oidc_enabled: boolean;
  oidc_client_id: string;
  oidc_authorization_endpoint: string;
  // Currency
  custom_currency_symbol: string;
  custom_currency_exchange_rate: number;
}

// ──────────────────── LynxtonAPI 闭源类型 ────────────────────

export interface Organization {
  id: number;
  name: string;
  logo: string;
  owner_id: number;
  /** 企业创建者邮箱（GET /api/lynx/org/mine 由服务端解析） */
  email?: string;
  quota: number;
  used_quota: number;
  /** 企业总池剩余 = quota - used_quota，可为负 */
  pool_remaining?: number;
  status: number;       // 1=active 2=suspended
  settings: string;
  created_at: number;
  updated_at: number;
}

export interface OrgMember {
  id: number;
  org_id: number;
  user_id: number;
  role: string;          // owner/admin/member/viewer
  quota_limit: number;
  used_quota: number;
  /** 成员剩余配额（服务端 remaining_quota） */
  remaining_quota?: number;
  available_quota_limit?: number;
  status: number;        // 1=active 2=disabled
  created_at: number;
}

export interface CreditAccount {
  id: number;
  org_id: number;
  credit_limit: number;
  credit_used: number;
  billing_cycle: string;
  payment_terms: number;
  credit_level: string;
  status: string;
  contract_no: string;
  approved_by: number;
  approved_at: number;
  notes: string;
  created_at: number;
  updated_at: number;
}

export interface LogSummaryItem {
  summary_date: string;
  user_id: number;
  username: string;
  model_name: string;
  channel_id: number;
  channel_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  cache_read: number;
  request_count: number;
  quota: number;
}

export interface LogSummaryTotals {
  prompt_tokens: number;
  completion_tokens: number;
  cache_read: number;
  request_count: number;
  quota: number;
}

export interface LogSummaryListData {
  total: number;
  items: LogSummaryItem[];
  totals?: LogSummaryTotals;
}

export interface AuditLogEntry {
  id: number;
  user_id: number;
  username: string;
  org_id: number;
  action: string;
  resource: string;
  resource_id: string;
  detail: string;
  ip: string;
  user_agent: string;
  created_at: number;
}

export interface Plan {
  id: number;
  name: string;
  description: string;
  price: number;
  quota: number;
  duration: number;
  status: number;  // 1=上架 2=下架
  sort: number;
  /** 后台标记的推荐套餐，由后端返回 */
  recommended?: boolean;
  created_at: number;
}

export interface Subscription {
  id: number;
  user_id: number;
  plan_id: number;
  plan_name: string;
  quota: number;
  start_at: number;
  expire_at: number;
  status: string;  // active/expired/cancelled
  order_no: string;
  pay_amount: number;
  pay_method: string;
  created_at: number;
}

export interface AdminGroup {
  id: number;
  name: string;
  description: string;
  ratio: number;
  topup_ratio: number;
  user_selectable: boolean;
  auto_enabled: boolean;
  enabled: boolean;
  visible: boolean;
  cache_enabled: boolean;
  sort_order: number;
  priority: number;
  created_at?: string;
  updated_at?: string;
}

export interface Agent {
  id: number;
  user_id: number;
  level: string;        // silver/gold/diamond
  discount_rate: number;
  commission_rate: number;
  parent_agent_id: number;
  total_commission: number;
  pending_payout: number;
  settled_payout: number;
  sub_agent_count: number;
  sub_user_count: number;
  status: number;
  created_at: number;
}

export interface CommissionRecord {
  id: number;
  agent_id: number;
  source_uid: number;
  order_amount: number;
  commission: number;
  level: number;
  status: string;  // pending/settled/cancelled
  settled_at: number;
  created_at: number;
}

export interface CreditBill {
  id: number;
  org_id: number;
  account_id: number;
  bill_no: string;
  period_start: number;
  period_end: number;
  total_amount: number;
  status: string;  // pending/confirmed/paid/overdue
  due_date: number;
  paid_at: number;
  invoice_no: string;
  created_at: number;
}

export type DeployMode = 'domestic' | 'overseas';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
}

// ─── Billing ───
export interface UpstreamPriceRule {
  id: number;
  provider_id: number;
  provider_name: string;
  model_name: string;
  prompt_price_per_1k: number;
  completion_price_per_1k: number;
  currency: string;
  effective_from: number;
  effective_to: number;
  note: string;
  created_at: number;
}

export interface UpstreamInvoice {
  id: number;
  provider_id: number;
  provider_name: string;
  invoice_no: string;
  period_start: number;
  period_end: number;
  amount: number;
  currency: string;
  amount_usd: number;
  recon_status: string;  // pending / reconciled / disputed
  recon_diff_usd: number;
  imported_at: number;
}

export interface ReconciliationRecord {
  id: number;
  provider_id: number;
  provider_name: string;
  period_start: number;
  period_end: number;
  our_calls_count: number;
  our_total_tokens: number;
  our_cost_usd: number;
  invoice_id: number;
  provider_amount_usd: number;
  diff_usd: number;
  diff_pct: number;
  diff_reason: string;
  status: string;  // open / accepted / disputed
  resolved_at: number;
  note: string;
  created_at: number;
}

export interface SettlementBill {
  id: number;
  customer_id: number;
  customer_name: string;
  bill_no: string;
  period_start: number;
  period_end: number;
  total_calls: number;
  total_tokens: number;
  subtotal_usd: number;
  discount_usd: number;
  total_usd: number;
  status: string;  // draft / issued / paid / overdue
  issued_at: number;
  due_at: number;
  paid_at: number;
  paid_amount: number;
  created_at: number;
}
