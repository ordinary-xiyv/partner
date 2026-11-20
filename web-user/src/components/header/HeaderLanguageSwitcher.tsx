import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../i18n/hooks/useLocale';
import type { AppLocale } from '../../i18n/config';

interface HeaderLanguageSwitcherProps {
  variant?: 'button' | 'menu-items';
  onSelect?: () => void;
  placement?: 'bottom' | 'top';
}

export default function HeaderLanguageSwitcher({
  variant = 'button',
  onSelect,
  placement = 'bottom',
}: HeaderLanguageSwitcherProps) {
  const { t } = useTranslation();
  const { locale, meta, supportedLocales, changeLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  const handleSelect = (next: AppLocale) => {
    changeLocale(next);
    setOpen(false);
    onSelect?.();
  };

  if (variant === 'menu-items') {
    return (
      <>
        {supportedLocales.map((item) => (
          <button
            key={item.code}
            type="button"
            role="menuitem"
            className={`header-utilities__item header-utilities__item--text header-language-menu__item${
              item.code === locale ? ' header-language-menu__item--active' : ''
            }`}
            aria-label={item.nativeLabel}
            title={item.nativeLabel}
            aria-current={item.code === locale ? 'true' : undefined}
            onClick={() => handleSelect(item.code)}
          >
            {item.nativeLabel}
          </button>
        ))}
      </>
    );
  }

  return (
    <div ref={rootRef} className="header-language-switcher">
      <button
        type="button"
        className="header-layout-switcher__btn header-layout-switcher__btn--solo header-layout-switcher__btn--text header-language-switcher__trigger"
        title={t('language')}
        aria-label={t('language')}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {meta.shortLabel}
      </button>
      {open ? (
        <div
          className={`header-language-switcher__menu${
            placement === 'top' ? ' header-language-switcher__menu--drop-up' : ''
          }`}
          role="listbox"
          aria-label={t('language')}
        >
          {supportedLocales.map((item) => (
            <button
              key={item.code}
              type="button"
              role="option"
              className={`header-language-switcher__option${
                item.code === locale ? ' header-language-switcher__option--active' : ''
              }`}
              aria-selected={item.code === locale}
              onClick={() => handleSelect(item.code)}
            >
              {item.nativeLabel}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
