import type {
  AdminCatalogModel,
  CatalogBillingUnit,
  CatalogCategory,
  CatalogExtraPriceInput,
  CatalogExtraPriceUnit,
  CatalogKind,
  CatalogPriceScenarioInput,
  CatalogPriceScenarioRowInput,
  CatalogScenarioUnit,
} from '../types/catalog-admin';

export const CATALOG_CATEGORY_OPTIONS: { value: CatalogCategory; labelKey: string }[] = [
  { value: 'llm', labelKey: 'catalog.category.llm' },
  { value: 'audio', labelKey: 'catalog.category.audio' },
  { value: 'image', labelKey: 'catalog.category.image' },
  { value: 'video', labelKey: 'catalog.category.video' },
  { value: 'embedding', labelKey: 'catalog.category.embedding' },
];

export const CATALOG_BILLING_UNIT_OPTIONS: { value: CatalogBillingUnit; labelKey: string }[] = [
  { value: 'token', labelKey: 'catalog.billingUnit.token' },
  { value: 'request', labelKey: 'catalog.billingUnit.request' },
  { value: 'second', labelKey: 'catalog.billingUnit.second' },
  { value: 'image', labelKey: 'catalog.billingUnit.image' },
];

export const CATALOG_FREE_QUOTA_UNIT_OPTIONS = [
  { value: '', labelKey: 'catalog.freeQuotaUnit.none' },
  { value: 'quota', labelKey: 'catalog.freeQuotaUnit.quota' },
  { value: 'tokens', labelKey: 'catalog.freeQuotaUnit.tokens' },
  { value: 'calls', labelKey: 'catalog.freeQuotaUnit.calls' },
] as const;

export const CATALOG_KIND_OPTIONS: { value: CatalogKind; labelKey: string }[] = [
  { value: 'direct', labelKey: 'catalog.kind.direct' },
  { value: 'alias', labelKey: 'catalog.kind.alias' },
];

export function normalizeCatalogKind(raw?: string): CatalogKind {
  return raw === 'alias' ? 'alias' : 'direct';
}

export function normalizeReleaseDateForApi(value: string | undefined | null): string | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  return s;
}

export const CATALOG_EXTRA_PRICE_UNIT_OPTIONS: { value: CatalogExtraPriceUnit; labelKey: string }[] = [
  { value: '1M_tokens', labelKey: 'catalog.extraPriceUnit.1M_tokens' },
  { value: 'request', labelKey: 'catalog.extraPriceUnit.request' },
  { value: 'second', labelKey: 'catalog.extraPriceUnit.second' },
  { value: 'image', labelKey: 'catalog.extraPriceUnit.image' },
];

export const CATALOG_EXTRA_PRICE_TYPE_CUSTOM = '__custom__';

/** 后端便捷字段 input_price_with_video 对应的 extra price key */
export const EXTRA_PRICE_INPUT_VIDEO_KEY = 'input_video';

export const CATALOG_EXTRA_PRICE_KEY_OPTIONS: {
  value: string;
  labelKey: string;
  defaultUnit: CatalogExtraPriceUnit;
}[] = [
  { value: 'input_video', labelKey: 'catalog.extraPriceKey.input_video', defaultUnit: '1M_tokens' },
  { value: 'input_audio', labelKey: 'catalog.extraPriceKey.input_audio', defaultUnit: '1M_tokens' },
  { value: 'web_search', labelKey: 'catalog.extraPriceKey.web_search', defaultUnit: 'request' },
  { value: 'file_input', labelKey: 'catalog.extraPriceKey.file_input', defaultUnit: '1M_tokens' },
];

const KNOWN_EXTRA_PRICE_KEYS = new Set(CATALOG_EXTRA_PRICE_KEY_OPTIONS.map((o) => o.value));

export function isKnownExtraPriceKey(key: string): boolean {
  return KNOWN_EXTRA_PRICE_KEYS.has(key.trim());
}

export function findExtraPricePreset(key: string) {
  return CATALOG_EXTRA_PRICE_KEY_OPTIONS.find((o) => o.value === key.trim());
}

