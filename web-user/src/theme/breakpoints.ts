/** Global responsive breakpoints — single source of truth */
export const BREAKPOINTS = {
  mobileMax: 767,
  tabletMin: 768,
  tabletMax: 1023,
  desktopMin: 1024,
  /** Chat / Video / ModelPlaza scene-only compact layout */
  chatCompactMax: 899,
} as const;

export const MEDIA_QUERIES = {
  mobile: `(max-width: ${BREAKPOINTS.mobileMax}px)`,
  tablet: `(min-width: ${BREAKPOINTS.tabletMin}px) and (max-width: ${BREAKPOINTS.tabletMax}px)`,
  desktop: `(min-width: ${BREAKPOINTS.desktopMin}px)`,
  belowDesktop: `(max-width: ${BREAKPOINTS.tabletMax}px)`,
  chatCompact: `(max-width: ${BREAKPOINTS.chatCompactMax}px)`,
} as const;
