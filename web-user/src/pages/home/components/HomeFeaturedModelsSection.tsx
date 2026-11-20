import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PROVIDER_AVATAR, PROVIDER_ICON } from '../constants/providerIcons';
import type { HomeFeaturedModel } from '../types';

interface HomeFeaturedModelsSectionProps {
  featuredModelsCount: number | null;
}

export function HomeFeaturedModelsSection({ featuredModelsCount }: HomeFeaturedModelsSectionProps) {
  const { t, i18n } = useTranslation();

  const featuredModels = useMemo<HomeFeaturedModel[]>(
    () => [
      { name: 'DeepSeek-V4 ', provider: 'DeepSeek', useCase: t('home.model1UseCase'), fit: t('home.model1Fit') },
      { name: 'GLM-5.1', provider: 'GLM', useCase: t('home.model2UseCase'), fit: t('home.model2Fit') },
    ],
    [t, i18n.language],
  );

  return (
    <div className="home-featured-stack">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'end', marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>{t('home.featuredModels')}</h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)', margin: 0 }}>
            {featuredModelsCount === null
              ? t('home.featuredModelsLoading')
              : t('home.featuredModelsDescDynamic', { count: featuredModelsCount })}
          </p>
        </div>
        <Link to="/models" className="home-inline-link">{t('home.viewAll')} <span>{'\u2197'}</span></Link>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {featuredModels.map((model) => {
          const Icon = PROVIDER_ICON[model.provider];
          const avatar = PROVIDER_AVATAR[model.provider];
          return (
            <div key={model.name} className="home-surface-card home-surface-card-soft">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: avatar.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={22} style={{ color: avatar.color }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{model.name}</div>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{model.provider}</div>
                </div>
              </div>
              <div className="home-model-meta">
                <div>
                  <div className="home-mini-label">{t('home.modelUseCase')}</div>
                  <div className="home-model-meta-value">{model.useCase}</div>
                </div>
                <div>
                  <div className="home-mini-label">{t('home.modelFit')}</div>
                  <div className="home-model-meta-value">{model.fit}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
