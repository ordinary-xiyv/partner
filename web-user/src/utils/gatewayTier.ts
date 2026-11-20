export type ScopeType = 'platform' | 'org' | 'user' | 'group';
export type ChannelMatchType = 'any' | 'channel_id';
export type RuleType = 'input_tiered' | 'time_based';

export interface TierRow {
  from: number;
  to: number | null;
  input: number;
  cache: number;
  output: number;
}

export interface TimeWindowCondition {
  type: 'time_window';
  params: { start: string; end: string };
}

export interface WeekdayCondition {
  type: 'weekday';
  params: { days: number[] };
}

export type RuleCondition = TimeWindowCondition | WeekdayCondition;

export interface ConditionsFormState {
  timeStart: string;
  timeEnd: string;
  weekdays: number[];
}

export interface TierPriceRule {
  id: number;
  name: string;
  scope_type: ScopeType;
  scope_id: number;
  model_name: string;
  channel_match_type: ChannelMatchType;
  channel_ids: string;
  tiers: string;
  rule_type?: RuleType;
  conditions?: string;
  enabled: boolean;
  effective_from: number;
  effective_to: number;
  created_by?: number;
  created_at?: number;
  updated_at?: number;
}

export interface AppliedLayer {
  rule_id?: number;
  rule_name?: string;
  rule_type?: RuleType;
  multipliers?: { input?: number; cache?: number; output?: number };
}

export interface ChannelInfo {
  id: number;
  name: string;
  model: string;
}

export interface TierLedger {
  id: number;
  request_id: string;
  user_id: number;
  org_id: number;
  token_id: number;
  channel_id: number;
  model_name: string;
  rule_id: number;
  raw_quota: number;
  final_quota: number;
  request_input_tokens: number;
  matched_tier: number;
  tier_multipliers: string;
  applied_layers?: string;
  request_start_at?: number;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface DisabledRule {
  id: number;
  name: string;
}

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTiers(raw: string): TierRow[] {
  if (!raw?.trim()) return [];
  const parsed = JSON.parse(raw) as TierRow[];
  return Array.isArray(parsed) ? normalizeTierRows(parsed) : [];
}

export function parseChannelIds(raw: string): number[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0);
  } catch {
    return [];
  }
}

export function parseConditions(raw: string): RuleCondition[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as RuleCondition[] : [];
  } catch {
    return [];
  }
}

export function parseAppliedLayers(raw: string): AppliedLayer[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as AppliedLayer[] : [];
  } catch {
    return [];
  }
}

export function conditionsToFormState(conditions: RuleCondition[]): ConditionsFormState {
  const timeWindow = conditions.find((c): c is TimeWindowCondition => c.type === 'time_window');
  const weekday = conditions.find((c): c is WeekdayCondition => c.type === 'weekday');
  return {
    timeStart: timeWindow?.params.start ?? '',
    timeEnd: timeWindow?.params.end ?? '',
    weekdays: weekday?.params.days?.filter((d) => d >= 1 && d <= 7) ?? [],
  };
}

export function formStateToConditions(form: ConditionsFormState): RuleCondition[] {
  const result: RuleCondition[] = [
    { type: 'time_window', params: { start: form.timeStart, end: form.timeEnd } },
  ];
  if (form.weekdays.length > 0) {
    result.push({
      type: 'weekday',
      params: { days: [...form.weekdays].sort((a, b) => a - b) },
    });
  }
  return result;
}

export function defaultConditionsFormState(): ConditionsFormState {
  return { timeStart: '', timeEnd: '', weekdays: [] };
}

export function isValidHHMM(value: string): boolean {
  return HHMM_RE.test(value);
}

export const MULTIPLIER_DECIMAL_PLACES = 2;

export function roundMultiplier(value: number): number {
  const factor = 10 ** MULTIPLIER_DECIMAL_PLACES;
  return Math.round(value * factor) / factor;
}

