import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { buildAntdTheme } from './antdTheme';
import { applyBrandCssVariables, type ThemeModeResolved } from './brandTokens';
import { bindMessage } from '../lib/notify';

type ThemeMode = ThemeModeResolved | 'system';

interface ThemeContextValue {
  /** 用户选择：light / dark / system */
  mode: ThemeMode;
  /** 实际生效：light / dark */
  resolved: ThemeModeResolved;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'lynx-dealer-theme';

function readStoredMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* ignore */
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * 主题容器：同步 body[theme-mode] 属性 + 品牌 CSS 变量 + antd ConfigProvider。
 * 所有页面禁止硬编码颜色，统一走 index.css 里的 CSS 变量。
 *
 * 关于 `primaryHex`：
 *  - dealer-admin 不传 → 用平台默认紫，所有经销商的后台完全一致；
 *  - dealer-user 传域名解析出的租户品牌色 → 该域名的访客看到的是经销商自己的配色。
 * 品牌色只是「皮肤」，与身份无关：看不到用户数据的能力由 token 决定，不由颜色决定。
 */
export function ThemeProvider({
  children,
  locale = 'zh',
  primaryHex,
}: {
  children: React.ReactNode;
  locale?: 'zh' | 'en';
  /** 租户品牌主色（可选）。不传则用平台默认主色。 */
  primaryHex?: string;
}) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolved: ThemeModeResolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    document.body.setAttribute('theme-mode', resolved);
    document.documentElement.setAttribute('theme-mode', resolved);
    applyBrandCssVariables(resolved, primaryHex);
  }, [resolved, primaryHex]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setMode(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle],
  );

  const themeConfig = useMemo(() => buildAntdTheme(resolved, primaryHex), [resolved, primaryHex]);

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider theme={themeConfig} locale={locale === 'zh' ? zhCN : enUS} componentSize="middle">
        <AntdApp>
          <MessageBridge />
          {children}
        </AntdApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

/**
 * 把 AntdApp 上下文里的 message 实例接到 notify 上。
 * 必须放在 AntdApp 内部才能拿到上下文；不渲染任何可见内容。
 */
function MessageBridge() {
  const { message } = AntdApp.useApp();
  useEffect(() => {
    bindMessage(message);
    return () => bindMessage(null);
  }, [message]);
  return null;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
