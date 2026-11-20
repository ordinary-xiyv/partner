import { useTranslation } from 'react-i18next';
import { useStatus } from '../contexts/StatusContext';
import { useUser } from '../contexts/UserContext';
import { useAuthModal } from '../contexts/AuthModalContext';
import HeaderLanguageSwitcher from '../components/header/HeaderLanguageSwitcher';
import HeaderThemeSwitcher from '../components/header/HeaderThemeSwitcher';
import HeaderUserMenu from '../components/header/HeaderUserMenu';

interface SidebarAccountDockProps {
  showUser?: boolean;
}

export default function SidebarAccountDock({ showUser = true }: SidebarAccountDockProps) {
  const { t } = useTranslation();
  const { user } = useUser();
  const { openLogin } = useAuthModal();
  const { siteAppearance } = useStatus();
  const showTheme = siteAppearance.layout_config.show_theme_switcher;
  const showLanguage = siteAppearance.layout_config.show_language_switcher;
  const showTools = showLanguage || showTheme;

  if (!showUser && !showTools) return null;

  return (
    <div className={`layout-sidebar-account${showUser ? '' : ' layout-sidebar-account--tools-only'}`}>
      {showUser ? (
        user ? (
          <HeaderUserMenu placement="top" hideSettings />
        ) : (
          <button type="button" className="layout-sidebar-account__signin" onClick={openLogin}>
            {t('header.signIn')}
          </button>
        )
      ) : null}
      {showTools ? (
        <div className="layout-sidebar-account__tools">
          {showLanguage ? <HeaderLanguageSwitcher placement="top" /> : null}
          {showTheme ? <HeaderThemeSwitcher /> : null}
        </div>
      ) : null}
    </div>
  );
}
