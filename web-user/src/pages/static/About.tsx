import React from 'react';
import { useTranslation } from 'react-i18next';
import StaticPage from './StaticPage';

export default function About() {
  const { t } = useTranslation();
  return (
    <StaticPage title={t('static.aboutTitle')}>
      <p>{t('static.aboutIntro')}</p>

      <h2>{t('static.aboutSection1Title')}</h2>
      <p>{t('static.aboutSection1Body')}</p>
      <ul>
        <li>{t('static.aboutSection1Item1')}</li>
        <li>{t('static.aboutSection1Item2')}</li>
        <li>{t('static.aboutSection1Item3')}</li>
      </ul>

      <h2>{t('static.aboutSection2Title')}</h2>
      <p>{t('static.aboutSection2Body')}</p>
      <ul>
        <li>{t('static.aboutSection2Item1')}</li>
        <li>{t('static.aboutSection2Item2')}</li>
        <li>{t('static.aboutSection2Item3')}</li>
      </ul>

      <h2>{t('static.aboutSection3Title')}</h2>
      <p>{t('static.aboutSection3Body')}</p>
    </StaticPage>
  );
}
