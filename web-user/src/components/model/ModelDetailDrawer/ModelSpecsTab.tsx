import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import GroupPricingIcon from '../../../assets/icons/svg/group-pricing-icon.svg?react';
import type { CatalogDetailDTO } from '../../../types/catalog';
import { ModelDetailScenarioPriceTable } from './ModelDetailScenarioPriceTable';
import { ModelDetailSpecInfo } from './ModelDetailSpecInfo';
import { pickPageScenarios, pickPageSpec, routeGroupLabel } from './specDisplayHelpers';

export function ModelSpecsTab({ detail }: { detail: CatalogDetailDTO }) {
  const { t } = useTranslation();
  const routeLabels = useMemo(() => detail.auto_group_route.filter(Boolean), [detail.auto_group_route]);
  const pageScenarios = useMemo(() => pickPageScenarios(detail.groups), [detail.groups]);
  const pageSpec = useMemo(() => pickPageSpec(detail.groups), [detail.groups]);

  if (detail.groups.length === 0) {
    return <p className="model-detail-empty-tab">{t('modelPlaza.noGroupPricing')}</p>;
  }

  return (
    <div className="model-detail-tab-content model-detail-specs">
      <div className="model-detail-specs__head">
        <span className="model-detail-specs__icon-wrap" aria-hidden>
          <GroupPricingIcon className="model-detail-specs__icon" />
        </span>
        <div>
          <h3 className="model-detail-specs__title">{t('modelsPricingInfo')}</h3>
        </div>
      </div>
      {pageScenarios.length > 0 ? (
        <ModelDetailScenarioPriceTable scenarios={pageScenarios} t={t} />
      ) : (
        <p className="model-detail-empty-tab">{t('modelPlaza.noGroupPricing')}</p>
      )}

      {pageSpec ? <ModelDetailSpecInfo spec={pageSpec} /> : null}
    </div>
  );
}
