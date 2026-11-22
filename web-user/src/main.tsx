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

// 立即执行：避免主题闪烁
const storedTheme = localStorage.getItem("theme") || "system";
const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const resolved = (storedTheme === "system" ? (systemDark ? "dark" : "light") : storedTheme) as ThemeModeResolved;
document.documentElement.setAttribute("theme-mode", resolved);
document.body.setAttribute("theme-mode", resolved);
applyBrandCSSVariables(resolved);

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
