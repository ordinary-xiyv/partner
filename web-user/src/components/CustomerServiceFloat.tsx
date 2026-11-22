import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useStatus } from '../contexts/StatusContext';
import { normalizeCustomerServiceConfig } from '../config/defaultCustomerService';
import { buildPartnerSupportLines } from '../utils/partnerBrand';
import contactIcon from '../assets/customer-service-contact.png';
import feedbackIcon from '../assets/customer-service-feedback.svg';
import CollapseTabIcon from '../assets/customer-service-tab.svg?react';
import './customer-service-float.css';

function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export default function CustomerServiceFloat() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { siteAppearance, partnerBrand } = useStatus();
  const [panelOpen, setPanelOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [hoverCapable, setHoverCapable] = useState(true);
  const [isPinned, setIsPinned] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canCollapse = true;
  const isExpanded = isHovered || isPinned;

  const cfg = normalizeCustomerServiceConfig(siteAppearance?.customer_service_config);
  const showContact = Boolean(cfg.enabled && cfg.show_contact);
  const showFeedback = Boolean(cfg.enabled && cfg.show_feedback);
  const isVisible = showContact || showFeedback;
  const qrUrl = cfg.qr_code_url?.trim() || '';
  const feedbackUrl = cfg.feedback_url?.trim() || '';

  /*
   * 伙伴后台给的是文本联系方式（邮箱/电话/微信/服务时间），没有二维码。
   *
   * 两者都要支持，而不是二选一：
   *   · 平台运营配了二维码 → 显示二维码（原有的、面向平台客户的方式）
   *   · 商户在伙伴后台填了联系方式 → 显示文本行
   * 一家商户可能两种都配，那就都展示 —— 二维码在上、联系方式在下，
   * 客户想扫码扫码、想打电话打电话。
   */
  const partnerLines = React.useMemo(
    () => buildPartnerSupportLines(partnerBrand?.support),
    [partnerBrand],
  );
  const hasPartnerLines = partnerLines.length > 0;

  const closePanel = useCallback(() => setPanelOpen(false), []);

  useEffect(() => {
    if (!showContact) setPanelOpen(false);
  }, [showContact]);

  useEffect(() => {
    const media = window.matchMedia('(hover: hover) and (pointer: fine)');
    const syncHoverCapable = () => setHoverCapable(media.matches);
    syncHoverCapable();
    media.addEventListener('change', syncHoverCapable);
    return () => media.removeEventListener('change', syncHoverCapable);
  }, []);

  useEffect(() => {
    if (!canCollapse) return;
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    setIsHovered(false);
    setIsPinned(false);
    setPanelOpen(false);
  }, [pathname, canCollapse]);

  useEffect(() => () => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
  }, []);

  const handleMouseEnter = () => {
    if (!canCollapse) return;
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    if (!canCollapse || !hoverCapable) return;
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = setTimeout(() => {
      setIsHovered(false);
      setPanelOpen(false);
      collapseTimerRef.current = null;
    }, 280);
  };

  const collapseFloat = useCallback(() => {
    setIsPinned(false);
    setIsHovered(false);
    setPanelOpen(false);
  }, []);

  useEffect(() => {
    if (!panelOpen && !(canCollapse && isPinned)) return undefined;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const target = event.target as Node | null;
      if (target && !root.contains(target)) {
        if (canCollapse && isPinned) collapseFloat();
        else closePanel();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (canCollapse && isPinned) collapseFloat();
      else closePanel();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [panelOpen, closePanel, canCollapse, isPinned, collapseFloat]);

  if (!isVisible) {
    return null;
  }

  const handleContactClick = () => {
    setPanelOpen((open) => !open);
  };

  const handleFeedbackClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!feedbackUrl) {
      event.preventDefault();
      return;
    }
    if (isExternalUrl(feedbackUrl)) {
      event.preventDefault();
      window.open(feedbackUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      ref={rootRef}
      className={[
        'customer-service-float-dock',
        canCollapse ? 'customer-service-float-dock--collapsible' : '',
      ].filter(Boolean).join(' ')}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={[
          'customer-service-float',
          canCollapse ? 'customer-service-float--collapsible' : '',
          isExpanded ? 'customer-service-float--expanded' : '',
        ].filter(Boolean).join(' ')}
        aria-live="polite"
      >
      {showContact && panelOpen && isExpanded ? (
        <div
          className="customer-service-float__panel"
          role="dialog"
          aria-modal="false"
          aria-label={t('customerService.dialogAriaLabel')}
        >
          <h3 className="customer-service-float__title">{t('customerService.popupTitle')}</h3>
          <p className="customer-service-float__subtitle">{t('customerService.popupSubtitle')}</p>
          {/*
            * 二维码和联系方式各自独立显示。
            *
            * 原来这里是「有二维码就显示，没有就显示『暂未配置二维码』」——
            * 商户在伙伴后台填了邮箱电话之后，还弹一句「暂未配置二维码」很奇怪，
            * 而且会让客户以为这个客服入口是坏的。所以只要伙伴给了联系方式，
            * 就不显示那个占位，直接列联系方式。
            */}
          {qrUrl || !hasPartnerLines ? (
            <>
              <div className="customer-service-float__qr-wrap">
                {qrUrl ? (
                  <img
                    src={qrUrl}
                    alt={t('customerService.qrAlt')}
                    className="customer-service-float__qr"
                  />
                ) : (
                  <div className="customer-service-float__qr-placeholder">
                    {t('customerService.qrMissing')}
                  </div>
                )}
              </div>
              <p className="customer-service-float__scan-tip">
                <Trans
                  i18nKey="customerService.scanTip"
                  components={{ 1: <span className="customer-service-float__scan-tip-highlight" /> }}
                />
              </p>
            </>
          ) : null}
          {hasPartnerLines ? (
            <ul className="customer-service-float__support-list">
              {partnerLines.map((line) => (
                <li key={line.label} className="customer-service-float__support-row">
                  <span className="customer-service-float__support-label">{line.label}</span>
                  {line.href ? (
                    <a
                      className="customer-service-float__support-value customer-service-float__support-value--link"
                      href={line.href}
                    >
                      {line.value}
                    </a>
                  ) : (
                    <span className="customer-service-float__support-value">{line.value}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="customer-service-float__bar-shell">
        {canCollapse && !isExpanded ? (
          <button
            type="button"
            className="customer-service-float__tab"
            aria-label={t('customerService.contact')}
            onClick={() => {
              setIsPinned(true);
              setIsHovered(true);
            }}
          >
            <CollapseTabIcon className="customer-service-float__tab-icon" />
          </button>
        ) : (
          <div className="customer-service-float__bar">
            {showContact ? (
              <button
                type="button"
                className={`customer-service-float__item${panelOpen ? ' customer-service-float__item--active' : ''}`}
                aria-expanded={panelOpen}
                aria-label={t('customerService.contact')}
                onClick={handleContactClick}
              >
                <img
                  src={contactIcon}
                  alt=""
                  aria-hidden
                  className="customer-service-float__icon-img customer-service-float__icon-img--contact"
                />
                <span className="customer-service-float__label">{t('customerService.contact')}</span>
              </button>
            ) : null}

            {showFeedback ? (
              feedbackUrl ? (
                <a
                  href={feedbackUrl}
                  className="customer-service-float__item"
                  aria-label={t('customerService.feedback')}
                  onClick={handleFeedbackClick}
                  {...(isExternalUrl(feedbackUrl) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  <img
                    src={feedbackIcon}
                    alt=""
                    aria-hidden
                    className="customer-service-float__icon-img customer-service-float__icon-img--feedback"
                  />
                  <span className="customer-service-float__label">{t('customerService.feedback')}</span>
                </a>
              ) : (
                <button
                  type="button"
                  className="customer-service-float__item"
                  aria-label={t('customerService.feedback')}
                  disabled
                >
                  <img
                    src={feedbackIcon}
                    alt=""
                    aria-hidden
                    className="customer-service-float__icon-img customer-service-float__icon-img--feedback"
                  />
                  <span className="customer-service-float__label">{t('customerService.feedback')}</span>
                </button>
              )
            ) : null}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
