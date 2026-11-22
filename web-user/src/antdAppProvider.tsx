import React, { useMemo } from 'react';
import { App, ConfigProvider, theme as antdTheme } from 'antd';
import { useTranslation } from 'react-i18next';
import { getAntdLocale } from './i18n/antdLocales';
import { normalizeLocale } from './i18n/resolveLocale';
import { buildAntdTheme } from './antdTheme';
import { useTheme } from './contexts/ThemeContext';
import { NotifyBinder } from './ui/NotifyBinder';

export function AntdAppProvider({ children }: { children: React.ReactNode }) {
  const { resolved, primaryColor } = useTheme();
  const { i18n } = useTranslation();
  const algorithm = resolved === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm;
  const locale = getAntdLocale(normalizeLocale(i18n.language));
  const themeConfig = useMemo(() => {
    /*
     * primaryColor 来自伙伴后台（没配则为空串）。传进去让 antd 的
     * colorPrimary / Table 选中底色 / Pagination 激活色一起跟着变 ——
     * 只改 CSS 变量是不够的：antd 的组件样式由 JS 生成，不读 CSS 变量。
     */
    const { token, components } = buildAntdTheme(resolved, primaryColor || null);
    return { algorithm, token, components };
  }, [resolved, algorithm, primaryColor]);

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
