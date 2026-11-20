import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUser } from '../contexts/UserContext';
import { useStatus } from '../contexts/StatusContext';
import { useAuthModal } from '../contexts/AuthModalContext';
import { notify } from '../ui/notify';
import {
  isExternalMarketingLink,
  shouldShowMarketingBanner,
} from '../utils/marketingBannerSchedule';
import './marketing-top-banner.css';

/** SPA 会话内持久化：组件卸载/隐藏后仍保留上一张成功图 */
let persistedMarketingBannerBg: { fileId: string; url: string } | null = null;

function syncMarketingBannerHeight(el: HTMLElement | null) {
  const height = el?.offsetHeight ?? 0;
  document.documentElement.style.setProperty(
    '--app-marketing-banner-height',
    `${height}px`,
  );
}

export default function MarketingTopBanner() {
  const { t } = useTranslation();
  const { user } = useUser();
  const { siteAppearance } = useStatus();
  const { openLogin } = useAuthModal();
  const navigate = useNavigate();
  const bannerRef = useRef<HTMLDivElement>(null);

  /** 当前持久展示的底图（失败不回退清空） */
  const [paintUrl, setPaintUrl] = useState(
    () => persistedMarketingBannerBg?.url ?? '',
  );
  /** 预加载中的下一张，加载成功后再盖上去，实现无感切换 */
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [pendingReady, setPendingReady] = useState(false);
  const paintUrlRef = useRef(paintUrl);
  const pendingUrlRef = useRef<string | null>(null);

  const cfg = siteAppearance.marketing_banner_config;
  const isVisible = shouldShowMarketingBanner(cfg);
  const isStaticAd = Boolean(cfg.static_ad);
  const fileId = cfg.background_image_file_id?.trim() || '';
  const incomingUrl = cfg.background_image_url?.trim() || '';

  useEffect(() => {
    paintUrlRef.current = paintUrl;
  }, [paintUrl]);

  useEffect(() => {
    pendingUrlRef.current = pendingUrl;
  }, [pendingUrl]);

  // 新 URL：先预加载；成功再切；失败继续用上一张。隐藏时也不清空已展示图。
  useEffect(() => {
    if (!isVisible) return;
    if (!incomingUrl) return;
    if (incomingUrl === paintUrlRef.current) return;
    if (incomingUrl === pendingUrlRef.current) return;

    let cancelled = false;
    setPendingReady(false);
    setPendingUrl(incomingUrl);

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setPendingReady(true);
    };
    img.onerror = () => {
      if (cancelled) return;
      // 新签失败：丢掉 pending，保留 paintUrl
      setPendingUrl(null);
      setPendingReady(false);
    };
    img.src = incomingUrl;

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
      img.src = '';
    };
  }, [isVisible, incomingUrl]);

  // pending 就绪后盖到上层，再提升为持久底图（同图换签几乎无感）
  useEffect(() => {
    if (!pendingReady || !pendingUrl) return;

    const url = pendingUrl;
    const id = fileId;
    const raf = window.requestAnimationFrame(() => {
      paintUrlRef.current = url;
      setPaintUrl(url);
      persistedMarketingBannerBg = { fileId: id, url };
      setPendingUrl(null);
      setPendingReady(false);
    });

    return () => window.cancelAnimationFrame(raf);
  }, [pendingReady, pendingUrl, fileId]);

  useLayoutEffect(() => {
    if (!isVisible) {
      syncMarketingBannerHeight(null);
      return undefined;
    }

    const el = bannerRef.current;
    if (!el) {
      syncMarketingBannerHeight(null);
      return undefined;
    }

    const update = () => syncMarketingBannerHeight(el);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);

    return () => {
      observer.disconnect();
      syncMarketingBannerHeight(null);
    };
  }, [isVisible, paintUrl, pendingReady]);

  const handleAction = useCallback(() => {
    if (isStaticAd) return;
    const link = cfg.link_url?.trim();
    if (!link) return;

    if (!user) {
      notify.info(t('marketingBanner.loginRequired'));
      openLogin();
      return;
    }

    if (isExternalMarketingLink(link)) {
      window.open(link, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(link);
  }, [isStaticAd, user, cfg.link_url, openLogin, navigate, t]);

  if (!isVisible) {
    return null;
  }

  // 首屏：缓存 / 已展示 / 正在预加载的都可撑住高度，避免空白条
  const flowUrl = paintUrl || (pendingReady ? pendingUrl : null);
  const showPendingOverlay = Boolean(paintUrl && pendingUrl && pendingReady);

  return (
    <div
      ref={bannerRef}
      className={[
        'marketing-top-banner',
        isStaticAd ? 'marketing-top-banner--static' : '',
      ].filter(Boolean).join(' ')}
      role={isStaticAd ? 'presentation' : 'button'}
      tabIndex={isStaticAd ? undefined : 0}
      aria-label={isStaticAd ? undefined : t('marketingBanner.bannerAriaLabel')}
      onClick={isStaticAd ? undefined : handleAction}
      onKeyDown={isStaticAd ? undefined : (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleAction();
        }
      }}
    >
      {flowUrl ? (
        <img
          className="marketing-top-banner__img"
          src={flowUrl}
          alt=""
          aria-hidden
          draggable={false}
          onLoad={() => {
            syncMarketingBannerHeight(bannerRef.current);
          }}
        />
      ) : null}
      {showPendingOverlay && pendingUrl ? (
        <img
          className="marketing-top-banner__img marketing-top-banner__img--pending"
          src={pendingUrl}
          alt=""
          aria-hidden
          draggable={false}
        />
      ) : null}
    </div>
  );
}