function mapExtraPriceRow(item: Partial<CatalogExtraPriceInput>): CatalogExtraPriceInput {
  return {
    key: item.key?.trim() ?? '',
    label: item.label?.trim() ?? '',
    value: typeof item.value === 'number' && !Number.isNaN(item.value) ? item.value : 0,
    unit: item.unit?.trim() || '1M_tokens',
    note: item.note?.trim() ?? '',
  };
}

/** 管理端回显：兼容 extra_prices 为 JSON 字符串或结构化数组 */
export function normalizeExtraPricesForForm(
  raw: CatalogExtraPriceInput[] | string | undefined | null,
): CatalogExtraPriceInput[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(mapExtraPriceRow);
  }
  const text = raw.trim();
  if (!text || text === '[]') return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => mapExtraPriceRow(item as Partial<CatalogExtraPriceInput>));
  } catch {
    return [];
  }
}

/**
 * 回显时合并 input_price_with_video 与 extra_prices，避免表单出现两处「输入含视频」配置。
 */
export function mergeExtraPricesForForm(
  raw: CatalogExtraPriceInput[] | string | undefined | null,
  inputPriceWithVideo?: number,
  defaultInputVideoLabel = '',
): CatalogExtraPriceInput[] {
  const items = normalizeExtraPricesForForm(raw);
  const hasInputVideo = items.some((i) => i.key.trim() === EXTRA_PRICE_INPUT_VIDEO_KEY);
  if (hasInputVideo || !(inputPriceWithVideo ?? 0)) {
    return items;
  }
  return [
    {
      key: EXTRA_PRICE_INPUT_VIDEO_KEY,
      label: defaultInputVideoLabel,
      value: inputPriceWithVideo!,
      unit: '1M_tokens',
      note: '',
    },
    ...items,
  ];
}

function isSimpleInputVideoRow(item: CatalogExtraPriceInput, defaultLabel: string): boolean {
  const label = item.label.trim();
  return (
    item.unit.trim() === '1M_tokens' &&
    !item.note?.trim() &&
    (!label || label === defaultLabel.trim())
  );
}

/** 提交时：简单「输入含视频」走 input_price_with_video，其余走 extra_prices */
export function buildExtraPricesAdminPayload(
  items: CatalogExtraPriceInput[],
  defaultInputVideoLabel: string,
): { input_price_with_video: number; extra_prices: CatalogExtraPriceInput[] } {
  const inputVideoRow = items.find((i) => i.key.trim() === EXTRA_PRICE_INPUT_VIDEO_KEY);
  const others = items.filter((i) => i.key.trim() !== EXTRA_PRICE_INPUT_VIDEO_KEY);
  const extra_prices = buildExtraPricesPayload(others);

  if (
    !inputVideoRow ||
    inputVideoRow.value <= 0 ||
    !inputVideoRow.key.trim() ||
    !inputVideoRow.label.trim()
  ) {
    return { input_price_with_video: 0, extra_prices };
  }

  if (isSimpleInputVideoRow(inputVideoRow, defaultInputVideoLabel)) {
    return { input_price_with_video: inputVideoRow.value, extra_prices };
  }

  return {
    input_price_with_video: 0,
    extra_prices: [...buildExtraPricesPayload([inputVideoRow]), ...extra_prices],
  };
}

export function buildExtraPricesPayload(items: CatalogExtraPriceInput[]): CatalogExtraPriceInput[] {
  return items
    .filter((item) => item.key.trim() && item.label.trim() && item.value > 0)
    .map((item) => ({
      key: item.key.trim(),
      label: item.label.trim(),
      value: item.value,
      unit: item.unit.trim(),
      ...(item.note?.trim() ? { note: item.note.trim() } : {}),
    }));
}

export function validateExtraPriceInputs(
  items: CatalogExtraPriceInput[],
  t: (key: string, opts?: Record<string, string>) => string,
): string | null {
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.key.trim();
    const label = item.label.trim();
    const hasContent = key || label || item.value > 0 || item.note?.trim();
    if (!hasContent) continue;
    if (!key) return t('catalog.extraPriceKeyRequired');
    if (!label) return t('catalog.extraPriceLabelRequired');
    if (seen.has(key)) {
      const preset = findExtraPricePreset(key);
      const label = preset ? t(preset.labelKey) : key;
      return t('catalog.extraPriceDuplicateKey', { key: label });
    }
    seen.add(key);
  }
  return null;
}

