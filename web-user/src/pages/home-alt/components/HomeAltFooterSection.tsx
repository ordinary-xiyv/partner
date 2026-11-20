import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStatus } from '../../../contexts/StatusContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { resolveThemedHeaderLogoUrl } from '../../../types';
import { resolveFooterColumns, resolveFooterLegalLabel } from '../../../utils/footerColumnsFromConfig';
import { normalizeCustomerServiceConfig } from '../../../config/defaultCustomerService';
import { normalizeFooterBrandConfig } from '../../../config/defaultFooterBrand';
import { isChineseLocale } from '../../../i18n/resolveLocale';
import { useLocale } from '../../../i18n/hooks/useLocale';
import { pickLocalizedLabel } from '../../../utils/localeLabels';
import { getSiteLogoResolve, setSiteLogoResolve } from '../../../utils/siteLogoResolveCache';
import footerQrOfficial from '../../../assets/home-alt/footer-qr-official.png';
import footerQrExpert from '../../../assets/home-alt/footer-qr-expert.png';
import footerSocialXiaohongshu from '../../../assets/home-alt/footer-social-xiaohongshu.svg';
import footerSocialBilibili from '../../../assets/home-alt/footer-social-bilibili.svg';
import './home-alt-footer.css';

function renderSocialLogo(opts: {
  visible: boolean;
  url: string;
  src: string;
  alt: string;
  className: string;
}) {
  if (!opts.visible) return null;
  const img = (
    <img src={opts.src} alt={opts.alt} className={opts.className} />
  );
  if (!opts.url) return img;
  const isExternal = opts.url.startsWith('http://') || opts.url.startsWith('https://');
  return (
    <a
      href={opts.url}
      className="home-alt-footer__social-link"
      target={isExternal ? '_blank' : undefined}
      rel="noopener noreferrer"
    >
      {img}
    </a>
  );
}

