/** 首页 Hero 漩涡视频资源（将 MP4 放入 web/public/videos/） */
export const HOME_HERO_VIDEO = {
  light: {
    src: '/videos/home-hero-bloom-light.mp4',
    poster: '/images/home-hero-bloom-poster-light.png',
  },
  dark: {
    src: '/videos/home-hero-bloom-dark.mp4',
    poster: '/images/home-hero-bloom-poster-dark.png',
  },
} as const;

export type HomeHeroVideoTheme = keyof typeof HOME_HERO_VIDEO;
