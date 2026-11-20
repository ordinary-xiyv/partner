import { useEffect, useRef } from 'react';

interface ChatWelcomeVideoMediaProps {
  mediaSrc: string;
  coverSrc?: string;
  className?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isCoarsePointerDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

function isImagePosterUrl(url: string | undefined): boolean {
  if (!url?.trim()) return false;
  return /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(url);
}

const PREVIEW_FRAME_TIME = 0.05;

/** 桌面 hover 播放；移动端视口内静音自动播放；无 controls / 播放按钮 */
export function ChatWelcomeVideoMedia({ mediaSrc, coverSrc, className }: ChatWelcomeVideoMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isCoarse = isCoarsePointerDevice();
  const reduceMotion = prefersReducedMotion();
  const posterUrl = isImagePosterUrl(coverSrc) ? coverSrc : undefined;

  const pauseAtPreviewFrame = (el: HTMLVideoElement): void => {
    try {
      el.pause();
      if (el.currentTime < PREVIEW_FRAME_TIME) {
        el.currentTime = PREVIEW_FRAME_TIME;
      }
    } catch {
      /* seek 失败时忽略 */
    }
  };

  useEffect(() => {
    if (reduceMotion || !isCoarse) return;
    const el = videoRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void el.play().catch(() => {});
        } else {
          el.pause();
          if (!posterUrl) {
            try {
              el.currentTime = PREVIEW_FRAME_TIME;
            } catch {
              /* ignore */
            }
          } else {
            el.currentTime = 0;
          }
        }
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [isCoarse, reduceMotion, posterUrl]);

  const handleLoadedData = (): void => {
    if (posterUrl) return;
    const el = videoRef.current;
    if (!el) return;
    pauseAtPreviewFrame(el);
  };

  const handleMouseEnter = (): void => {
    if (reduceMotion || isCoarse) return;
    const el = videoRef.current;
    if (!el) return;
    void el.play().catch(() => {});
  };

  const handleMouseLeave = (): void => {
    if (reduceMotion || isCoarse) return;
    const el = videoRef.current;
    if (!el) return;
    if (posterUrl) {
      el.pause();
      el.currentTime = 0;
      return;
    }
    pauseAtPreviewFrame(el);
  };

  return (
    <video
      ref={videoRef}
      src={mediaSrc}
      poster={posterUrl}
      muted
      playsInline
      loop
      preload="auto"
      className={className}
      aria-hidden
      onLoadedData={handleLoadedData}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    />
  );
}
