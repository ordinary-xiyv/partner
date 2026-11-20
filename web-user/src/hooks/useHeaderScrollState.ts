import { useEffect, useState } from 'react';

const EXPAND_END = 8;
const COMPACT_START = 120;

export interface HeaderScrollState {
  progress: number;
  isCompact: boolean;
}

export function useHeaderScrollState(enabled: boolean): HeaderScrollState {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');

    const update = () => {
      const y = window.scrollY;
      let next = Math.min(1, Math.max(0, (y - EXPAND_END) / (COMPACT_START - EXPAND_END)));
      if (media.matches) {
        next = next >= 0.5 ? 1 : 0;
      }
      setProgress(next);
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    media.addEventListener('change', update);
    return () => {
      window.removeEventListener('scroll', update);
      media.removeEventListener('change', update);
    };
  }, [enabled]);

  return {
    progress,
    isCompact: progress >= 1,
  };
}