export function normalizeMultiplier(value: number | null | undefined, fallback = 1): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  const rounded = roundMultiplier(value);
  return rounded > 0 ? rounded : fallback;
}

export function formatMultiplier(value: number): string {
  return roundMultiplier(value).toFixed(MULTIPLIER_DECIMAL_PLACES);
}

export function normalizeTierRows(tiers: TierRow[]): TierRow[] {
  return tiers.map((row) => ({
    ...row,
    input: normalizeMultiplier(row.input),
    cache: normalizeMultiplier(row.cache),
    output: normalizeMultiplier(row.output),
  }));
}

export function defaultTierRows(): TierRow[] {
  return [{ from: 0, to: null, input: 1, output: 1, cache: 1 }];
}

export function defaultTimeBasedTierRows(): TierRow[] {
  return defaultTierRows();
}

export function normalizeRuleType(value: unknown): RuleType {
  return value === 'time_based' ? 'time_based' : 'input_tiered';
}

export function validateTierMultipliers(tiers: TierRow[]): string | null {
  for (const t of tiers) {
    for (const key of ['input', 'cache', 'output'] as const) {
      const v = t[key];
      if (!(v > 0)) return 'gatewayTier.validation.multiplierRange';
      if (roundMultiplier(v) !== v) return 'gatewayTier.validation.multiplierDecimals';
    }
  }
  return null;
}

export function validateTiers(tiers: TierRow[]): string | null {
  if (tiers.length === 0) return 'gatewayTier.validation.tiersEmpty';
  if (tiers[0].from !== 0) return 'gatewayTier.validation.firstFromZero';
  for (let i = 0; i < tiers.length; i += 1) {
    const t = tiers[i];
    const last = i === tiers.length - 1;
    const multiplierErr = validateTierMultipliers([t]);
    if (multiplierErr) return multiplierErr;
    if (last) {
      if (t.to != null) return 'gatewayTier.validation.lastToNull';
      continue;
    }
    if (t.to == null) return 'gatewayTier.validation.midToRequired';
    if (t.to <= t.from) return 'gatewayTier.validation.toGtFrom';
    if (tiers[i + 1].from !== t.to) return 'gatewayTier.validation.tiersContinuous';
  }
  return null;
}

export function validateTimeBasedTiers(tiers: TierRow[]): string | null {
  if (tiers.length !== 1) return 'gatewayTier.validation.timeBasedSingleTier';
  const t = tiers[0];
  if (t.from !== 0 || t.to != null) return 'gatewayTier.validation.timeBasedTierBounds';
  return validateTierMultipliers(tiers);
}

export function validateConditionsForm(form: ConditionsFormState): string | null {
  if (!form.timeStart || !form.timeEnd) return 'gatewayTier.validation.timeWindowRequired';
  if (!isValidHHMM(form.timeStart) || !isValidHHMM(form.timeEnd)) {
    return 'gatewayTier.validation.timeWindowFormat';
  }
  if (form.timeStart === form.timeEnd) return 'gatewayTier.validation.timeWindowSame';
  for (const day of form.weekdays) {
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      return 'gatewayTier.validation.weekdayRange';
    }
  }
  return null;
}

const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** 时段区间 [start, end)，跨午夜拆成两段 */
export function timeWindowRanges(start: string, end: string): Array<[number, number]> {
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  if (s < e) return [[s, e]];
  if (s > e) return [[s, 1440], [0, e]];
  return [];
}

function minuteRangesOverlap(a: Array<[number, number]>, b: Array<[number, number]>): boolean {
  for (const [a0, a1] of a) {
    for (const [b0, b1] of b) {
      if (a0 < b1 && b0 < a1) return true;
    }
  }
  return false;
}

export function effectiveWeekdays(days: number[]): number[] {
  return days.length ? days : [...ALL_WEEKDAYS];
}

