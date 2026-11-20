import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';

type ThemeMode = 'light' | 'dark';

const THEME_META: Record<ThemeMode, { icon: string; label: string }> = {
  light: { icon: '☀️', label: 'Light' },
  dark: { icon: '🌙', label: 'Dark' },
};

export default function HeaderThemeSwitcher() {
  const { t } = useTranslation();
  const { resolved, setMode } = useTheme();
  const current = THEME_META[resolved];

  const toggleTheme = () => {
    setMode(resolved === 'light' ? 'dark' : 'light');
  };

  return (
    <button
      type="button"
      className="header-layout-switcher__btn header-layout-switcher__btn--solo"
      title={`${t('header.theme')}: ${current.label}`}
      aria-label={`${t('header.theme')}: ${current.label}`}
      onClick={toggleTheme}
    >
      {current.icon}
    </button>
  );
}
