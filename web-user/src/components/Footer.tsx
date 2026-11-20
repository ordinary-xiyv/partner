/**
 * Footer — 全站底部
 * 结构：五列链接（读 siteAppearance.footer_columns_config）| 底部版权+备案
 */
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStatus } from '../contexts/StatusContext';
import { resolveFooterColumns, resolveFooterLegalLabel } from '../utils/footerColumnsFromConfig';
import { isChineseLocale } from '../i18n/resolveLocale';
import { useLocale } from '../i18n/hooks/useLocale';
import './footer.css';

export default function Footer({ className }: { className?: string; fullWidth?: boolean }) {
  const { t } = useTranslation();
  const { siteAppearance } = useStatus();
  const { locale } = useLocale();

  const columns = useMemo(() => {
    if (!siteAppearance.footer_columns_config.enabled) return [];
    return resolveFooterColumns(siteAppearance.footer_columns_config.columns, locale);
  }, [siteAppearance.footer_columns_config, locale]);

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
      {
        key: 'terms',
        label: t('footer.terms'),
        href: '/legal',
      },
      {
        key: 'privacy',
        label: t('footer.privacy'),
        href: '/legal',
      },
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

  return (
    <footer className={['site-footer', className].filter(Boolean).join(' ')}>
      <div className="site-footer__inner">
        {columns.length > 0 ? (
          <div className="site-footer__columns">
            {columns.map((col) => (
              <div key={col.id} className="site-footer__col">
                <div className="site-footer__col-title">{col.title}</div>
                <div className="site-footer__col-links">
                  {col.links.map((link) =>
                    link.href ? (
                      <a
                        key={link.id}
                        href={link.href}
                        className="site-footer__link"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link key={link.id} to={link.to ?? '/'} className="site-footer__link">
                        {link.label}
                      </Link>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {siteAppearance.footer_copyright_config.enabled ? (
          <div className="site-footer__bottom">
            <span className="site-footer__copyright">
              {copyrightText ? (
                copyrightText
              ) : (
                <>
                  © {new Date().getFullYear()}, {t('footer.companyName')}
                  {t('footer.allRightsReserved')}
                </>
              )}
            </span>
            <div className="site-footer__legal">
              {legalItems.map((item, index) => (
                <React.Fragment key={item.key}>
                  {index > 0 && <span className="site-footer__legal-sep">|</span>}
                  <a
                    href={item.href}
                    className="site-footer__legal-link"
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
    </footer>
  );
}
