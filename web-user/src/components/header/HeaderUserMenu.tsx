import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../contexts/UserContext';
import { usePermissions } from '../../hooks/usePermissions';
import { getRoleName } from '../../utils';

interface HeaderUserMenuProps {
  placement?: 'bottom' | 'top';
  nameClassName?: string;
  hideSettings?: boolean;
}

export default function HeaderUserMenu({
  placement = 'bottom',
  nameClassName,
  hideSettings = false,
}: HeaderUserMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useUser();
  const { hasAnyStaff, systemSettingsLandingPath } = usePermissions();
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

  if (!user) return null;

  const items = [
    { to: '/profile', label: t('profile'), icon: '⚙️' },
    ...(!hideSettings && systemSettingsLandingPath
      ? [{ to: systemSettingsLandingPath, label: t('settings'), icon: '🛡️' }]
      : []),
  ];

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate('/');
  };

  return (
    <div ref={rootRef} className="header-user-menu">
      <button
        type="button"
        className="app-header-user-trigger"
        aria-expanded={open}
        aria-label={user.display_name || user.username}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="app-header-user-avatar">
          {user.username?.[0]?.toUpperCase() || 'U'}
        </div>
        <span className={['header-user-menu__name', nameClassName].filter(Boolean).join(' ')}>
          {user.display_name || user.username}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`header-user-menu__chevron${open ? ' header-user-menu__chevron--open' : ''}`}
          aria-hidden
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open ? (
        <div
          className={`header-user-menu__panel${placement === 'top' ? ' header-user-menu__panel--drop-up' : ''}`}
        >
          <div className="header-user-menu__info">
            <div className="header-user-menu__info-name">
              {user.display_name || user.username}
            </div>
            <div className="header-user-menu__info-meta">
              {user.email || (hasAnyStaff ? t(getRoleName(user.role)) : t('header.roleUser'))}
            </div>
          </div>

          {items.map((item) => (
            <button
              key={item.to}
              type="button"
              className="header-user-menu__item"
              onClick={() => {
                setOpen(false);
                navigate(item.to);
              }}
            >
              <span className="header-user-menu__item-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}

          <button type="button" className="header-user-menu__item header-user-menu__item--danger" onClick={() => void handleLogout()}>
            <span className="header-user-menu__item-icon">↩</span>
            {t('header.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
