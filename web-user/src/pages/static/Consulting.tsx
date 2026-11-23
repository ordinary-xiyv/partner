import React from 'react';
import { useTranslation } from 'react-i18next';
import StaticPage from './StaticPage';

export default function Consulting() {
  const { t } = useTranslation();
  const sections = [1, 2].map((i) => ({
    title: t(`static.consultingSection${i}Title`),
    body: t(`static.consultingSection${i}Body`),
    items: [1, 2, 3].map((j) => t(`static.consultingSection${i}Item${j}`)),
  }));

  return (
    <StaticPage title={t('static.consultingTitle')}>
      <div className="static-hero-note">
        <strong>{t('static.consultingIntro')}</strong>
        <p>{t('static.consultingSection3Body')}</p>
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
