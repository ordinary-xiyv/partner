import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { resolveHomeHeroPartnerLogo as defaultResolveHomeHeroPartnerLogo } from '@/pages/home/constants/homeHeroPartners';
import type { HomePartnerLogoItem } from '@/pages/home/constants/partnerMarquee';
import './home-hero-orbit-bg.css';

export interface HomeHeroOrbitBackgroundProps {
  partners: HomePartnerLogoItem[];
  activeIndex: number;
  activePartner: HomePartnerLogoItem;
  isReducedMotion: boolean;
  resolvePartnerLabel: (item: HomePartnerLogoItem) => string;
  /** 可传入固定文案，覆盖默认 i18n */
  orbitCardDesc?: string;
  /** 可传入自定义伙伴 logo 解析 */
  resolvePartnerLogo?: (item: HomePartnerLogoItem) => string;
}

export default function HomeHeroOrbitBackground({
  partners,
  activeIndex,
  activePartner,
  isReducedMotion,
  resolvePartnerLabel,
  orbitCardDesc,
  resolvePartnerLogo,
}: HomeHeroOrbitBackgroundProps) {
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const { t } = useTranslation();

  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);
  const cardInnerRef = useRef<HTMLDivElement>(null);
  const cardLogoRef = useRef<HTMLDivElement>(null);
  const cardTitleRef = useRef<HTMLHeadingElement>(null);
  const ctxRef = useRef<gsap.Context | null>(null);

  const [isVisible, setIsVisible] = useState(true);

  const resolveLogo = resolvePartnerLogo ?? defaultResolveHomeHeroPartnerLogo;
  const activeLogoSrc = resolveLogo(activePartner);
  const activeLabel = resolvePartnerLabel(activePartner);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.06 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const shouldAnimate = isVisible && !isReducedMotion;

  useEffect(() => {
    ctxRef.current?.revert();
    ctxRef.current = null;

    if (!shouldAnimate) return undefined;

    const ctx = gsap.context(() => {
      if (orbitRef.current) {
        const track = orbitRef.current;
        gsap.to(track, {
          rotation: 360,
          duration: 68,
          ease: 'none',
          repeat: -1,
          onUpdate: () => {
            const rotation = Number(gsap.getProperty(track, 'rotation')) || 0;
            track.querySelectorAll<HTMLElement>('.home-hero-orbit-dot-inner').forEach((inner) => {
              gsap.set(inner, { rotation: -rotation });
            });
          },
        });
      }

      if (sceneRef.current) {
        gsap.to(sceneRef.current, {
          x: 18,
          y: -10,
          scale: 1.015,
          duration: 9,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        });
      }

      if (cardInnerRef.current) {
        gsap.to(cardInnerRef.current, {
          y: -12,
          duration: 5,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        });
      }
    }, wrapRef);

    ctxRef.current = ctx;

    return () => {
      ctx.revert();
    };
  }, [shouldAnimate, isDark, partners.length]);

  useEffect(() => {
    if (!shouldAnimate || !cardInnerRef.current) return undefined;

    gsap.fromTo(
      cardInnerRef.current,
      { opacity: 0.72, scale: 0.96 },
      { opacity: 1, scale: 1, duration: 0.55, ease: 'power2.out' },
    );

    if (cardLogoRef.current) {
      gsap.fromTo(
        cardLogoRef.current,
        { scale: 0.85, rotate: -8 },
        { scale: 1, rotate: 0, duration: 0.5, ease: 'back.out(1.6)' },
      );
    }

    if (cardTitleRef.current) {
      gsap.fromTo(
        cardTitleRef.current,
        { y: 8, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out', delay: 0.06 },
      );
    }
  }, [activeIndex, shouldAnimate]);

  const renderDot = useCallback(
    (partner: HomePartnerLogoItem, index: number) => {
      const angle = (index * 360) / partners.length;
      const logoSrc = resolveLogo(partner);
      const label = resolvePartnerLabel(partner);
      const isActive = index === activeIndex;

      return (
        <div
          key={partner.id}
          className={`home-hero-orbit-dot${isActive ? ' is-active' : ''}`}
          style={{ ['--orbit-angle' as string]: `${angle}deg` }}
        >
          <div className="home-hero-orbit-dot-inner">
            <div className="home-hero-orbit-dot-icon">
              {logoSrc ? (
                <img src={logoSrc} alt="" className="home-hero-orbit-dot-logo" decoding="async" />
              ) : (
                <span className="home-hero-orbit-dot-fallback" aria-hidden />
              )}
            </div>
            <p className="home-hero-orbit-dot-label">{label}</p>
          </div>
        </div>
      );
    },
    [activeIndex, partners, resolvePartnerLabel, resolveLogo],
  );

  return (
    <div
      ref={wrapRef}
      className={`home-hero-orbit-wrap${isDark ? ' home-hero-orbit-wrap--dark' : ''}${isReducedMotion ? ' home-hero-orbit-wrap--static' : ''}`}
      aria-hidden
    >
      <div className="home-hero-orbit-stage">
        <div ref={sceneRef} className="home-hero-orbit-scene home-hero-orbit-scene--foreground">
          <div ref={orbitRef} className="home-hero-orbit-track">
            {partners.map(renderDot)}
          </div>
        </div>

        <aside className="home-hero-orbit-card">
          <div ref={cardInnerRef} className="home-hero-orbit-card-inner">
            <div ref={cardLogoRef} className="home-hero-orbit-card-logo">
              {activeLogoSrc ? (
                <img src={activeLogoSrc} alt="" decoding="async" />
              ) : (
                <span className="home-hero-orbit-dot-fallback" aria-hidden />
              )}
            </div>
            <h3 ref={cardTitleRef} className="home-hero-orbit-card-title">
              {activeLabel}
            </h3>
            <p className="home-hero-orbit-card-desc">{orbitCardDesc ?? t('home.heroOrbitCardDesc')}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
