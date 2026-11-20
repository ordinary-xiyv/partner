import { Fragment } from 'react';
import type { PriceDescItem } from './specDisplayHelpers';

function chunkRows(items: PriceDescItem[]): PriceDescItem[][] {
  const rows: PriceDescItem[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2));
  }
  return rows;
}

export function ModelDetailPriceGrid({ items }: { items: PriceDescItem[] }) {
  const rows = chunkRows(items);

  return (
    <div className="model-detail-price-grid">
      {rows.map((row, rowIndex) => (
        <Fragment key={rowIndex}>
          {rowIndex > 0 ? <div className="model-detail-price-grid__divider" aria-hidden /> : null}
          <div className="model-detail-price-grid__row">
            {row.map((item) => (
              <div key={item.key} className="model-detail-price-grid__cell">
                <div className="model-detail-price-grid__headline">
                  <span className="model-detail-price-grid__label">{item.label}</span>
                  <span className="model-detail-price-grid__amount">{item.amount}</span>
                </div>
                {item.unit ? <div className="model-detail-price-grid__unit">{item.unit}</div> : null}
                {item.note ? <div className="model-detail-price-grid__note">{item.note}</div> : null}
              </div>
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
