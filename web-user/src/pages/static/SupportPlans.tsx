import React from 'react';
import { useTranslation } from 'react-i18next';
import StaticPage from './StaticPage';

export default function SupportPlans() {
  const { t } = useTranslation();
  const sections = [1, 2].map((i) => ({
    title: t(`static.supportPlansSection${i}Title`),
    body: t(`static.supportPlansSection${i}Body`),
    items: [1, 2, 3].map((j) => t(`static.supportPlansSection${i}Item${j}`)),
  }));

  return (
    <StaticPage title={t('static.supportPlansTitle')}>
      <div className="static-hero-note">
        <strong>{t('static.supportPlansIntro')}</strong>
        <p>{t('static.supportPlansSection3Body')}</p>
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
    </StaticPage>
  );
}
