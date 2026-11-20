import { useTranslation } from 'react-i18next';
import { CORE_FEATURE_PROVIDERS, PROVIDER_AVATAR, PROVIDER_ICON } from '../constants/providerIcons';
import { HomeCubeThumb } from './shared/HomeCubeThumb';

export function FeatureModelAccessVisual() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {CORE_FEATURE_PROVIDERS.map((name) => {
        const Icon = PROVIDER_ICON[name];
        const av = PROVIDER_AVATAR[name];
        return (
          <div
            key={name}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: av.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={20} style={{ color: av.color }} />
          </div>
        );
      })}
    </div>
  );
}

export function FeatureModelAccessDecor() {
  return (
    <div className="home-features-bento__decor">
      <HomeCubeThumb size={112} />
    </div>
  );
}

export function FeatureRoutingVisual() {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-tertiary)' }}>
        <span>{t('home.routePrimary')}</span>
        <span>{t('home.routeFailover')}</span>
        <span>{t('home.routeFallback')}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="home-mini-pill">gpt-4o</div>
        <div className="home-mini-line" />
        <div className="home-mini-pill">claude</div>
        <div className="home-mini-line" />
        <div className="home-mini-pill">deepseek</div>
      </div>
    </div>
  );
}

export function FeatureBillingVisual() {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="home-mini-label">{t('home.costLabel')}</span>
        <span className="home-mini-value">¥12,840</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-base)', overflow: 'hidden' }}>
        <div style={{ width: '72%', height: '100%', background: 'linear-gradient(90deg, #2F54EB, #10A37F)' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className="home-mini-pill">{t('home.costTag1')}</span>
        <span className="home-mini-pill">{t('home.costTag2')}</span>
      </div>
    </div>
  );
}
