import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CORE_FEATURE_PROVIDERS, PROVIDER_AVATAR, PROVIDER_ICON } from '../constants/providerIcons';

export function HomeCoreFeaturesSection() {
  const { t, i18n } = useTranslation();

  const highlights = useMemo(
    () => [
      {
        title: t('home.feature1Title'),
        desc: t('home.feature1Desc'),
        cta: t('home.feature1Cta'),
        to: '/models',
        visual: (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {CORE_FEATURE_PROVIDERS.map((name) => {
              const Icon = PROVIDER_ICON[name];
              const av = PROVIDER_AVATAR[name];
              return (
                <div key={name} style={{ width: 38, height: 38, borderRadius: 12, background: av.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} style={{ color: av.color }} />
                </div>
              );
            })}
          </div>
        ),
      },
      {
        title: t('home.feature2Title'),
        desc: t('home.feature2Desc'),
        cta: t('home.feature2Cta'),
        to: '/docs',
        visual: (
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
        ),
      },
      {
        title: t('home.feature3Title'),
        desc: t('home.feature3Desc'),
        cta: t('home.feature3Cta'),
        to: '/pricing',
        visual: (
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
        ),
      },
    ],
    [t, i18n.language],
  );

  return (
    <section className="home-section-plate">
      <div className="landing-section home-core-shell" style={{ maxWidth: 1160, margin: '0 auto', padding: '26px 40px 18px' }}>
        <div style={{ maxWidth: 620, marginBottom: 18 }}>
          <h2 style={{ fontSize: 28, letterSpacing: '-0.02em', marginBottom: 8 }}>{t('home.coreTitle')}</h2>
          <p style={{ fontSize: 15, lineHeight: 1.75, color: 'var(--text-secondary)', margin: 0 }}>{t('home.coreDesc')}</p>
        </div>
        <div className="grid-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {highlights.map((card) => (
            <div key={card.title} className="home-surface-card home-surface-card-soft">
              <div className="home-card-visual">{card.visual}</div>
              <h3 style={{ fontSize: 16, margin: '0 0 8px' }}>{card.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.7, margin: '0 0 14px' }}>{card.desc}</p>
              <Link to={card.to} className="home-inline-link">{card.cta} <span>{'\u2197'}</span></Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