export const CATALOG_SCENARIO_UNIT_OPTIONS: { value: CatalogScenarioUnit; labelKey: string }[] = [
  ...CATALOG_EXTRA_PRICE_UNIT_OPTIONS,
  { value: 'token', labelKey: 'catalog.scenarioUnit.token' },
];

const VALID_SCENARIO_UNITS = new Set(CATALOG_SCENARIO_UNIT_OPTIONS.map((o) => o.value));

const MAX_PRICE_SCENARIOS = 20;
const MAX_PRICE_SCENARIO_ROWS = 20;

function mapPriceScenarioRow(item: Partial<CatalogPriceScenarioRowInput>): CatalogPriceScenarioRowInput {
  return {
    label: item.label?.trim() ?? '',
    value: typeof item.value === 'number' && !Number.isNaN(item.value) ? item.value : 0,
    unit: (item.unit?.trim() || '1M_tokens') as CatalogScenarioUnit,
    note: item.note?.trim() ?? '',
  };
}

function mapPriceScenario(item: Partial<CatalogPriceScenarioInput>): CatalogPriceScenarioInput {
  const rows = Array.isArray(item.rows) ? item.rows.map(mapPriceScenarioRow) : [];
  return {
    key: item.key?.trim() ?? '',
    label: item.label?.trim() ?? '',
    note: item.note?.trim() ?? '',
    card: !!item.card,
    rows,
  };
}

/** 管理端回显：兼容 price_scenarios 为 JSON 字符串或结构化数组 */
export function normalizePriceScenariosForForm(
  raw: CatalogPriceScenarioInput[] | string | undefined | null,
): CatalogPriceScenarioInput[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(mapPriceScenario);
  }
  const text = raw.trim();
  if (!text || text === '[]') return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => mapPriceScenario(item as Partial<CatalogPriceScenarioInput>));
  } catch {
    return [];
  }
}

function scenarioRowHasContent(row: CatalogPriceScenarioRowInput): boolean {
  return !!(row.label.trim() || row.note?.trim() || row.value > 0);
}

function scenarioHasContent(scenario: CatalogPriceScenarioInput): boolean {
  return !!(
    scenario.label.trim() ||
    scenario.note?.trim() ||
    scenario.key?.trim() ||
    scenario.card ||
    scenario.rows.some(scenarioRowHasContent)
  );
}

/** price_scenarios 为空时，用旧 catalog 价字段拼默认场景供表单编辑 */
export function legacyPriceScenariosForForm(
  model: AdminCatalogModel,
  defaultScenarioLabel: string,
): CatalogPriceScenarioInput[] {
  const rows: CatalogPriceScenarioRowInput[] = [];
  const billingUnit = model.billing_unit || 'token';

  if (billingUnit === 'token') {
    if ((model.input_price ?? 0) > 0) {
      rows.push({ label: '输入', value: model.input_price, unit: '1M_tokens', note: '' });
    }
    if ((model.output_price ?? 0) > 0) {
      rows.push({ label: '输出', value: model.output_price, unit: '1M_tokens', note: '' });
    }
    if ((model.cache_input_price ?? 0) > 0) {
      rows.push({ label: '缓存读取', value: model.cache_input_price!, unit: '1M_tokens', note: '' });
    }
    if ((model.cache_creation_price ?? 0) > 0) {
      rows.push({ label: '缓存写入', value: model.cache_creation_price!, unit: '1M_tokens', note: '' });
    }
  } else {
    const unitPrice = (model.unit_price ?? 0) > 0 ? model.unit_price! : model.per_request_price ?? 0;
    if (unitPrice > 0) {
      const unit: CatalogScenarioUnit =
        billingUnit === 'second' ? 'second' : billingUnit === 'image' ? 'image' : 'request';
      rows.push({ label: '单价', value: unitPrice, unit, note: '' });
    }
  }

  const extras = mergeExtraPricesForForm(model.extra_prices, model.input_price_with_video, '输入含视频');
  for (const ep of extras) {
    if (ep.value > 0 && ep.label.trim()) {
      rows.push({
        label: ep.label.trim(),
        value: ep.value,
        unit: (ep.unit.trim() || '1M_tokens') as CatalogScenarioUnit,
        note: ep.note?.trim() ?? '',
      });
    }
  }

  if (rows.length === 0) return [];

  return [
    {
      key: 'standard',
      label: defaultScenarioLabel,
      note: '',
      card: true,
      rows,
    },
  ];
}

