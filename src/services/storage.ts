import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthUser } from '../types/auth';

const KEYS = {
  token: 'token',
  user: 'user',
  savedUsername: 'savedUsername',
};

export async function getStoredToken(): Promise<string> {
  return (await AsyncStorage.getItem(KEYS.token)) ?? '';
}

export async function saveAuth(auth: AuthUser): Promise<void> {
  const tasks: Promise<void>[] = [];

  tasks.push(AsyncStorage.setItem(KEYS.user, JSON.stringify(auth)));
  tasks.push(AsyncStorage.setItem(KEYS.savedUsername, auth.username));
  if (auth.token) {
    tasks.push(AsyncStorage.setItem(KEYS.token, auth.token));
  }

  await Promise.all(tasks);
}

export async function clearAuth(): Promise<void> {
  await AsyncStorage.multiRemove([KEYS.user, KEYS.token]);
}

export async function getSavedUsername(): Promise<string> {
  return (await AsyncStorage.getItem(KEYS.savedUsername)) ?? '';
}

export async function getStoredAuth(): Promise<AuthUser | null> {
  const [userRaw, token] = await AsyncStorage.multiGet([KEYS.user, KEYS.token]).then(
    (values) => [values[0]?.[1], values[1]?.[1]]
  );

  if (!userRaw) {
    return null;
  }

  try {
    const parsed = JSON.parse(userRaw) as AuthUser;
    return {
      ...parsed,
      token: token ?? parsed.token,
    };
  } catch {
    return null;
  }
}

