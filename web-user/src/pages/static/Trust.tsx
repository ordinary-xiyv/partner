import React from 'react';
import { useTranslation } from 'react-i18next';
import { DocsExternalLink } from '../../components/DocsExternalLink';
import StaticPage from './StaticPage';

export default function Trust() {
  const { t } = useTranslation();
  const sections = [1, 2].map((i) => ({
    title: t(`static.trustSection${i}Title`),
    body: t(`static.trustSection${i}Body`),
    items: [1, 2, 3].map((j) => t(`static.trustSection${i}Item${j}`)),
  }));

  return (
    <StaticPage title={t('static.trustTitle')}>
      <div className="static-hero-note">
        <strong>{t('static.trustIntro')}</strong>
        <p>{t('static.trustSection3Body')}</p>
      </div>

      <div className="static-grid-2">
        {sections.map((section) => (
          <section key={section.title} className="static-feature-card">
            <h2>{section.title}</h2>
            <p>{section.body}</p>
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="static-highlight-card">
        <div className="static-kicker">{t('static.trustSection3Title')}</div>
        <h2>{t('static.trustCtaTitle')}</h2>
        <p>{t('static.trustCtaBody')}</p>
        <div className="static-page-cta-actions">
          <DocsExternalLink>{t('static.trustCtaPrimary')}</DocsExternalLink>
        </div>
      </section>
    </StaticPage>
  );
}
