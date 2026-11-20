import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HomeOutlined } from '@ant-design/icons';

export default function HeaderConsoleButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="header-layout-switcher__btn header-layout-switcher__btn--solo"
      title={t('dashboard')}
      aria-label={t('dashboard')}
      onClick={() => navigate('/dashboard')}
    >
      <HomeOutlined style={{ fontSize: 16 }} />
    </button>
  );
}
