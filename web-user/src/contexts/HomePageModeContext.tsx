import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getHomePageContent } from '../api';
import {
  HOME_PAGE_MODE_DEFAULT,
  parseHomePageMode,
  type HomePageMode,
} from '../config/homePageMode';

interface HomePageModeContextValue {
  mode: HomePageMode;
  loading: boolean;
  refresh: () => Promise<HomePageMode>;
}

const HomePageModeContext = createContext<HomePageModeContextValue | null>(null);

export function HomePageModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<HomePageMode>(HOME_PAGE_MODE_DEFAULT);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<HomePageMode> => {
    setLoading(true);
    try {
      const res = await getHomePageContent();
      const next = res.data?.success === true
        ? parseHomePageMode(res.data?.data)
        : HOME_PAGE_MODE_DEFAULT;
      setMode(next);
      return next;
    } catch {
      setMode(HOME_PAGE_MODE_DEFAULT);
      return HOME_PAGE_MODE_DEFAULT;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ mode, loading, refresh }),
    [mode, loading, refresh],
  );

  return (
    <HomePageModeContext.Provider value={value}>
      {children}
    </HomePageModeContext.Provider>
  );
}

export function useHomePageMode(): HomePageModeContextValue {
  const ctx = useContext(HomePageModeContext);
  if (!ctx) {
    throw new Error('useHomePageMode must be used within HomePageModeProvider');
  }
  return ctx;
}
