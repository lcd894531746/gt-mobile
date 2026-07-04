import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { Alert } from 'react-native';
import type { AuthUser } from '../types/auth';
import { getStoredAuth, saveAuth, clearAuth } from '../services/storage';
import { loginByApi } from '../services/api';
import { registerUnauthorizedHandler, setApiToken } from '../services/api';

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
  const userRef = useRef<AuthUser | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const resetAuthState = useCallback(async (reason: 'manual' | 'expired' | 'restore-failed') => {
    const hadToken = Boolean(userRef.current?.token);

    userRef.current = null;
    setApiToken(undefined);
    setUser(null);

    try {
      await clearAuth();
    } catch (error) {
      console.error('Failed to clear auth state', error);
    }

    if (reason === 'expired' && hadToken) {
      Alert.alert('登录已过期', '账号长时间未操作，登录状态已失效，请重新登录。');
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const auth = await getStoredAuth();
        if (auth?.token) {
          userRef.current = auth;
          setUser(auth);
          setApiToken(auth.token);
        } else {
          await resetAuthState('manual');
        }
      } catch (error) {
        console.error('Failed to restore auth state', error);
        await resetAuthState('restore-failed');
      } finally {
        setIsReady(true);
      }
    })();
  }, [resetAuthState]);

  useEffect(() => {
    registerUnauthorizedHandler(async () => {
      await resetAuthState('expired');
    });

    return () => {
      registerUnauthorizedHandler(undefined);
    };
  }, [resetAuthState]);

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
      userRef.current = auth;
      setApiToken(auth.token);
      setUser(auth);
      return;
    }

    throw new Error(result.message || '登录失败：未获取到有效 token');
  }, []);

  const signOut = useCallback(async () => {
    await resetAuthState('manual');
  }, [resetAuthState]);

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
