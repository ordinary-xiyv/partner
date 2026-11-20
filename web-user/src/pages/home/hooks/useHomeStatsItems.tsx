import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { HomeStatItem, ModelCatalogStat } from '../types';

export function useHomeStatsItems(modelCatalogStat: ModelCatalogStat): HomeStatItem[] {
  const { t, i18n } = useTranslation();

  return useMemo(() => {
    const modelValue =
      modelCatalogStat.phase === 'loading' ? (
        <span className="home-stat-value-skeleton" role="status" aria-label={t('home.statsModelsLoading')} />
      ) : modelCatalogStat.phase === 'error' ? (
        '100+'
      ) : (
        `${modelCatalogStat.count}+`
      );

    return [
      { value: modelValue, label: t('home.statsModels'), note: t('home.statsModelsNote') },
      { value: '50+', label: t('home.statsProviders'), note: t('home.statsProvidersNote') },
      { value: '99.9%', label: t('home.statsUptime'), note: t('home.statsUptimeNote') },
    ];
  }, [modelCatalogStat, t, i18n.language]);
}
