import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DocsExternalLink } from '../../components/DocsExternalLink';
import StaticPage from './StaticPage';

export default function Announcements() {
  const { t } = useTranslation();
  return (
    <StaticPage title={t('static.announcementsTitle')}>
      <p>{t('static.announcementsIntro')}</p>

      <h2>{t('static.announcementsSection1Title')}</h2>
      <p>{t('static.announcementsSection1Body')}</p>
      <ul>
        <li>{t('static.announcementsSection1Item1')}</li>
        <li>{t('static.announcementsSection1Item2')}</li>
        <li>{t('static.announcementsSection1Item3')}</li>
      </ul>

      <h2>{t('static.announcementsSection2Title')}</h2>
      <p>{t('static.announcementsSection2Body')}</p>
      <ul>
        <li>{t('static.announcementsSection2Item1')}</li>
        <li>{t('static.announcementsSection2Item2')}</li>
        <li>{t('static.announcementsSection2Item3')}</li>
      </ul>

      <div className="static-page-cta">
        <div>
          <strong>{t('static.announcementsCtaTitle')}</strong>
          <p>{t('static.announcementsCtaBody')}</p>
        </div>
        <div className="static-page-cta-actions">
          <Link to="/status-page">{t('static.announcementsCtaPrimary')}</Link>
          <DocsExternalLink>{t('static.announcementsCtaSecondary')}</DocsExternalLink>
        </div>
      </div>
    </StaticPage>
  );
}