/** 回显：优先 price_scenarios，否则旧字段兜底 */
export function mergePriceScenariosForForm(
  model: AdminCatalogModel,
  defaultScenarioLabel: string,
): CatalogPriceScenarioInput[] {
  const parsed = normalizePriceScenariosForForm(model.price_scenarios);
  if (parsed.length > 0) return parsed;
  return legacyPriceScenariosForForm(model, defaultScenarioLabel);
}

export function buildPriceScenariosPayload(
  items: CatalogPriceScenarioInput[],
): CatalogPriceScenarioInput[] | '' {
  const scenarios = items
    .filter(scenarioHasContent)
    .map((scenario) => {
      const rows = scenario.rows
        .filter((row) => row.label.trim())
        .map((row) => ({
          label: row.label.trim(),
          value: typeof row.value === 'number' && !Number.isNaN(row.value) ? row.value : 0,
          unit: row.unit.trim() || '1M_tokens',
          ...(row.note?.trim() ? { note: row.note.trim() } : {}),
        }));
      const out: CatalogPriceScenarioInput = {
        label: scenario.label.trim(),
        rows,
      };
      if (scenario.key?.trim()) out.key = scenario.key.trim();
      if (scenario.note?.trim()) out.note = scenario.note.trim();
      if (scenario.card) out.card = true;
      return out;
    })
    .filter((scenario) => scenario.label && scenario.rows.length > 0);

  return scenarios.length > 0 ? scenarios : '';
}

export function validatePriceScenarioInputs(
  items: CatalogPriceScenarioInput[],
  t: (key: string, opts?: Record<string, string>) => string,
): string | null {
  const active = items.filter(scenarioHasContent);
  if (active.length > MAX_PRICE_SCENARIOS) {
    return t('catalog.priceScenarioMaxScenarios', { max: String(MAX_PRICE_SCENARIOS) });
  }

  let cardCount = 0;
  for (const scenario of active) {
    if (!scenario.label.trim()) {
      return t('catalog.priceScenarioLabelRequired');
    }
    if (scenario.card) cardCount += 1;
    const rows = scenario.rows.filter(scenarioRowHasContent);
    if (rows.length === 0) {
      return t('catalog.priceScenarioRowsRequired', { label: scenario.label.trim() });
    }
    if (rows.length > MAX_PRICE_SCENARIO_ROWS) {
      return t('catalog.priceScenarioMaxRows', {
        label: scenario.label.trim(),
        max: String(MAX_PRICE_SCENARIO_ROWS),
      });
    }
    for (const row of rows) {
      if (!row.label.trim()) {
        return t('catalog.priceScenarioRowLabelRequired', { label: scenario.label.trim() });
      }
      if (row.value < 0) {
        return t('catalog.priceScenarioRowValueNegative', {
          scenario: scenario.label.trim(),
          row: row.label.trim(),
        });
      }
      if (!VALID_SCENARIO_UNITS.has(row.unit.trim() as CatalogScenarioUnit)) {
        return t('catalog.priceScenarioRowUnitInvalid', {
          scenario: scenario.label.trim(),
          row: row.label.trim(),
        });
      }
    }
  }

  if (cardCount > 1) {
    return t('catalog.priceScenarioCardLimit');
  }
  return null;
}

export function createEmptyPriceScenarioRow(): CatalogPriceScenarioRowInput {
  return { label: '', value: 0, unit: '1M_tokens', note: '' };
}

export function createEmptyPriceScenario(): CatalogPriceScenarioInput {
  return {
    key: '',
    label: '',
    note: '',
    card: false,
    rows: [createEmptyPriceScenarioRow()],
  };
}
