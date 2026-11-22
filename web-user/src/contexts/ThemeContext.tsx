import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { applyBrandCSSVariables } from "../theme/applyBrandCss";
import type { ThemeModeResolved } from "../theme/brandTokens";
import {
  getBrandPrimaryColorOverride,
  subscribeBrandPrimaryColorOverride,
} from "../theme/brandOverride";

type ThemeMode = "light" | "dark" | "system";

interface ThemeContextType {
  mode: ThemeMode;
  resolved: "light" | "dark";
  /** 当前生效的品牌主色（伙伴配了就是伙伴的，否则是平台默认） */
  primaryColor: string;
  setMode: (m: ThemeMode) => void;
}

export const ThemeContext = createContext<ThemeContextType>({
  mode: "system",
  resolved: "dark",
  primaryColor: "",
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem("theme") as ThemeMode) || "system";
  });

  const getSystemTheme = () =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

  const [resolved, setResolved] = useState<"light" | "dark">(() => {
    const m = (localStorage.getItem("theme") as ThemeMode) || "system";
    return m === "system" ? getSystemTheme() : m as "light" | "dark";
  });

  /*
   * 伙伴主色（模块级 store，见 theme/brandOverride 的注释）。
   *
   * 订阅它而不是从 props / context 拿，是因为提供方 StatusProvider 在
   * 本组件的子树里 —— 反向传值只能靠这种外部 store。
   * 值变化 → 本组件重渲染 → 下面的 effect 重跑 → CSS 变量被重写。
   */
  const primaryOverride = useSyncExternalStore(
    subscribeBrandPrimaryColorOverride,
    getBrandPrimaryColorOverride,
    getBrandPrimaryColorOverride,
  );

  useEffect(() => {
    const apply = (m: ThemeMode) => {
      const r = (m === "system" ? getSystemTheme() : m) as ThemeModeResolved;
      setResolved(r);
      document.documentElement.setAttribute("theme-mode", r);
      document.body.setAttribute("theme-mode", r);
      applyBrandCSSVariables(r, primaryOverride);
    };
    apply(mode);

    if (mode === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => apply("system");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [mode, primaryOverride]);

  const setMode = (m: ThemeMode) => {
    localStorage.setItem("theme", m);
    setModeState(m);
  };

  return (
    <ThemeContext.Provider value={{ mode, resolved, primaryColor: primaryOverride ?? "", setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

