import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StaticPage from './StaticPage';

export default function News() {
  const { t } = useTranslation();
  return (
    <StaticPage title={t('static.newsTitle')}>
      <p>{t('static.newsIntro')}</p>

      <h2>{t('static.newsSection1Title')}</h2>
      <p>{t('static.newsSection1Body')}</p>
      <ul>
        <li>{t('static.newsSection1Item1')}</li>
        <li>{t('static.newsSection1Item2')}</li>
        <li>{t('static.newsSection1Item3')}</li>
      </ul>

      <h2>{t('static.newsSection2Title')}</h2>
      <p>{t('static.newsSection2Body')}</p>
      <ul>
        <li>{t('static.newsSection2Item1')}</li>
        <li>{t('static.newsSection2Item2')}</li>
        <li>{t('static.newsSection2Item3')}</li>
      </ul>

      <div className="static-page-cta">
        <div>
          <strong>{t('static.newsCtaTitle')}</strong>
          <p>{t('static.newsCtaBody')}</p>
        </div>
        <div className="static-page-cta-actions">
          <Link to="/announcements">{t('static.newsCtaPrimary')}</Link>
        </div>
      </div>
    </StaticPage>
  );
}
