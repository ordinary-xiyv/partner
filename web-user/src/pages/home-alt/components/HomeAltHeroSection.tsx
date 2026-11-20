import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useHomeAltTypewriter } from '../hooks/useHomeAltTypewriter';
import { HomeAltNetworkMap } from './HomeAltNetworkMap';
import './home-alt-hero.css';

const HOME_ALT_TYPEWRITER_KEYS = [
  'home.heroTypewriter1',
  'home.heroTypewriter2',
  'home.heroTypewriter3',
  'home.heroTypewriter4',
] as const;

const HOME_ALT_STATS = [
  { valueKey: 'homeAlt.statModelsValue', labelKey: 'homeAlt.statModelsLabel' },
  { valueKey: 'homeAlt.statCustomersValue', labelKey: 'homeAlt.statCustomersLabel' },
  { valueKey: 'homeAlt.statCostValue', labelKey: 'homeAlt.statCostLabel' },
  { valueKey: 'homeAlt.statStabilityValue', labelKey: 'homeAlt.statStabilityLabel' },
] as const;

interface HomeAltHeroSectionProps {
  onPrimaryAction: () => void;
}

function usePrefersReducedMotion(): boolean {
  return useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
}

export function HomeAltHeroSection({ onPrimaryAction }: HomeAltHeroSectionProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isReducedMotion = usePrefersReducedMotion();
  const phrases = useMemo(
    () => HOME_ALT_TYPEWRITER_KEYS.map((key) => t(key)),
    [i18n.language, t],
  );
  const displayText = useHomeAltTypewriter(phrases, isReducedMotion);
  const titleAria = `${t('home.heroTitleLine1')} ${displayText}`.trim();

  return (
    <section className="home-alt-global-hero" aria-label={t('homeAlt.heroAria')}>
      <div className="fluid-field" aria-hidden="true">
        <span className="fluid-glow left" />
        <span className="fluid-glow right" />
        <span className="fluid-bridge" />
      </div>

      <HomeAltNetworkMap ariaLabel={t('homeAlt.heroMapAria')} />

      <div className="hero-copy">
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          {t('homeAlt.heroEyebrow')}
        </div>
        <h1 aria-label={titleAria}>
          <span className="title-fixed">{t('home.heroTitleLine1')}</span>
          <span className="type-line">
            <span className="type-text">{displayText}</span>
            <span className="type-cursor" aria-hidden="true" />
          </span>
        </h1>
        <p className="subhead">{t('homeAlt.heroSubtitle')}</p>
        <div className="actions">
          <button type="button" className="button primary" onClick={onPrimaryAction}>
            {t('home.getApiKey')} <span aria-hidden="true">→</span>
          </button>
          <button type="button" className="button secondary" onClick={() => navigate('/models')}>
            {t('home.heroSecondaryCta')} <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <ul className="hero-stats" aria-label={t('home.heroStatsAria')}>
        {HOME_ALT_STATS.map((item) => (
          <li key={item.labelKey} className="hero-stat">
            <strong className="hero-stat__value">{t(item.valueKey)}</strong>
            <span className="hero-stat__label">{t(item.labelKey)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
