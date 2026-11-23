/** 运营设置可选内链 path，需与后端 allowlist 保持一致 */

export const HEADER_INTERNAL_PATHS = [
  '/models',
  '/image-chat',
  '/video',
  '/speech',
  '/dashboard',
  '/tokens',
  '/logs',
  '/billing',
  '/topup',
  '/subscription',
  '/profile',
  '/about',
  '/trust',
  '/legal',
  '/news',
  '/consulting',
  '/announcements',
  '/support-plans',
  '/status-page',
  '/docs',
] as const;

export const FOOTER_INTERNAL_PATHS = [
  ...HEADER_INTERNAL_PATHS,
] as const;

export type HeaderInternalPath = (typeof HEADER_INTERNAL_PATHS)[number];
