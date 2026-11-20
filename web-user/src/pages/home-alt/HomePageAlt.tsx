import { useEffect } from 'react';
import Header from '../../components/Header';
import { useHomePrimaryAction } from '../home/hooks/useHomePrimaryAction';
import { HomeAltHeroSection } from './components/HomeAltHeroSection';
import { HomeAltPlatformSection } from './components/HomeAltPlatformSection';
import { HomeAltModelsSection } from './components/HomeAltModelsSection';
import { HomeAltManageSection } from './components/HomeAltManageSection';
import { HomeAltPartnersSection } from './components/HomeAltPartnersSection';
import { HomeAltScenesSection } from './components/HomeAltScenesSection';
import { HomeAltSdkSection } from './components/HomeAltSdkSection';
import { HomeAltCtaSection } from './components/HomeAltCtaSection';
import { HomeAltValuesSection } from './components/HomeAltValuesSection';
import { HomeAltFooterSection } from './components/HomeAltFooterSection';
import '../home/home.css';
import '../home/components/home-sections.css';
import '../home/components/shared/home-shared.css';
import './home-alt.css';

export default function HomePageAlt() {
  const { handlePrimary } = useHomePrimaryAction();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('home-alt-page');
    return () => {
      root.classList.remove('home-alt-page');
    };
  }, []);

  return (
    <>
      <Header variant="hero" scrollBehavior="shrink-glass" />
      <div className="home-alt-shell">
        <div className="home-alt-hero-region">
          <HomeAltHeroSection onPrimaryAction={handlePrimary} />
        </div>

        <HomeAltPlatformSection />

        <div className="home-alt-lower">
          <HomeAltModelsSection />
          <HomeAltManageSection />
          <HomeAltSdkSection />
          <HomeAltScenesSection />
          <HomeAltPartnersSection />
        </div>

        <div className="home-alt-footer-block">
          <HomeAltCtaSection onPrimaryAction={handlePrimary} />
          <HomeAltValuesSection />
          <HomeAltFooterSection />
        </div>
      </div>
    </>
  );
}
