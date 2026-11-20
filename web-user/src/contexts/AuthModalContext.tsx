import React, { createContext, useContext, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface AuthModalContextType {
  openLogin: () => void;
  openRegister: () => void;
}

const AuthModalContext = createContext<AuthModalContextType>({
  openLogin: () => {},
  openRegister: () => {},
});

function authFromPath(pathname: string): string | undefined {
  if (pathname === '/login' || pathname === '/register') return undefined;
  return pathname;
}

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  const openLogin = useCallback(() => {
    const from = authFromPath(location.pathname);
    navigate('/login', { state: from ? { from } : undefined });
  }, [navigate, location.pathname]);

  const openRegister = useCallback(() => {
    const from = authFromPath(location.pathname);
    navigate('/login?tab=register', { state: from ? { from } : undefined });
  }, [navigate, location.pathname]);

  return (
    <AuthModalContext.Provider value={{ openLogin, openRegister }}>
      {children}
    </AuthModalContext.Provider>
  );
}

export const useAuthModal = () => useContext(AuthModalContext);
