import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HomeOutlined } from '@ant-design/icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import HeaderConsoleButton from './HeaderConsoleButton';
import HeaderLanguageSwitcher from './HeaderLanguageSwitcher';
import HeaderThemeSwitcher from './HeaderThemeSwitcher';

interface HeaderUtilitiesProps {
  showConsole?: boolean;
  showLanguage?: boolean;
  showTheme?: boolean;
}

export default function HeaderUtilities({
  showConsole = false,
  showLanguage = false,
  showTheme = false,
}: HeaderUtilitiesProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { resolved, setMode } = useTheme();
  const { isDesktop } = useBreakpoint();
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const visibleCount = [showConsole, showLanguage, showTheme].filter(Boolean).length;

  const themeIcon = resolved === 'light' ? '☀️' : '🌙';

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [menuOpen]);

  if (visibleCount === 0) return null;

  const useCompactMenu = !isDesktop && visibleCount > 1;

  if (!useCompactMenu) {
    return (
      <div className="header-utilities header-utilities--expanded">
        {showConsole ? <HeaderConsoleButton /> : null}
        {showLanguage ? <HeaderLanguageSwitcher /> : null}
        {showTheme ? <HeaderThemeSwitcher /> : null}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="header-utilities header-utilities--compact">
      <button
        type="button"
        className="header-utilities__trigger"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={t('header.moreTools', { defaultValue: 'More options' })}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <circle cx="4" cy="9" r="1.5" fill="currentColor" />
          <circle cx="9" cy="9" r="1.5" fill="currentColor" />
          <circle cx="14" cy="9" r="1.5" fill="currentColor" />
        </svg>
      </button>
      {menuOpen ? (
        <div className="header-utilities__menu" role="menu">
          {showConsole ? (
            <button
              type="button"
              role="menuitem"
              className="header-utilities__item"
              aria-label={t('dashboard')}
              title={t('dashboard')}
              onClick={() => {
                navigate('/dashboard');
                setMenuOpen(false);
              }}
            >
              <HomeOutlined style={{ fontSize: 16 }} />
            </button>
          ) : null}
          {showLanguage ? (
            <HeaderLanguageSwitcher
              variant="menu-items"
              onSelect={() => setMenuOpen(false)}
            />
          ) : null}
          {showTheme ? (
            <button
              type="button"
              role="menuitem"
              className="header-utilities__item"
              aria-label={t('header.theme')}
              title={t('header.theme')}
              onClick={() => {
                setMode(resolved === 'light' ? 'dark' : 'light');
                setMenuOpen(false);
              }}
            >
              {themeIcon}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
