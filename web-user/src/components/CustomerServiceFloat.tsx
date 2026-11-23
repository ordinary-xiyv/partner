import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useStatus } from '../contexts/StatusContext';
import { normalizeCustomerServiceConfig } from '../config/defaultCustomerService';
import { buildPartnerSupportLines, PARTNER_SUPPORT_COPYABLE_LABELS } from '../utils/partnerBrand';
import ContactIcon from '../assets/customer-service-contact.svg?react';
import './customer-service-float.css';

/**
 * 复制一段文字到剪贴板。
 *
 * 为什么不是一句 navigator.clipboard.writeText 就完事：
 * 那个 API 只在安全上下文（HTTPS 或 localhost）可用，而且要求当前页面
 * 正被用户激活。客户站会被部署到各种自建域名上，一部分还是 http ——
 * 直接用会在那些环境下静默失败，用户点了以为复制成功、粘贴出来是空的。
 *
 * 所以留一条兜底路径：临时塞一个 textarea、选中、execCommand('copy')。
 * 这条老路子虽然已标废弃，但覆盖面最广，作为降级完全合适。
 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 落到下面的兜底路径
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    // 不能 display:none —— 那样无法选中；移到视口外再隐藏视觉痕迹
    el.style.position = 'fixed';
    el.style.top = '-9999px';
    el.style.opacity = '0';
    el.setAttribute('readonly', '');
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export default function CustomerServiceFloat() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { siteAppearance, partnerBrand } = useStatus();
  const [panelOpen, setPanelOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [hoverCapable, setHoverCapable] = useState(true);
  const [isPinned, setIsPinned] = useState(false);
  /*
   * 二维码加载失败标记。
   *
   * 商户换了图、或者图后来被从对象存储删掉，<img> 就会渲染成一个破图标。
   * 那种画面比「不显示二维码」更糟 —— 客户会以为客服入口坏了。
   * 所以加载失败就整块收起，只保留文字联系方式。
   */
  const [qrImageOk, setQrImageOk] = useState(true);
  /*
   * 刚复制成功的那一行（存 label）。
   *
   * 用它做「已复制」的即时反馈，1.6 秒后自动复原。
   * 不弹 toast 是因为浮窗本身很小，再叠一个提示框会显得吵；
   * 在行尾原地把「复制」变成「已复制」足够明确，也不打断视线。
   */
  const [copiedLabel, setCopiedLabel] = useState('');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canCollapse = true;
  const isExpanded = isHovered || isPinned;

  const cfg = normalizeCustomerServiceConfig(siteAppearance?.customer_service_config);
  const showContact = Boolean(cfg.enabled && cfg.show_contact);
  const isVisible = showContact;
  const qrUrl = cfg.qr_code_url?.trim() || '';

  // 换了二维码地址就重新给一次机会：上一张失败不代表新图也坏
  useEffect(() => {
    setQrImageOk(true);
  }, [qrUrl]);

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

  /*
   * 点击一行联系方式 → 复制它的值。
   *
   * 无论复制成功与否都给「已复制」反馈：写剪贴板在个别浏览器上确实可能失败，
   * 但这时候弹一个错误提示对「想抄个客服号」的人来说毫无帮助 ——
   * 他更可能直接手动选中复制。反馈保持在原地的短提示就够了。
   */
  const copySupportValue = useCallback(async (label: string, value: string) => {
    await writeClipboard(value);
    setCopiedLabel(label);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      setCopiedLabel('');
      copyTimerRef.current = null;
    }, 1600);
  }, []);

  // 卸载时清掉计时器，避免在已卸载的组件上 setState
  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

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
          {/*
            * 二维码和联系方式各自独立显示。
            *
            * 两者都是「有就显示、没有就不占位」：
            *   · 没传二维码 → 整块二维码区域不渲染，不留空白框、也不弹「暂未配置」
            *   · 没填联系方式 → 不渲染文字列表
            * 只剩二维码和只剩文字这两种情况都能正常收窄，不会出现空白面板。
            */}
          {qrUrl && qrImageOk ? (
            <>
              <div className="customer-service-float__qr-wrap">
                <img
                  src={qrUrl}
                  alt={t('customerService.qrAlt')}
                  className="customer-service-float__qr"
                  onError={() => setQrImageOk(false)}
                />
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
              {partnerLines.map((line) => {
                /*
                 * 邮箱 / 电话 / 微信 点击复制，服务时间不可点。
                 *
                 * 不做成 mailto: / tel: 链接：点邮箱会拉起系统邮件客户端、
                 * 点电话会触发拨号，而客户这里真正想做的多半只是「把客服号
                 * 抄下来」。在桌面浏览器上那两个行为大概率只是弹出一个空窗口。
                 */
                const copyable = (PARTNER_SUPPORT_COPYABLE_LABELS as readonly string[])
                  .includes(line.label);
                return (
                  <li key={line.label} className="customer-service-float__support-row">
                    <span className="customer-service-float__support-label">{line.label}</span>
                    {copyable ? (
                      <button
                        type="button"
                        className="customer-service-float__support-value customer-service-float__support-value--copy"
                        onClick={() => void copySupportValue(line.label, line.value)}
                        title={`点击复制${line.label}`}
                        aria-label={`复制${line.label} ${line.value}`}
                        data-copied={copiedLabel === line.label ? 'true' : 'false'}
                      >
                        {line.value}
                        <span className="customer-service-float__copy-hint" aria-hidden>
                          {copiedLabel === line.label ? t('customerService.copied') : t('customerService.copy')}
                        </span>
                      </button>
                    ) : (
                      <span className="customer-service-float__support-value">{line.value}</span>
                    )}
                  </li>
                );
              })}
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
            {/*
              收起态和展开态共用同一个耳机图标。

              原来这里用的是 customer-service-tab.svg（带麦克风的耳麦），
              而展开后的长条里是耳机 —— 同一个入口，鼠标一悬停麦克风就
              凭空出现或消失，这本身就是一种视觉跳跃。既然它是一个东西的
              两种形态，图形就该只有一个。
            */}
            <ContactIcon className="customer-service-float__tab-icon" />
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
                {/*
                  客服图标：内联 SVG，不是 <img>。

                  必须内联 —— 用 <img src="....svg"> 时 SVG 是独立文档，
                  currentColor 取的是它自己的初始色（黑），不会跟着按钮的
                  文字色走，在品牌色底上就会变成一个黑图标。
                  内联后它就在当前文档流里，currentColor 等于父级 color。
                */}
                <ContactIcon className="customer-service-float__icon-img customer-service-float__icon-img--contact" />
                <span className="customer-service-float__label">{t('customerService.contact')}</span>
              </button>
            ) : null}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
