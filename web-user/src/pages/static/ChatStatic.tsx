import React from 'react';
import { useTranslation } from 'react-i18next';
import StaticPage from './StaticPage';

export default function ChatStatic() {
  const { t } = useTranslation();
  return (
    <StaticPage title={t('static.chatTitle')}>
      <p>{t('static.chatIntro')}</p>

      <h2>{t('static.chatSection1Title')}</h2>
      <p>{t('static.chatSection1Body')}</p>
      <ul>
        <li>{t('static.chatSection1Item1')}</li>
        <li>{t('static.chatSection1Item2')}</li>
        <li>{t('static.chatSection1Item3')}</li>
      </ul>
    </StaticPage>
  );
}
