import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StaticPage from './StaticPage';

export default function ServiceStatus() {
  const { t } = useTranslation();
  return (
    <StaticPage title={t('static.serviceStatusTitle')}>
      <p>{t('static.serviceStatusIntro')}</p>

      <h2>{t('static.serviceStatusSection1Title')}</h2>
      <p>{t('static.serviceStatusSection1Body')}</p>
      <ul>
        <li>{t('static.serviceStatusSection1Item1')}</li>
        <li>{t('static.serviceStatusSection1Item2')}</li>
        <li>{t('static.serviceStatusSection1Item3')}</li>
      </ul>

      <h2>{t('static.serviceStatusSection2Title')}</h2>
      <p>{t('static.serviceStatusSection2Body')}</p>
      <ul>
        <li>{t('static.serviceStatusSection2Item1')}</li>
        <li>{t('static.serviceStatusSection2Item2')}</li>
        <li>{t('static.serviceStatusSection2Item3')}</li>
      </ul>

      <div className="static-page-cta">
        <div>
          <strong>{t('static.serviceStatusCtaTitle')}</strong>
          <p>{t('static.serviceStatusCtaBody')}</p>
        </div>
        <div className="static-page-cta-actions">
          <Link to="/announcements">{t('static.serviceStatusCtaPrimary')}</Link>
          <Link to="/enterprise/apply">{t('static.serviceStatusCtaSecondary')}</Link>
        </div>
      </div>
    </StaticPage>
  );
}
