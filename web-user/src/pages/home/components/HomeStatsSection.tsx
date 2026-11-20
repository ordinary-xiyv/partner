import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModelCatalogStat } from '../types';

interface HomeStatsSectionProps {
  modelCatalogStat: ModelCatalogStat;
}

export function HomeStatsSection({ modelCatalogStat }: HomeStatsSectionProps) {
  const { t, i18n } = useTranslation();

  const stats = useMemo(() => {
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

  return (
    <section className="home-section-plate">
      <div className="landing-section" style={{ maxWidth: 1160, margin: '0 auto', padding: '0 40px 22px' }}>
        <div className="grid-3col stats-grid home-stats-wrap" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {stats.map((item) => (
            <div key={item.label} className="home-stat-card">
              <div className="home-stat-value">{item.value}</div>
              <div className="home-stat-label">{item.label}</div>
              <div className="home-stat-note">{item.note}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
