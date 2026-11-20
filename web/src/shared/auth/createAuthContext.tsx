import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Spin } from 'antd';
import { clearToken, getToken, setToken } from '../api/http';

interface AuthContextValue<TProfile> {
  profile: TProfile | null;
  loading: boolean;
  authed: boolean;
  signIn: (token: string, profile: TProfile) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
  setProfile: (profile: TProfile) => void;
}

/**
 * 通用登录态容器。两个端各自实例化（经销商 / 客户），互不共享 token。
 * fetchProfile 由各端注入，因此 shared 不需要知道具体 API。
 */
export function createAuthContext<TProfile>() {
  const Ctx = createContext<AuthContextValue<TProfile> | null>(null);

  function AuthProvider({
    children,
    fetchProfile,
    onSignOut,
  }: {
    children: React.ReactNode;
    fetchProfile: () => Promise<TProfile>;
    onSignOut?: () => void;
  }) {
    const [profile, setProfileState] = useState<TProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
      if (!getToken()) {
        setProfileState(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const p = await fetchProfile();
        setProfileState(p);
      } catch {
        clearToken();
        setProfileState(null);
      } finally {
        setLoading(false);
      }
    }, [fetchProfile]);

    useEffect(() => {
      void load();
    }, [load]);

    const signIn = useCallback((token: string, p: TProfile) => {
      setToken(token);
      setProfileState(p);
    }, []);

    const signOut = useCallback(() => {
      clearToken();
      setProfileState(null);
      onSignOut?.();
    }, [onSignOut]);

    const value = useMemo<AuthContextValue<TProfile>>(
      () => ({
        profile,
        loading,
        authed: Boolean(profile),
        signIn,
        signOut,
        refresh: load,
        setProfile: setProfileState,
      }),
      [profile, loading, signIn, signOut, load],
    );

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
  }

  function useAuth(): AuthContextValue<TProfile> {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('useAuth must be used within its AuthProvider');
    return ctx;
  }

  return { AuthProvider, useAuth };
}

/** 全屏 loading */
export function FullPageLoading({ text = '加载中…' }: { text?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        minHeight: '60vh',
        color: 'var(--text-secondary)',
        fontSize: 13,
      }}
    >
      <Spin size="large" />
      <span>{text}</span>
    </div>
  );
}
