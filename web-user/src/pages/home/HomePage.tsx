import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import HomeHeroOrbitBackground from '../../components/background/HomeHeroOrbitBackground';
import HomePageFixedBackground from '../../components/background/HomePageFixedBackground';
import { HomePartnerMarqueeSection } from './components/HomePartnerMarqueeSection';
import { HomeBottomCtaSection } from './components/HomeBottomCtaSection';
import { HomeHeroSection } from './components/HomeHeroSection';
import { HomeNewsSection } from './components/HomeNewsSection';
import { HomePlatformCapabilitiesSection } from './components/HomePlatformCapabilitiesSection';
import { HomeAltFooterSection } from '../home-alt/components/HomeAltFooterSection';
import type { HomePartnerLogoItem } from './constants/partnerMarquee';
import { useHomeHeroScene } from './hooks/useHomeHeroScene';
import { useHomePrimaryAction } from './hooks/useHomePrimaryAction';
import './home.css';
import './components/home-sections.css';
import './components/shared/home-shared.css';

export default function HomePage() {
  const { t } = useTranslation();
  const { handlePrimary } = useHomePrimaryAction();
  const { partners, activeIndex, activePartner, isReducedMotion } = useHomeHeroScene();
  const resolvePartnerLabel = useCallback(
    (item: HomePartnerLogoItem) => (item.nameKey ? t(item.nameKey) : item.name),
    [t],
  );

  const orbitBackground = useMemo(
    () => (
      <HomeHeroOrbitBackground
        partners={partners}
        activeIndex={activeIndex}
        activePartner={activePartner}
        isReducedMotion={isReducedMotion}
        resolvePartnerLabel={resolvePartnerLabel}
      />
    ),
    [partners, activeIndex, activePartner, isReducedMotion, resolvePartnerLabel],
  );

  return (
    <div className="home-page-shell">
      <Header variant="hero" scrollBehavior="shrink-glass" />
      <HomePageFixedBackground isReducedMotion={isReducedMotion} />

      <div className="home-hero-bg-region">
        {orbitBackground}

        <div className="home-hero-bg-region-content">
          <HomeHeroSection
            onPrimaryAction={handlePrimary}
            phraseIndex={activeIndex}
            isReducedMotion={isReducedMotion}
            modelsCount={100}
          />
        </div>
      </div>

      <HomePlatformCapabilitiesSection modelCatalogStat={{ phase: 'ready', count: 100 }} />

      <div className="home-news-partner-screen">
        <HomeNewsSection />
        <HomePartnerMarqueeSection />
      </div>

      <div className="home-bottom-footer-screen">
        <HomeBottomCtaSection onPrimaryAction={handlePrimary} />
        <HomeAltFooterSection />
      </div>
    </div>
  );
}
