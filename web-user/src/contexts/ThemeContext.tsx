import React, { createContext, useContext, useEffect, useState } from "react";
import { applyBrandCSSVariables } from "../theme/applyBrandCss";
import type { ThemeModeResolved } from "../theme/brandTokens";

type ThemeMode = "light" | "dark" | "system";

interface ThemeContextType {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (m: ThemeMode) => void;
}

export const ThemeContext = createContext<ThemeContextType>({
  mode: "system",
  resolved: "dark",
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

  useEffect(() => {
    const apply = (m: ThemeMode) => {
      const r = (m === "system" ? getSystemTheme() : m) as ThemeModeResolved;
      setResolved(r);
      document.documentElement.setAttribute("theme-mode", r);
      document.body.setAttribute("theme-mode", r);
      applyBrandCSSVariables(r);
    };
    apply(mode);

    if (mode === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => apply("system");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [mode]);

  const setMode = (m: ThemeMode) => {
    localStorage.setItem("theme", m);
    setModeState(m);
  };

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
