import type { GroupPricingDTO, ScenarioDTO, ScenarioRowDTO, SpecDTO } from '../../../types/catalog';
import { getCurrencySymbol } from '../../../utils';
import {
  formatModelSpecContextLength,
  formatPer1mPriceParts,
  formatUnitPriceParts,
} from './formatCatalogPrice';

type TranslateFn = (key: string) => string;

export function groupDisplayName(group: GroupPricingDTO, t: TranslateFn): string {
  const name = group.group_name?.trim();
  if (name) return name;
  return `${group.group} ${t('modelPlaza.groupSuffix')}`;
}

export function routeGroupLabel(routeKey: string, t: TranslateFn): string {
  const key = routeKey.trim();
  if (!key) return '';
  return `${key} ${t('modelPlaza.groupSuffix')}`;
}

export interface SpecDisplayRow {
  key: string;
  label: string;
  value: string;
}

export interface PriceDescItem {
  key: string;
  label: string;
  amount: string;
  unit: string;
  note?: string;
}

export function buildSpecDisplayRows(spec: SpecDTO, t: TranslateFn): SpecDisplayRow[] {
  const rows: SpecDisplayRow[] = [];
  const contextValue = formatModelSpecContextLength(spec.context_length);
  if (contextValue) {
    rows.push({
      key: 'context',
      label: t('modelPlaza.specContext'),
      value: contextValue,
    });
  }
  if (spec.rate_limit?.trim()) {
    rows.push({
      key: 'rate_limit',
      label: t('modelPlaza.specRateLimit'),
      value: spec.rate_limit.trim(),
    });
  }
  if (spec.release_date?.trim()) {
    rows.push({
      key: 'release_date',
      label: t('modelPlaza.specRelease'),
      value: spec.release_date.trim(),
    });
  }
  return rows;
}

export function hasSpecInfo(spec?: SpecDTO | null): boolean {
  if (!spec) return false;
  return buildSpecDisplayRows(spec, () => '').length > 0;
}

/** 详情页只展示一份模型信息：优先 default 分组，否则取首个有效 spec */
export function pickPageSpec(groups: GroupPricingDTO[]): SpecDTO | null {
  const defaultGroup = groups.find((g) => g.group === 'default' && hasSpecInfo(g.spec));
  if (defaultGroup?.spec) return defaultGroup.spec;

  const firstWithSpec = groups.find((g) => hasSpecInfo(g.spec));
  return firstWithSpec?.spec ?? null;
}

/** 详情页只展示一张价格表：仅取 scenarios，优先 default 分组 */
export function pickPageScenarios(groups: GroupPricingDTO[]): ScenarioDTO[] {
  const defaultGroup = groups.find((g) => g.group === 'default' && hasScenarioPricing(g));
  if (defaultGroup?.scenarios?.length) return defaultGroup.scenarios;

  const firstWithScenarios = groups.find((g) => hasScenarioPricing(g));
  return firstWithScenarios?.scenarios ?? [];
}

export function buildPriceDescriptionItems(group: GroupPricingDTO, t: TranslateFn): PriceDescItem[] {
  const { prices } = group;
  const isToken = group.pricing_type === 'token';

  if (isToken) {
    const items: PriceDescItem[] = [];
    if (prices.input_per_1m != null) {
      const p = formatPer1mPriceParts(prices.input_per_1m);
      items.push({ key: 'input', label: t('modelPlaza.priceInput'), amount: p.amount, unit: p.unit });
    }
    if (prices.output_per_1m != null) {
      const p = formatPer1mPriceParts(prices.output_per_1m);
      items.push({ key: 'output', label: t('modelPlaza.priceOutput'), amount: p.amount, unit: p.unit });
    }
    if (prices.cache_write_per_1m != null) {
      const p = formatPer1mPriceParts(prices.cache_write_per_1m);
      items.push({
        key: 'cache_write',
        label: t('modelPlaza.priceCacheWrite'),
        amount: p.amount,
        unit: p.unit,
      });
    }
    if (prices.cache_read_per_1m != null) {
      const p = formatPer1mPriceParts(prices.cache_read_per_1m);
      items.push({
        key: 'cache_read',
        label: t('modelPlaza.priceCacheRead'),
        amount: p.amount,
        unit: p.unit,
      });
    }
    return items;
  }

  if (prices.unit_price != null) {
    const p = formatUnitPriceParts(prices.unit_price, group.unit, t);
    const sym = getCurrencySymbol();
    const amount = p.amount !== '—' ? `${sym}${p.amount}` : p.amount;
    return [{ key: 'unit', label: t('modelPlaza.priceUnit'), amount, unit: p.unit }];
  }

  return [];
}

