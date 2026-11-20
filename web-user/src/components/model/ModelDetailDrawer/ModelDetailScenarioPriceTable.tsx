import type { ScenarioDTO } from '../../../types/catalog';
import { getCurrencySymbol } from '../../../utils';
import { buildScenarioRowPriceDescItem } from './specDisplayHelpers';

type TranslateFn = (key: string) => string;

interface ScenarioPriceTableRow {
  key: string;
  scenarioLabel?: string;
  scenarioRowSpan?: number;
  dimensionLabel: string;
  currency: string;
  priceValue: string;
  unit: string;
}

function formatScenarioTablePriceValue(value: number): string {
  if (Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1) {
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
  }
  return value.toFixed(5);
}

function formatScenarioTablePriceUnit(displayUnit: string, rawUnit: string): string {
  const normalizedRaw = rawUnit.trim().toLowerCase();
  if (normalizedRaw === '1m_tokens') return '/1M Tokens';
  if (displayUnit === '/ 1M tokens') return '/1M Tokens';

  const compact = displayUnit.replace(/^\/\s*/, '/');
  if (compact.toLowerCase() === '/1m tokens') return '/1M Tokens';
  return compact;
}

function buildScenarioPriceTableRows(scenarios: ScenarioDTO[], t: TranslateFn): ScenarioPriceTableRow[] {
  const rows: ScenarioPriceTableRow[] = [];
  const sym = getCurrencySymbol();

  for (const scenario of scenarios) {
    const scenarioRows = scenario.rows ?? [];
    if (scenarioRows.length === 0) continue;

    const scenarioLabel = scenario.label.trim();
    scenarioRows.forEach((row, index) => {
      const priceItem = buildScenarioRowPriceDescItem(scenario, row, index, t);

      rows.push({
        key: priceItem.key,
        scenarioLabel: index === 0 ? scenarioLabel : undefined,
        scenarioRowSpan: index === 0 ? scenarioRows.length : undefined,
        dimensionLabel: row.label.trim() || '—',
        currency: sym,
        priceValue: formatScenarioTablePriceValue(row.value),
        unit: formatScenarioTablePriceUnit(priceItem.unit, row.unit),
      });
    });
  }

  return rows;
}

export function ModelDetailScenarioPriceTable({
  scenarios,
  t,
  showHeader = true,
}: {
  scenarios: ScenarioDTO[];
  t: TranslateFn;
  showHeader?: boolean;
}) {
  const rows = buildScenarioPriceTableRows(scenarios, t);
  if (rows.length === 0) return null;

  return (
    <div className="model-detail-scenario-price-table-wrap">
      <table className="model-detail-scenario-price-table">
        <colgroup>
          <col className="model-detail-scenario-price-table__col-scenario" />
          <col className="model-detail-scenario-price-table__col-dimension" />
          <col className="model-detail-scenario-price-table__col-price" />
        </colgroup>
        {showHeader ? (
          <thead>
            <tr>
              <th>{t('modelPlaza.colScenario')}</th>
              <th>{t('modelPlaza.colDimension')}</th>
              <th>{t('modelPlaza.colPrice')}</th>
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {row.scenarioLabel != null ? (
                <td
                  className="model-detail-scenario-price-table__scenario"
                  rowSpan={row.scenarioRowSpan}
                >
                  {row.scenarioLabel}
                </td>
              ) : null}
              <td className="model-detail-scenario-price-table__dimension">{row.dimensionLabel}</td>
              <td className="model-detail-scenario-price-table__price">
                <span className="model-detail-scenario-price-table__price-inner">
                  <span className="model-detail-scenario-price-table__currency">{row.currency}</span>
                  <span className="model-detail-scenario-price-table__value">{row.priceValue}</span>
                  {row.unit ? (
                    <span className="model-detail-scenario-price-table__unit">{row.unit}</span>
                  ) : null}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
