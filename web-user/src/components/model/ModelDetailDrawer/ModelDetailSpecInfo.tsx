import { useTranslation } from 'react-i18next';
import ModelInfoIcon from '../../../assets/icons/svg/model-info-icon.svg?react';
import type { SpecDTO } from '../../../types/catalog';
import { buildSpecDisplayRows } from './specDisplayHelpers';

export function ModelDetailSpecInfo({ spec }: { spec: SpecDTO }) {
  const { t } = useTranslation();
  const rows = buildSpecDisplayRows(spec, t);
  if (rows.length === 0) return null;

  return (
    <section className="model-detail-spec-info">
      <div className="model-detail-spec-info__head">
        <span className="model-detail-spec-info__icon-wrap" aria-hidden>
          <ModelInfoIcon className="model-detail-spec-info__icon" />
        </span>
        <h4 className="model-detail-spec-info__title">{t('modelPlaza.modelInfoSection')}</h4>
      </div>
      <div className="model-detail-spec-info__body">
        {rows.map((row) => (
          <p key={row.key} className="model-detail-spec-info__line">
            <span className="model-detail-spec-info__label">{row.label}</span>
            <span className="model-detail-spec-info__value">{row.value}</span>
          </p>
        ))}
      </div>
    </section>
  );
}
