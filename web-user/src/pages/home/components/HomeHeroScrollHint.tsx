import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { HOME_PLATFORM_SCROLL_ANCHOR_ID } from '../constants/homeSectionIds';

function HomeHeroScrollDoubleDownIcon() {
  return (
    <svg
      className="home-hero-scroll-hint__svg"
      viewBox="0 0 24 24"
      width="42"
      height="42"
      aria-hidden
    >
      <path
        d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41Z"
        fill="currentColor"
      />
      <path
        d="M7.41 13.59 12 18.17l4.59-4.58L18 15l-6 6-6-6 1.41-1.41Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function HomeHeroScrollHint() {
  const { t } = useTranslation();

  const handleScrollToPlatform = useCallback(() => {
    const target = document.getElementById(HOME_PLATFORM_SCROLL_ANCHOR_ID);
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <button
      type="button"
      className="home-hero-scroll-hint"
      onClick={handleScrollToPlatform}
      aria-label={t('home.heroScrollHintAria')}
    >
      <span className="home-hero-scroll-hint__icon" aria-hidden>
        <HomeHeroScrollDoubleDownIcon />
      </span>
    </button>
  );
}
