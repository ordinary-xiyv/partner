import React, { useMemo } from 'react';
import { App, ConfigProvider, theme as antdTheme } from 'antd';
import { useTranslation } from 'react-i18next';
import { getAntdLocale } from './i18n/antdLocales';
import { normalizeLocale } from './i18n/resolveLocale';
import { buildAntdTheme } from './antdTheme';
import { useTheme } from './contexts/ThemeContext';
import { NotifyBinder } from './ui/NotifyBinder';

export function AntdAppProvider({ children }: { children: React.ReactNode }) {
  const { resolved } = useTheme();
  const { i18n } = useTranslation();
  const algorithm = resolved === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm;
  const locale = getAntdLocale(normalizeLocale(i18n.language));
  const themeConfig = useMemo(() => {
    const { token, components } = buildAntdTheme(resolved);
    return { algorithm, token, components };
  }, [resolved, algorithm]);

  return (
    <ConfigProvider
      locale={locale}
      componentSize="middle"
      theme={themeConfig}
    >
      <App message={{ top: 56, maxCount: 3 }}>
        <NotifyBinder />
        {children}
      </App>
    </ConfigProvider>
  );
}
