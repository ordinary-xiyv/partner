import { useCallback, useEffect, useRef, useState } from 'react';
import { Spin } from 'antd';
import './AuthLoginMedia.css';

/**
 * 登录页左栏媒体面板配置（来自站点外观 login_media_config，由服务端填充 URL）。
 * - type='none' 或 URL 缺失：不渲染任何媒体（面板与页面同色，无灰底占位）
 * - type='image'：图片完整铺满面板（面板比例跟随图片原始比例，见 onMediaRatio）
 * - type='video'：muted + loop + autoplay，poster 兜底；prefers-reduced-motion 降级为 poster；
 *   页面不可见时暂停（登录页恒全屏可见，不需要 IntersectionObserver）
 *   视频缓冲到可播放之前，面板居中显示项目通用 loading（antd Spin）；能出画后 loading
 *   淡出、视频淡入，两者交叉过渡，不会先给一块空白再跳出来。
 */
export interface AuthLoginMediaConfig {
  type: 'none' | 'image' | 'video';
  image_url?: string;
  video_url?: string;
  poster_url?: string;
}

export default function AuthLoginMedia({
  config,
  onMediaRatio,
  reusedVideo,
}: {
  config: AuthLoginMediaConfig;
  /** 媒体原始宽高比（w/h）就绪后上报；无媒体时上报 null。父级据此设置面板 aspect-ratio —— 媒体完整显示且铺满，不裁剪不留白 */
  onMediaRatio?: (ratio: number | null) => void;
  /** 父级已预加载好首帧的 video 元素（复用，避免二次下载造成的黑窗） */
  reusedVideo?: HTMLVideoElement | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  /**
   * 真正挂进 DOM 的 video 元素（可能是父级预加载后复用的，也可能是下面 JSX 渲染的）。
   * 用 state 承接而不是只用 ref，是为了让「绑监听」的 effect 在元素变化时重新执行——
   * 复用元素挂载时若还没缓冲好，之前没有任何监听，视频会一直停在 opacity:0。
   */
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const imageUrl = (config.image_url || '').trim();
  const videoUrl = (config.video_url || '').trim();
  const posterUrl = (config.poster_url || '').trim();

  // type 与 URL 不一致时以 URL 为准（服务端 enrich 已归一，这里兜底防御）。
  const resolvedType = config.type === 'video'
    ? (videoUrl ? 'video' : 'none')
    : config.type === 'image'
      ? (imageUrl ? 'image' : 'none')
      : 'none';

  const playVideo = useCallback(async () => {
    if (isReducedMotion) return;
    const video = videoRef.current;
    if (!video || video.paused) {
      try {
        await video?.play();
      } catch {
        /* autoplay blocked — poster remains visible */
      }
    }
  }, [isReducedMotion]);

  const pauseVideo = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  // 复用预加载元素：挂载即显示首帧（readyState≥2），无需再下载。
  // 注意：钩子必须在提前 return 之前声明（组件可能在 none/image/video 间切换）
  const attachReusedVideo = useCallback(
    (node: HTMLDivElement | null) => {
      const el = reusedVideo;
      if (!node || !el) return;
      el.className = 'auth-login-media__video';
      if (el.parentNode !== node) node.appendChild(el);
      videoRef.current = el;
      setVideoEl(el);
      void el.play?.()?.catch(() => {});
    },
    [reusedVideo],
  );

  // 自己渲染的 video 元素的 ref：用稳定回调，避免每次渲染都触发解绑/重绑监听
  const attachOwnVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    setVideoEl(node);
  }, []);

  useEffect(() => {
    const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => setIsReducedMotion(mqMotion.matches);
    syncMotion();
    mqMotion.addEventListener('change', syncMotion);
    return () => mqMotion.removeEventListener('change', syncMotion);
  }, []);

  useEffect(() => {
    if (resolvedType !== 'video') return undefined;

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void playVideo();
      } else {
        pauseVideo();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [resolvedType, pauseVideo, playVideo]);

  // 换源（换视频）时把就绪/失败状态清零，避免沿用上一个视频的结论
  useEffect(() => {
    setVideoReady(false);
    setVideoError(false);
  }, [videoUrl]);

  /**
   * 视频「能出画」判定：canplay / canplaythrough / playing 任一即置位。
   * 只等 canplaythrough 有风险——弱网下浏览器按缓冲估算可能迟迟不触发，
   * 而视频其实早就在播，loading 会一直盖在上面盖住正常画面。
   *
   * error 必须用**捕获阶段**监听：视频源写在 <source> 子元素上时，加载失败的事件
   * 在 <source> 上触发且不冒泡，挂在 video 上的普通监听收不到，loading 会一直转。
   */
  useEffect(() => {
    if (!videoEl) return undefined;

    const markReadyIfPlayable = () => {
      if (videoEl.readyState >= 3) setVideoReady(true);
    };
    // playing 说明已经在出帧，不再看 readyState
    const markPlaying = () => setVideoReady(true);
    const markError = () => setVideoError(true);
    const onCaptureError = (e: Event) => {
      const target = e.target as Node | null;
      if (target === videoEl || target?.nodeName === 'SOURCE') markError();
    };

    // 元素在挂载前就已缓冲好（复用父级 probe 的常见情形）：直接置位，不必等事件
    markReadyIfPlayable();

    videoEl.addEventListener('canplay', markReadyIfPlayable);
    videoEl.addEventListener('canplaythrough', markReadyIfPlayable);
    videoEl.addEventListener('playing', markPlaying);
    videoEl.addEventListener('error', onCaptureError, true);

    /**
     * 复用元素可能在我们挂监听之前就已经失败，事件不会再补发，只能看 networkState。
     * 但必须**延迟**检查：元素刚挂载那一瞬源还没开始选择，networkState 同样是
     * NETWORK_NO_SOURCE(3)，立刻判会把正常视频误标成失败、loading 秒消失且视频永不显形。
     * 3 表示「没有任何可用源」是终态（不是弱网等待，等待时是 2=LOADING），
     * 等一小会儿仍是 3 才能确定是真失败。
     */
    const errCheckTimer = window.setTimeout(() => {
      if (videoEl.networkState === 3 && videoEl.readyState === 0) markError();
    }, 800);

    return () => {
      window.clearTimeout(errCheckTimer);
      videoEl.removeEventListener('canplay', markReadyIfPlayable);
      videoEl.removeEventListener('canplaythrough', markReadyIfPlayable);
      videoEl.removeEventListener('playing', markPlaying);
      videoEl.removeEventListener('error', onCaptureError, true);
    };
  }, [videoEl, videoUrl]);

  // 无媒体时同步上报 null（父级回落到默认比例）；有媒体时由 onLoad/onLoadedMetadata 上报
  useEffect(() => {
    if (resolvedType === 'none') {
      onMediaRatio?.(null);
    }
  }, [resolvedType, onMediaRatio]);

  /** 视频真正可显示（降级/失败时不显示，露出 poster 或纯色面板） */
  const showVideo = !isReducedMotion && videoReady && !videoError;
  /** 视频未就绪期间显示项目通用 loading；失败则不再转，避免一直转圈 */
  const showLoading = !isReducedMotion && !videoError && !videoReady;

  // 复用元素不受 React 管理，透明度在这里同步；自家 JSX 元素另外有内联 style（取值一致）
  useEffect(() => {
    if (videoEl) videoEl.style.opacity = showVideo ? '1' : '0';
  }, [videoEl, showVideo]);

  if (resolvedType === 'none') {
    return null;
  }

  if (resolvedType === 'image') {
    return (
      <div className="auth-login-media">
        <img
          className="auth-login-media__img"
          src={imageUrl}
          alt=""
          decoding="async"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              onMediaRatio?.(img.naturalWidth / img.naturalHeight);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="auth-login-media">
      {posterUrl && (
        <img className="auth-login-media__poster" src={posterUrl} alt="" decoding="async" />
      )}
      {!isReducedMotion && (reusedVideo ? (
        <div ref={attachReusedVideo} />
      ) : (
        <video
          ref={attachOwnVideo}
          className="auth-login-media__video"
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          poster={posterUrl || undefined}
          style={{ opacity: showVideo ? 1 : 0 }}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth > 0 && v.videoHeight > 0) {
              onMediaRatio?.(v.videoWidth / v.videoHeight);
            }
          }}
        >
          <source src={videoUrl} />
        </video>
      ))}
      {/* 通用 loading：常驻挂载、靠透明度淡入淡出，避免与视频淡入抢同一帧 */}
      {!isReducedMotion && (
        <div
          className="auth-login-media__loading"
          style={{ opacity: showLoading ? 1 : 0 }}
          aria-hidden={!showLoading}
        >
          <Spin size="large" />
        </div>
      )}
    </div>
  );
}
