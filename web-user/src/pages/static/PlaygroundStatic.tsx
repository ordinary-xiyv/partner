import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DocsExternalLink } from '../../components/DocsExternalLink';
import StaticPage from './StaticPage';

export default function PlaygroundStatic() {
  const { t } = useTranslation();
  return (
    <StaticPage title={t('static.playgroundTitle')}>
      <p>{t('static.playgroundIntro')}</p>

      <h2>{t('static.playgroundSection1Title')}</h2>
      <p>{t('static.playgroundSection1Body')}</p>
      <ul>
        <li>{t('static.playgroundSection1Item1')}</li>
        <li>{t('static.playgroundSection1Item2')}</li>
        <li>{t('static.playgroundSection1Item3')}</li>
      </ul>

      <div className="static-page-cta">
        <div>
          <strong>{t('static.playgroundCtaTitle')}</strong>
          <p>{t('static.playgroundCtaBody')}</p>
        </div>
        <div className="static-page-cta-actions">
          <DocsExternalLink>{t('static.playgroundCtaPrimary')}</DocsExternalLink>
          <Link to="/pricing">{t('static.playgroundCtaSecondary')}</Link>
        </div>
      </div>
    </StaticPage>
  );
}
