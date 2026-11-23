import React from 'react';
import { useTranslation } from 'react-i18next';
import StaticPage from './StaticPage';

export default function Legal() {
  const { t } = useTranslation();
  return (
    <StaticPage title={t('static.legalTitle')}>
      <p>{t('static.legalIntro')}</p>

      <h2>{t('static.legalSection1Title')}</h2>
      <p>{t('static.legalSection1Body')}</p>
      <ul>
        <li>{t('static.legalSection1Item1')}</li>
        <li>{t('static.legalSection1Item2')}</li>
        <li>{t('static.legalSection1Item3')}</li>
      </ul>

      <h2>{t('static.legalSection2Title')}</h2>
      <p>{t('static.legalSection2Body')}</p>
      <ul>
        <li>{t('static.legalSection2Item1')}</li>
        <li>{t('static.legalSection2Item2')}</li>
        <li>{t('static.legalSection2Item3')}</li>
      </ul>

      <h2>{t('static.legalSection3Title')}</h2>
      <p>{t('static.legalSection3Body')}</p>
    </StaticPage>
  );
}
