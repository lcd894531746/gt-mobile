import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { AuthUser } from '../types/auth';
import { getStoredAuth, saveAuth, clearAuth } from '../services/storage';
import { loginByApi } from '../services/api';
import { setApiToken } from '../services/api';

type LoginInput = {
  username: string;
  password: string;
};

type AuthContextValue = {
  isReady: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  signIn: (input: LoginInput) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    (async () => {
      const auth = await getStoredAuth();
      if (auth?.token) {
        setUser(auth);
        setApiToken(auth.token);
      } else {
        await clearAuth();
        setUser(null);
        setApiToken(undefined);
      }
      setIsReady(true);
    })();
  }, []);

  const signIn = useCallback(async ({ username, password }: LoginInput) => {
    const result = await loginByApi(username, password);

    if (result.success && result.token) {
      const auth: AuthUser = {
        username,
        token: result.token,
        raw: result.user,
      };
      try {
        await saveAuth(auth);
      } catch {
        // Keep login usable even if local storage fails in web preview.
      }
      setApiToken(auth.token);
      setUser(auth);
      return;
    }

    throw new Error(result.message || '登录失败：未获取到有效 token');
  }, []);

  const signOut = useCallback(async () => {
    await clearAuth();
    setApiToken(undefined);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isReady,
      isAuthenticated: Boolean(user?.token),
      user,
      signIn,
      signOut,
    }),
    [isReady, user, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