export function HomeAltFooterSection() {
  const { t } = useTranslation();
  const { siteAppearance, siteLogosThemed, loading: statusLoading } = useStatus();
  const { resolved: themeResolved } = useTheme();
  const { locale } = useLocale();
  const [logoBroken, setLogoBroken] = React.useState(false);

  const remoteLogoSrc = useMemo(
    () => resolveThemedHeaderLogoUrl(themeResolved, siteLogosThemed),
    [themeResolved, siteLogosThemed],
  );

  React.useEffect(() => {
    if (!remoteLogoSrc) {
      setLogoBroken(false);
      return;
    }
    setLogoBroken(getSiteLogoResolve(remoteLogoSrc) === 'broken');
  }, [remoteLogoSrc]);

  const showLogoImage = Boolean(remoteLogoSrc && !statusLoading && !logoBroken);

  const columns = useMemo(() => {
    if (!siteAppearance.footer_columns_config.enabled) return [];
    return resolveFooterColumns(siteAppearance.footer_columns_config.columns, locale);
  }, [siteAppearance.footer_columns_config, locale]);

  const footerBrand = useMemo(
    () => normalizeFooterBrandConfig(siteAppearance.footer_brand_config),
    [siteAppearance.footer_brand_config],
  );

  const copyrightText = useMemo(
    () => resolveFooterLegalLabel(
      siteAppearance.copyright_labels,
      siteAppearance.copyright_text,
      locale,
    ),
    [siteAppearance.copyright_labels, siteAppearance.copyright_text, locale],
  );

  const legalItems = useMemo(() => {
    const items = [
      { key: 'terms', label: t('footer.terms'), href: '/legal' },
      { key: 'privacy', label: t('footer.privacy'), href: '/legal' },
    ];
    if (isChineseLocale(locale)) {
      items.push({
        key: 'beian',
        label: siteAppearance.beian_label?.trim() || '浙ICP备2026017573号-1',
        href: 'https://beian.miit.gov.cn/',
      });
    }
    return items;
  }, [siteAppearance.beian_label, locale, t]);

  const customerService = useMemo(
    () => normalizeCustomerServiceConfig(siteAppearance.customer_service_config),
    [siteAppearance.customer_service_config],
  );
  const feedbackUrl = customerService.feedback_url?.trim() || '/enterprise/apply';

  // 联系区：电话/地址优先取后台配置，留空回退 i18n 默认文案
  const contact = footerBrand.contact;
  const contactVisible = contact.visible !== false;
  const phoneText = contact.phone?.trim() || t('homeAlt.footerPhone');
  const addressText = useMemo(() => {
    const picked = pickLocalizedLabel(contact.address_labels, locale);
    return picked || contact.address_zh?.trim() || contact.address_en?.trim() || t('homeAlt.footerAddress');
  }, [contact.address_labels, contact.address_zh, contact.address_en, locale, t]);
  const addressLines = addressText.split('\n');
  const isAddressMultiline = addressLines.length > 1;

  return (
    <footer className="home-alt-footer">
      <div className="home-section-container home-alt-footer__container">
        <div className="home-alt-footer__panel">
          <div className="home-alt-footer__main">
            <div className="home-alt-footer__brand">
              <Link to="/" className="home-alt-footer__brand-link">
                {showLogoImage ? (
                  <img
                    src={remoteLogoSrc}
                    alt=""
                    className="home-alt-footer__logo"
                    onError={() => {
                      if (!remoteLogoSrc) return;
                      setLogoBroken(true);
                      setSiteLogoResolve(remoteLogoSrc, 'broken');
                    }}
                    onLoad={() => {
                      if (remoteLogoSrc) setSiteLogoResolve(remoteLogoSrc, 'remote');
                    }}
                  />
                ) : null}
              </Link>
              {(footerBrand.bilibili.visible || footerBrand.xiaohongshu.visible) ? (
                <div className="home-alt-footer__social">
                  {renderSocialLogo({
                    visible: footerBrand.bilibili.visible,
                    url: footerBrand.bilibili.url,
                    src: footerSocialBilibili,
                    alt: t('homeAlt.footerBilibili'),
                    className: 'home-alt-footer__social-logo home-alt-footer__social-logo--bili',
                  })}
                  {renderSocialLogo({
                    visible: footerBrand.xiaohongshu.visible,
                    url: footerBrand.xiaohongshu.url,
                    src: footerSocialXiaohongshu,
                    alt: t('homeAlt.footerXiaohongshu'),
                    className: 'home-alt-footer__social-logo home-alt-footer__social-logo--xhs',
                  })}
                </div>
              ) : null}
            </div>

            <div className="home-alt-footer__nav">
              {columns.length > 0 ? (
                <div className="home-alt-footer__columns">
                  {columns.map((col) => (
                    <div key={col.id} className="home-alt-footer__col">
                      <div className="home-alt-footer__col-title">{col.title}</div>
                      <div className="home-alt-footer__col-links">
                        {col.links.map((link) =>
                          link.href ? (
                            <a
                              key={link.id}
                              href={link.href}
                              className="home-alt-footer__link"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {link.label}
                            </a>
                          ) : (
                            <Link key={link.id} to={link.to ?? '/'} className="home-alt-footer__link">
                              {link.label}
                            </Link>
                          ),
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* 联系区：后台可整块隐藏；隐藏时导航列自动占满整行 */}
              {contactVisible ? (
                <div className="home-alt-footer__contact">
                  <div className="home-alt-footer__col-title">{t('home.contactTitle')}</div>
                  <div className="home-alt-footer__contact-rows">
                    <p className="home-alt-footer__contact-line">
                      <span>{t('homeAlt.footerPhoneLabel')}</span>
                      <a
                        href={`tel:${phoneText.replace(/[^\d+]/g, '')}`}
                        className="home-alt-footer__contact-accent"
                      >
                        {phoneText}
                      </a>
                    </p>
                    <p className="home-alt-footer__contact-line">
                      <span>{t('homeAlt.footerBizConsult')}</span>
                      {feedbackUrl.startsWith('http') ? (
                        <a
                          href={feedbackUrl}
                          className="home-alt-footer__contact-accent home-alt-footer__feedback"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t('homeAlt.footerFeedback')}
                        </a>
                      ) : (
                        <Link
                          to={feedbackUrl}
                          className="home-alt-footer__contact-accent home-alt-footer__feedback"
                        >
                          {t('homeAlt.footerFeedback')}
                        </Link>
                      )}
                    </p>
                    <p className="home-alt-footer__contact-line home-alt-footer__contact-address">
                      <span className="home-alt-footer__contact-address-label">
                        {t('homeAlt.footerAddressLabel')}
                      </span>
                      <span
                        className={`home-alt-footer__contact-address-value${isAddressMultiline ? ' is-multiline' : ''}`}
                      >
                        {addressLines.map((line, index) => (
                          <React.Fragment key={`${line}-${index}`}>
                            {index > 0 ? <br /> : null}
                            {line}
                          </React.Fragment>
                        ))}
                      </span>
                    </p>
                  </div>
                  {footerBrand.official_qr.visible || footerBrand.expert_qr.visible ? (
                    <div className="home-alt-footer__qr-row">
                      {footerBrand.official_qr.visible ? (
                        <div className="home-alt-footer__qr-card">
                          <div className="home-alt-footer__qr-frame">
                            <img
                              src={footerBrand.official_qr.url?.trim() || footerQrOfficial}
                              alt=""
                              className="home-alt-footer__qr-img"
                            />
                          </div>
                          <span className="home-alt-footer__qr-label">{t('homeAlt.footerQrOfficial')}</span>
                        </div>
                      ) : null}
                      {footerBrand.expert_qr.visible ? (
                        <div className="home-alt-footer__qr-card">
                          <div className="home-alt-footer__qr-frame">
                            <img
                              src={footerBrand.expert_qr.url?.trim() || footerQrExpert}
                              alt=""
                              className="home-alt-footer__qr-img"
                            />
                          </div>
                          <span className="home-alt-footer__qr-label">{t('homeAlt.footerQrExpert')}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {siteAppearance.footer_copyright_config.enabled ? (
            <div className="home-alt-footer__bottom">
              <span className="home-alt-footer__copyright">
                {copyrightText || (
                  <>
                    © {new Date().getFullYear()}, {t('footer.companyName')}
                    {t('footer.allRightsReserved')}
                  </>
                )}
              </span>
              <div className="home-alt-footer__legal">
                {legalItems.map((item, index) => (
                  <React.Fragment key={item.key}>
                    {index > 0 ? <span className="home-alt-footer__legal-sep">|</span> : null}
                    <a
                      href={item.href}
                      className="home-alt-footer__legal-link"
                      target={item.href.startsWith('http') ? '_blank' : undefined}
                      rel="noopener noreferrer"
                    >
                      {item.label}
                    </a>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