export function weekdaysOverlap(a: number[], b: number[]): boolean {
  const setA = new Set(effectiveWeekdays(a));
  return effectiveWeekdays(b).some((d) => setA.has(d));
}

export function timeWindowsOverlap(a: ConditionsFormState, b: ConditionsFormState): boolean {
  if (!a.timeStart || !a.timeEnd || !b.timeStart || !b.timeEnd) return false;
  if (!weekdaysOverlap(a.weekdays, b.weekdays)) return false;
  return minuteRangesOverlap(
    timeWindowRanges(a.timeStart, a.timeEnd),
    timeWindowRanges(b.timeStart, b.timeEnd),
  );
}

export function channelsOverlap(
  aType: ChannelMatchType,
  aIds: number[],
  bType: ChannelMatchType,
  bIds: number[],
): boolean {
  if (aType === 'any' || bType === 'any') return true;
  const setB = new Set(bIds);
  return aIds.some((id) => setB.has(id));
}

export function findOverlappingTimeBasedRules(
  conditions: ConditionsFormState,
  channelMatchType: ChannelMatchType,
  channelIds: number[],
  scopeId: number,
  candidates: TierPriceRule[],
  selfId = 0,
  /** 与后端禁旧一致：按 model_name 全等，避免列表 ILIKE 把大小写不同的模型搅在一起 */
  modelName = '',
): TierPriceRule[] {
  const exactModel = modelName.trim();
  return candidates.filter((r) => {
    if (r.id === selfId) return false;
    if (r.scope_id !== scopeId) return false;
    if (exactModel && (r.model_name || '').trim() !== exactModel) return false;
    if (normalizeRuleType(r.rule_type) !== 'time_based') return false;
    if (!r.enabled) return false;
    if (!channelsOverlap(
      channelMatchType,
      channelIds,
      r.channel_match_type || 'any',
      parseChannelIds(r.channel_ids),
    )) return false;
    const other = conditionsToFormState(parseConditions(r.conditions || ''));
    return timeWindowsOverlap(conditions, other);
  });
}

export function validateRuleForm(
  ruleType: RuleType,
  tiers: TierRow[],
  conditions: ConditionsFormState,
): string | null {
  if (ruleType === 'input_tiered') {
    return validateTiers(tiers);
  }
  const tierErr = validateTimeBasedTiers(tiers);
  if (tierErr) return tierErr;
  return validateConditionsForm(conditions);
}

export function formatTierSummary(tiers: TierRow[], ruleType: RuleType = 'input_tiered'): string {
  if (!tiers.length) return '-';
  if (ruleType === 'time_based' && tiers.length === 1) {
    const t = tiers[0];
    return `$${formatMultiplier(t.input)}/${formatMultiplier(t.cache)}/${formatMultiplier(t.output)} per M`;
  }
  return tiers
    .map((t, i) => {
      const upper = t.to == null ? '∞' : String(t.to);
      return `${i + 1}: [${t.from}, ${upper}) $${formatMultiplier(t.input)}/${formatMultiplier(t.cache)}/${formatMultiplier(t.output)} per M`;
    })
    .join(' · ');
}

export function formatConditionsSummary(
  raw: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const conditions = parseConditions(raw);
  if (!conditions.length) return '-';
  const parts: string[] = [];
  const timeWindow = conditions.find((c): c is TimeWindowCondition => c.type === 'time_window');
  const weekday = conditions.find((c): c is WeekdayCondition => c.type === 'weekday');
  if (timeWindow) {
    const { start, end } = timeWindow.params;
    const crossMidnight = start > end;
    parts.push(`${start}–${end}${crossMidnight ? `（${t('gatewayTier.conditionsSummary.crossMidnightSuffix')}）` : ''}`);
  }
  if (weekday?.params.days?.length) {
    const dayLabels = weekday.params.days
      .sort((a, b) => a - b)
      .map((d) => t(`gatewayTier.weekday.${d}`))
      .join('、');
    parts.push(dayLabels);
  } else if (timeWindow) {
    parts.push(t('gatewayTier.conditionsSummary.everyDay'));
  }
  return parts.join(' · ') || '-';
}

