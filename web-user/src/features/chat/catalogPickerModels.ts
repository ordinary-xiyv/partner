import { getPricing } from '../../api';
import { fetchAllCatalogModels } from '../../api/catalog';
import type { PricingModelRow } from '../../components/model-picker/ComposerModelPicker';
import type { CatalogCardDTO } from '../../types/catalog';

/** catalog.category → 与定价 modalities 一致的过滤口径（无定价覆盖时的兜底） */
function catalogCategoryToModalities(category: string): string {
  const c = (category || '').toLowerCase();
  if (c === 'image') return 'image';
  if (c === 'video') return 'video';
  if (c === 'audio') return 'audio';
  return 'text';
}

type PricingApiRow = {
  model_name?: string;
  display_name?: string;
  modalities?: string;
  input_types?: string;
  model_img?: string;
};

function indexPricingByName(rows: PricingApiRow[]): Map<string, PricingApiRow> {
  const map = new Map<string, PricingApiRow>();
  for (const row of rows) {
    const name = (row.model_name || '').trim();
    if (!name) continue;
    map.set(name, row);
  }
  return map;
}

export function catalogCardToPickerRow(
  card: CatalogCardDTO,
  pricing?: PricingApiRow,
): PricingModelRow {
  const fromPricingMod = (pricing?.modalities || '').trim();
  return {
    model_name: card.name,
    display_name: (pricing?.display_name || '').trim() || card.name,
    // 优先模型定价里的输出类型（含 audio → 语音合成），否则用广场 category
    modalities: fromPricingMod || catalogCategoryToModalities(card.category),
    input_types: (pricing?.input_types || '').trim() || undefined,
    model_img: (pricing?.model_img || '').trim() || undefined,
    // 供应商 key：选择器据此在未配 model_img 时使用供应商 logo
    provider_key: (card.provider_key || '').trim() || undefined,
    usage_description: (card.usage_description || '').trim() || undefined,
  };
}

/**
 * 模型广场列表 + 模型定价覆盖。
 * 语音/视频/对话选择器均依赖 modalities；定价编辑「输出类型=audio」须能进语音合成页。
 */
export async function fetchCatalogPickerModels(): Promise<PricingModelRow[]> {
  const [items, pricingRes] = await Promise.all([
    fetchAllCatalogModels({ include_unavailable: false }),
    getPricing().catch(() => null),
  ]);

  const raw = pricingRes?.data?.data ?? pricingRes?.data;
  const pricingMap = indexPricingByName(Array.isArray(raw) ? (raw as PricingApiRow[]) : []);

  return items
    .map((card) => catalogCardToPickerRow(card, pricingMap.get(card.name)))
    .filter((row) => !!row.model_name.trim())
    .sort((a, b) => a.model_name.localeCompare(b.model_name, undefined, { sensitivity: 'base' }));
}
