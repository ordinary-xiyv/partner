import { useEffect, useState } from 'react';
import { MEDIA_QUERIES } from '../theme/breakpoints';

/** Drawer / 滚动条出现会导致 viewport 在断点附近抖动；防抖避免 matchMedia 来回 setState 死循环 */
const MEDIA_DEBOUNCE_MS = 160;

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false),
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    let timer: number | undefined;

    const apply = (value: boolean) => {
      setMatches((prev) => (prev === value ? prev : value));
    };

    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => apply(mql.matches), MEDIA_DEBOUNCE_MS);
    };

    apply(mql.matches);
    mql.addEventListener('change', onChange);
    return () => {
      window.clearTimeout(timer);
      mql.removeEventListener('change', onChange);
    };
  }, [query]);

  return matches;
}

export interface BreakpointState {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isMobileOrTablet: boolean;
}

export function useBreakpoint(): BreakpointState {
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const isTablet = useMediaQuery(MEDIA_QUERIES.tablet);
  const isDesktop = useMediaQuery(MEDIA_QUERIES.desktop);

  return {
    isMobile,
    isTablet,
    isDesktop,
    isMobileOrTablet: isMobile || isTablet,
  };
}
