import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { UserProvider } from './contexts/UserContext';
import { StatusProvider } from './contexts/StatusContext';
import { AuthModalProvider } from './contexts/AuthModalContext';
import { HomeStyleProvider } from './contexts/HomeStyleContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AntdAppProvider } from './antdAppProvider';
import './index.css';
import './theme-dark.css';
import './responsive.css';
import './i18n';
import { applyBrandCSSVariables } from './theme/applyBrandCss';
import type { ThemeModeResolved } from './theme/brandTokens';
import { getBrandPrimaryColorOverride } from './theme/brandOverride';

/*
 * 立即执行：避免主题闪烁。
 *
 * 这里要把「上一轮拿到的商户主色」一起传进去，否则首帧会用平台默认紫，
 * 等 site-brand 接口回来再改成商户色 —— 视觉上就是「先紫一下再变」。
 * 缓存值来自 localStorage（见 theme/brandOverride 的 CACHE_KEY），
 * 同步可读，所以首帧就能画对。
 */
const storedTheme = localStorage.getItem("theme") || "system";
const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const resolved = (storedTheme === "system" ? (systemDark ? "dark" : "light") : storedTheme) as ThemeModeResolved;
document.documentElement.setAttribute("theme-mode", resolved);
document.body.setAttribute("theme-mode", resolved);
applyBrandCSSVariables(resolved, getBrandPrimaryColorOverride());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <AntdAppProvider>
      <BrowserRouter>
        <StatusProvider>
          <HomeStyleProvider>
            <UserProvider>
              <AuthModalProvider>
                <App />
              </AuthModalProvider>
            </UserProvider>
          </HomeStyleProvider>
        </StatusProvider>
      </BrowserRouter>
    </AntdAppProvider>
  </ThemeProvider>
);