export function formatAppliedLayersSummary(raw: string): string {
  const layers = parseAppliedLayers(raw);
  if (!layers.length) return '-';
  return layers.map((layer) => {
    const name = layer.rule_name || (layer.rule_id != null ? `#${layer.rule_id}` : '-');
    const m = layer.multipliers;
    if (!m) return name;
    const parts = [
      m.input != null ? `in×${formatMultiplier(m.input)}` : null,
      m.cache != null ? `cache×${formatMultiplier(m.cache)}` : null,
      m.output != null ? `out×${formatMultiplier(m.output)}` : null,
    ].filter(Boolean);
    return parts.length ? `${name} (${parts.join(', ')})` : name;
  }).join(' · ');
}

export function ruleToFormState(rule: TierPriceRule | null): {
  name: string;
  scope_type: ScopeType;
  scope_id: number | undefined;
  model_name: string;
  channel_match_type: ChannelMatchType;
  channel_ids: number[];
  rule_type: RuleType;
  tiers: TierRow[];
  conditions: ConditionsFormState;
  enabled: boolean;
  effective_from: number;
  effective_to: number;
  permanent: boolean;
} {
  if (!rule) {
    return {
      name: '',
      scope_type: 'platform',
      scope_id: undefined,
      model_name: '',
      channel_match_type: 'any',
      channel_ids: [],
      rule_type: 'input_tiered',
      tiers: defaultTierRows(),
      conditions: defaultConditionsFormState(),
      enabled: true,
      effective_from: 0,
      effective_to: 0,
      permanent: true,
    };
  }
  const ruleType = normalizeRuleType(rule.rule_type);
  let tiers = ruleType === 'time_based' ? defaultTimeBasedTierRows() : defaultTierRows();
  try {
    const parsed = parseTiers(rule.tiers);
    if (parsed.length) tiers = parsed;
  } catch {
    tiers = ruleType === 'time_based' ? defaultTimeBasedTierRows() : defaultTierRows();
  }
  return {
    name: rule.name,
    scope_type: rule.scope_type,
    scope_id: rule.scope_type === 'platform' ? undefined : rule.scope_id,
    model_name: rule.model_name,
    channel_match_type: rule.channel_match_type || 'any',
    channel_ids: parseChannelIds(rule.channel_ids),
    rule_type: ruleType,
    tiers,
    conditions: conditionsToFormState(parseConditions(rule.conditions || '')),
    enabled: rule.enabled,
    effective_from: rule.effective_from,
    effective_to: rule.effective_to,
    permanent: !rule.effective_to,
  };
}

export function formStateToPayload(
  form: ReturnType<typeof ruleToFormState>,
  existing?: TierPriceRule,
): Record<string, unknown> {
  const scopeId = form.scope_type === 'platform' ? 0 : Number(form.scope_id || 0);
  const conditions = form.rule_type === 'time_based'
    ? JSON.stringify(formStateToConditions(form.conditions))
    : '';
  return {
    id: existing?.id ?? 0,
    name: form.name.trim(),
    scope_type: form.scope_type,
    scope_id: scopeId,
    model_name: form.model_name.trim(),
    channel_match_type: form.channel_match_type,
    channel_ids: form.channel_match_type === 'channel_id'
      ? JSON.stringify(form.channel_ids)
      : '',
    rule_type: form.rule_type,
    conditions,
    tiers: JSON.stringify(normalizeTierRows(form.tiers)),
    enabled: form.enabled,
    effective_from: form.effective_from > 0
      ? form.effective_from
      : Math.floor(Date.now() / 1000),
    effective_to: form.permanent ? 0 : (form.effective_to || 0),
    created_by: existing?.created_by ?? 0,
  };
}
