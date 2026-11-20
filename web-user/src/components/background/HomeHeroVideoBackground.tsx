import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { HOME_HERO_VIDEO } from './homeHeroVideoAssets';
import { attachSeamlessVideoLoop } from './useSeamlessVideoLoop';
import './home-hero-video-bg.css';

/** 首页 Hero：预渲染 MP4 漩涡背景，支持明暗主题双片源 */
export default function HomeHeroVideoBackground() {
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const wrapRef = useRef<HTMLDivElement>(null);
  const lightVideoRef = useRef<HTMLVideoElement>(null);
  const darkVideoRef = useRef<HTMLVideoElement>(null);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [lightReady, setLightReady] = useState(false);
  const [darkReady, setDarkReady] = useState(false);
  const [lightError, setLightError] = useState(false);
  const [darkError, setDarkError] = useState(false);

  const playActiveVideos = useCallback(async () => {
    if (isReducedMotion) return;
    const refs = [lightVideoRef.current, darkVideoRef.current].filter(Boolean) as HTMLVideoElement[];
    await Promise.all(
      refs.map(async (video) => {
        try {
          if (video.paused) {
            await video.play();
          }
        } catch {
          /* autoplay blocked — poster remains visible */
        }
      }),
    );
  }, [isReducedMotion]);

  const pauseVideos = useCallback(() => {
    [lightVideoRef.current, darkVideoRef.current].forEach((video) => {
      video?.pause();
    });
  }, []);

  useEffect(() => {
    const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => setIsReducedMotion(mqMotion.matches);
    syncMotion();
    mqMotion.addEventListener('change', syncMotion);
    return () => mqMotion.removeEventListener('change', syncMotion);
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void playActiveVideos();
      } else {
        pauseVideos();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pauseVideos, playActiveVideos]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node || isReducedMotion) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void playActiveVideos();
        } else {
          pauseVideos();
        }
      },
      { threshold: 0.08 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isReducedMotion, pauseVideos, playActiveVideos]);

  useEffect(() => {
    void playActiveVideos();
  }, [isDark, isReducedMotion, playActiveVideos]);

  useEffect(() => {
    if (isReducedMotion) return undefined;

    let cleanups: Array<() => void> = [];

    const bindLoops = () => {
      cleanups.forEach((cleanup) => cleanup());
      cleanups = [lightVideoRef.current, darkVideoRef.current]
        .filter((node): node is HTMLVideoElement => node != null)
        .map(attachSeamlessVideoLoop);
    };

    bindLoops();
    const frameId = cleanups.length === 0 ? requestAnimationFrame(bindLoops) : 0;

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [isReducedMotion]);

  const showLightVideo = !isReducedMotion && lightReady && !lightError;
  const showDarkVideo = !isReducedMotion && darkReady && !darkError;

  return (
    <div
      ref={wrapRef}
      className={`home-hero-video-wrap${isDark ? ' home-hero-video-wrap--dark' : ''}`}
      aria-hidden
    >
      <div className={`home-hero-video-layer${!isDark ? ' is-active' : ''}`}>
        <img
          className="home-hero-video-poster"
          src={HOME_HERO_VIDEO.light.poster}
          alt=""
          decoding="async"
        />
        {!isReducedMotion && (
          <video
            ref={lightVideoRef}
            className="home-hero-video"
            muted
            playsInline
            autoPlay
            preload="auto"
            poster={HOME_HERO_VIDEO.light.poster}
            style={{ opacity: showLightVideo ? 1 : 0 }}
            onCanPlayThrough={() => setLightReady(true)}
            onError={() => setLightError(true)}
          >
            <source src={HOME_HERO_VIDEO.light.src} type="video/mp4" />
          </video>
        )}
      </div>

      <div className={`home-hero-video-layer${isDark ? ' is-active' : ''}`}>
        <img
          className="home-hero-video-poster"
          src={HOME_HERO_VIDEO.dark.poster}
          alt=""
          decoding="async"
        />
        {!isReducedMotion && (
          <video
            ref={darkVideoRef}
            className="home-hero-video"
            muted
            playsInline
            autoPlay
            preload="auto"
            poster={HOME_HERO_VIDEO.dark.poster}
            style={{ opacity: showDarkVideo ? 1 : 0 }}
            onCanPlayThrough={() => setDarkReady(true)}
            onError={() => setDarkError(true)}
          >
            <source src={HOME_HERO_VIDEO.dark.src} type="video/mp4" />
          </video>
        )}
      </div>

      <div className="home-hero-video-mask-left" />
      <div className="home-hero-video-mask-right" />
    </div>
  );
}
