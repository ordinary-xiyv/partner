import { useEffect, useState } from 'react';

/*
 * 首页顶栏的滚动进度。
 *
 * 它现在的唯一用途是驱动「品牌色毛玻璃从无到有」——早先还被用来做
 * 胶囊形变（位移 + 缩放 + 圆角），那套已经删掉了，所以这里不再输出
 * isCompact 这类二值状态，只留一个 0~1 的连续进度。
 *
 * EXPAND_END：滚过 8px 才开始算进度。留这一点余量，是因为移动端
 * 惯性滚动常有几像素的抖动，从 0 直接起算会让毛玻璃一闪一闪。
 * COMPACT_START：到 120px 时进度满格（毛玻璃完全显色）。再往后
 * 就不再变了 —— 导航已经「浮起来」了，继续加深只是浪费重绘。
 */
const EXPAND_END = 8;
const COMPACT_START = 120;

export function useHeaderScrollState(enabled: boolean): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');

    const update = () => {
      const y = window.scrollY;
      let next = Math.min(1, Math.max(0, (y - EXPAND_END) / (COMPACT_START - EXPAND_END)));
      /*
       * 减少动效偏好下把进度二值化：连续插值会让毛玻璃在滚动中一直
       * 重算 backdrop-filter，那本身也是一种动效。
       */
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

  return progress;
}