/** 特殊价格：value 已由后端按分组倍率换算，前端只做格式化 */
export function buildExtraPriceDescriptionItems(group: GroupPricingDTO, t: TranslateFn): PriceDescItem[] {
  const extras = group.extra_prices ?? [];
  if (extras.length === 0) return [];

  const sym = getCurrencySymbol();
  return extras.map((item) => {
    const unitKey = item.unit.trim();
    const isPer1m = unitKey === '1M_tokens' || unitKey.toLowerCase() === '1m_tokens';

    if (isPer1m) {
      const p = formatPer1mPriceParts(item.value);
      return {
        key: item.key,
        label: item.label,
        amount: p.amount,
        unit: p.unit,
        note: item.note?.trim() || undefined,
      };
    }

    const p = formatUnitPriceParts(item.value, unitKey, t);
    const amount = p.amount !== '—' ? `${sym}${p.amount}` : p.amount;
    return {
      key: item.key,
      label: item.label,
      amount,
      unit: p.unit,
      note: item.note?.trim() || undefined,
    };
  });
}

export function hasExtraPriceGrid(group: GroupPricingDTO): boolean {
  return (group.extra_prices?.length ?? 0) > 0;
}

export function hasTokenPriceGrid(prices: GroupPricingDTO['prices']): boolean {
  return (
    prices.input_per_1m != null ||
    prices.output_per_1m != null ||
    prices.cache_read_per_1m != null ||
    prices.cache_write_per_1m != null
  );
}

/** 取列表卡片展示档：card=true 的首个场景，无则取第一个 */
export function pickCardScenario(scenarios?: ScenarioDTO[]): ScenarioDTO | null {
  if (!scenarios?.length) return null;
  const marked = scenarios.find((s) => s.card);
  return marked ?? scenarios[0];
}

function isPer1mScenarioUnit(unit: string): boolean {
  return unit.trim().toLowerCase() === '1m_tokens';
}

function scenarioRowKey(scenario: ScenarioDTO, row: ScenarioRowDTO, index: number): string {
  const base = scenario.key?.trim() || scenario.label.trim() || 'scenario';
  const rowLabel = row.label.trim() || String(index);
  return `${base}-${rowLabel}-${index}`;
}

export function buildScenarioRowPriceDescItem(
  scenario: ScenarioDTO,
  row: ScenarioRowDTO,
  index: number,
  t: TranslateFn,
): PriceDescItem {
  const key = scenarioRowKey(scenario, row, index);
  const label = row.label.trim();
  const note = row.note?.trim() || undefined;

  if (isPer1mScenarioUnit(row.unit)) {
    const p = formatPer1mPriceParts(row.value);
    return { key, label, amount: p.amount, unit: p.unit, note };
  }

  const p = formatUnitPriceParts(row.value, row.unit, t);
  const sym = getCurrencySymbol();
  const amount = p.amount !== '—' ? `${sym}${p.amount}` : p.amount;
  return { key, label, amount, unit: p.unit, note };
}

export function buildScenarioPriceDescriptionItems(scenario: ScenarioDTO, t: TranslateFn): PriceDescItem[] {
  return scenario.rows.map((row, index) => buildScenarioRowPriceDescItem(scenario, row, index, t));
}

export function buildCardScenarioPriceItems(group: GroupPricingDTO, t: TranslateFn): PriceDescItem[] {
  const scenario = pickCardScenario(group.scenarios);
  if (!scenario?.rows?.length) return [];
  return buildScenarioPriceDescriptionItems(scenario, t);
}

export function hasScenarioPricing(group: GroupPricingDTO): boolean {
  return (group.scenarios?.some((s) => (s.rows?.length ?? 0) > 0) ?? false);
}

/** 详情摘要：展示全部场景下的所有价格行 */
export function buildAllScenariosPriceSummaryLines(
  group: GroupPricingDTO,
  t: TranslateFn,
): Array<{ key: string; label: string; amount?: string; unit?: string }> {
  const scenarios = group.scenarios ?? [];
  if (!scenarios.length) return [];

  const sym = getCurrencySymbol();
  const multiScenario = scenarios.length > 1;
  const lines: Array<{ key: string; label: string; amount?: string; unit?: string }> = [];

  for (const scenario of scenarios) {
    const scenarioLabel = scenario.label.trim();
    const items = buildScenarioPriceDescriptionItems(scenario, t);
    for (const item of items) {
      const amount =
        item.amount !== '—' && !item.amount.startsWith(sym) ? `${sym}${item.amount}` : item.amount;
      const rowLabel = multiScenario && scenarioLabel ? `${scenarioLabel} · ${item.label}` : item.label;
      lines.push({
        key: item.key,
        label: rowLabel,
        amount,
        unit: item.unit,
      });
    }
  }

  return lines;
}

export function hasCardScenarioPricing(group: GroupPricingDTO): boolean {
  const scenario = pickCardScenario(group.scenarios);
  return (scenario?.rows?.length ?? 0) > 0;
}

export function initialExpandedGroups(groups: GroupPricingDTO[]): Set<string> {
  const expanded = new Set<string>();
  for (const g of groups) {
    if (g.collapsed === false) expanded.add(g.group);
  }
  if (expanded.size === 0 && groups[0]) {
    expanded.add(groups[0].group);
  }
  return expanded;
}
