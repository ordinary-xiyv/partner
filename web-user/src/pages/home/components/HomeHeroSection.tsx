import { ArrowRightOutlined } from '@ant-design/icons';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { HOME_HERO_TYPEWRITER_KEYS } from '../constants/homeHeroTypewriter';
import { useHomeHeroTypewriter } from '../hooks/useHomeHeroTypewriter';
import { HomeHeroScrollHint } from './HomeHeroScrollHint';
import './home-hero-section.css';

interface HomeHeroSectionProps {
  onPrimaryAction: () => void;
  phraseIndex: number;
  isReducedMotion: boolean;
  isScenePaused?: boolean;
  modelsCount?: number | null;
}

function HomeHeroTypewriterTitle({
  phraseIndex,
  isReducedMotion,
  isScenePaused = false,
}: {
  phraseIndex: number;
  isReducedMotion: boolean;
  isScenePaused?: boolean;
}) {
  const { t } = useTranslation();
  const phrases = useMemo(
    () => HOME_HERO_TYPEWRITER_KEYS.map((key) => t(key)),
    [t],
  );
  const typewriterIndex = phraseIndex % phrases.length;
  const displayText = useHomeHeroTypewriter({
    phrases,
    phraseIndex: typewriterIndex,
    isReducedMotion,
    isPaused: isScenePaused,
  });

  return (
    <h1 className="home-hero-v2-title landing-hero-title">
      <span className="home-hero-v2-title-line">{t('home.heroTitleLine1')}</span>
      <span className="home-hero-v2-title-accent-wrap">
        <span className="home-hero-v2-title-accent home-hero-typewriter-accent">{displayText}</span>
        <span className="home-hero-typewriter-cursor" aria-hidden />
      </span>
    </h1>
  );
}

export function HomeHeroSection({
  onPrimaryAction,
  phraseIndex,
  isReducedMotion,
  isScenePaused = false,
  modelsCount = null,
}: HomeHeroSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const modelsStatValue =
    modelsCount != null && modelsCount > 0 ? `${modelsCount}+` : t('home.heroStatModelsFallback');

  return (
    <section className="landing-section landing-hero home-hero-wrap home-hero-v2 home-hero-v2--centered">
      <div className="home-hero-v2-pill-row">
        <div className="home-hero-v2-pill">{t('home.heroPill')}</div>
      </div>

      <div className="home-hero-v2-center">
        <div className="home-hero-v2-orbit-copy">
          <HomeHeroTypewriterTitle
            phraseIndex={phraseIndex}
            isReducedMotion={isReducedMotion}
            isScenePaused={isScenePaused}
          />

          <p className="home-hero-v2-subtitle landing-hero-subtitle">
            {t('home.heroSubtitlePlain')}
          </p>
        </div>

        <div className="home-hero-v2-actions hero-buttons">
          <button type="button" className="home-hero-v2-btn home-hero-v2-btn--primary hero-btn-primary" onClick={onPrimaryAction}>
            <span className="home-hero-v2-btn__label">{t('home.getApiKey')}</span>
            <span className="home-hero-v2-btn__arrow" aria-hidden>
              <ArrowRightOutlined />
            </span>
          </button>
          <button
            type="button"
            className="home-hero-v2-btn home-hero-v2-btn--secondary hero-btn-secondary"
            onClick={() => navigate('/models')}
          >
            <span className="home-hero-v2-btn__label">{t('home.heroSecondaryCta')}</span>
            <span className="home-hero-v2-btn__arrow" aria-hidden>
              <ArrowRightOutlined />
            </span>
          </button>
        </div>

        <div className="home-hero-v2-stats" aria-label={t('home.heroStatsAria')}>
          <div className="home-hero-v2-stat">
            <b>{modelsStatValue}</b>
            <span>{t('home.heroStatModels')}</span>
          </div>
          <div className="home-hero-v2-stat">
            <b>{t('home.heroStatCreatorsValue')}</b>
            <span>{t('home.heroStatCreators')}</span>
          </div>
          <div className="home-hero-v2-stat">
            <b>{t('home.heroStatInfinity')}</b>
            <span>{t('home.heroStatCreativity')}</span>
          </div>
        </div>
      </div>

      <div className="home-hero-v2-scroll-slot">
        <HomeHeroScrollHint />
      </div>
    </section>
  );
}
