import { useEffect, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import './home-hero-orbit-bg.css';

export interface HomePageFixedBackgroundProps {
  isReducedMotion: boolean;
}

export default function HomePageFixedBackground({ isReducedMotion }: HomePageFixedBackgroundProps) {
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const [particleCount, setParticleCount] = useState(42);

  useEffect(() => {
    const syncCount = () => {
      setParticleCount(window.innerWidth <= 768 ? 22 : 42);
    };
    syncCount();
    window.addEventListener('resize', syncCount);
    return () => window.removeEventListener('resize', syncCount);
  }, []);

  const lines = Array.from({ length: 7 }, (_, i) => {
    const width = 280 + (i % 5) * 120;
    const left = (i * 13.7) % 100 - 10;
    const top = (i * 17.3 + 8) % 100;
    const rotate = -15 + (i % 7) * 5;
    return (
      <i
        key={`line-${i}`}
        className="home-hero-orbit-line"
        style={{
          width: `${width}px`,
          left: `${left}%`,
          top: `${top}%`,
          opacity: 0.25 + (i % 4) * 0.1,
          ['--line-rotate' as string]: `${rotate}deg`,
          transform: `rotate(${rotate}deg)`,
        }}
      />
    );
  });

  const particles = Array.from({ length: particleCount }, (_, i) => {
    const left = `${(i * 17.3) % 100}%`;
    const top = `${(i * 23.7 + 11) % 100}%`;
    const size = 2 + (i % 3);
    const x = (i % 7) * 10 - 35;
    const y = (i % 5) * 14 - 35;
    const dur = 3 + (i % 6);
    return (
      <span
        key={`p-${i}`}
        className="home-hero-orbit-particle"
        style={{
          left,
          top,
          width: size,
          height: size,
          ['--particle-x' as string]: `${x}px`,
          ['--particle-y' as string]: `${y}px`,
          ['--particle-dur' as string]: `${dur}s`,
          opacity: 0.2 + (i % 5) * 0.12,
        }}
      />
    );
  });

  return (
    <div
      className={`home-page-fixed-bg${isDark ? ' home-page-fixed-bg--dark' : ''}${isReducedMotion ? ' home-page-fixed-bg--static' : ''}`}
      aria-hidden
    >
      <div className="home-hero-orbit-stage">
        <div className="home-hero-orbit-halo" />
        <div className="home-hero-orbit-halo home-hero-orbit-halo--b" />
        <div className="home-hero-orbit-halo home-hero-orbit-halo--c" />
        <div className="home-hero-orbit-shoot" />

        <div className="home-hero-orbit-scene home-hero-orbit-scene--rings">
          <div className="home-hero-orbit-ring" />
          <div className="home-hero-orbit-ring home-hero-orbit-ring--mid" />
          <div className="home-hero-orbit-ring home-hero-orbit-ring--outer" />
        </div>

        {lines}
        {particles}
        <div className="home-hero-orbit-glow" />
        <div className="home-hero-orbit-noise" />
      </div>
    </div>
  );
}
