import type { AuthState } from '../types/offline';

const SESSION_STORAGE_KEY = 'nexus_user';
const AUTH_INVALID_EVENT = 'primeerp:auth-invalid';
const DEFAULT_SESSION_MINUTES = 120;

const nowIso = () => new Date().toISOString();

const randomTokenPart = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
};

const encodeBase64Url = (value: string) => {
  try {
    if (typeof btoa === 'function') {
      return btoa(unescape(encodeURIComponent(value)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
    }
  } catch {
    // Fall through to opaque token.
  }
  return randomTokenPart();
};

const buildToken = (user: Record<string, any>, expiresAt: string | null, kind: 'access' | 'refresh') => {
  const payload = {
    sub: String(user?.id || user?.username || 'anonymous'),
    role: String(user?.role || 'User'),
    mode: user?.authMode || (user?.bypassAuth ? 'password_bypass' : 'local'),
    type: kind,
    exp: expiresAt,
    iat: nowIso(),
    nonce: randomTokenPart()
  };
  return `${kind}.${encodeBase64Url(JSON.stringify(payload))}.${randomTokenPart()}`;
};

const deriveExpiry = (user: Record<string, any>) => {
  const rawExpiry = String(user?.tokenExpiry || user?.expiresAt || '').trim();
  if (rawExpiry) {
    return rawExpiry;
  }
  return new Date(Date.now() + (DEFAULT_SESSION_MINUTES * 60 * 1000)).toISOString();
};

export const getStoredUserSession = <T extends Record<string, any> = Record<string, any>>(): T | null => {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }

  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
};

export const isSessionExpired = (user?: Record<string, any> | null): boolean => {
  const expiry = String(user?.tokenExpiry || user?.expiresAt || '').trim();
  if (!expiry) {
    return false;
  }

  const expiresAt = new Date(expiry).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
};

export const persistUserSession = <T extends Record<string, any>>(user: T | null): T | null => {
  if (typeof sessionStorage === 'undefined') {
    return user;
  }

  if (!user) {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }

  const hydrated = { ...user } as Record<string, any>;
  hydrated.tokenExpiry = deriveExpiry(hydrated);
  hydrated.expiresAt = hydrated.tokenExpiry;
  hydrated.accessToken = String(hydrated.accessToken || buildToken(hydrated, hydrated.tokenExpiry, 'access'));
  hydrated.refreshToken = String(hydrated.refreshToken || buildToken(hydrated, hydrated.tokenExpiry, 'refresh'));
  hydrated.tokenIssuedAt = String(hydrated.tokenIssuedAt || nowIso());

  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(hydrated));
  return hydrated as T;
};

export const clearStoredUserSession = () => {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
};

export const ensureSessionAuthState = (): AuthState => {
  const stored = getStoredUserSession();
  const hydrated = persistUserSession(stored);

  if (!hydrated) {
    return {
      userId: null,
      role: null,
      isSuperAdmin: false,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      authMode: 'anonymous',
      isAuthenticated: false
    };
  }

  const authMode = hydrated.bypassAuth === true || hydrated.authMode === 'password_bypass'
    ? 'password_bypass'
    : hydrated.authMode === 'local'
    ? 'local'
    : (hydrated.accessToken ? 'token' : 'local');

  return {
    userId: hydrated.id ? String(hydrated.id) : null,
    role: hydrated.role ? String(hydrated.role) : null,
    isSuperAdmin: hydrated.isSuperAdmin === true,
    accessToken: hydrated.accessToken ? String(hydrated.accessToken) : null,
    refreshToken: hydrated.refreshToken ? String(hydrated.refreshToken) : null,
    expiresAt: hydrated.tokenExpiry ? String(hydrated.tokenExpiry) : null,
    authMode,
    isAuthenticated: !isSessionExpired(hydrated)
  };
};

export const refreshLocalAccessToken = () => {
  const stored = getStoredUserSession();
  if (!stored || isSessionExpired(stored)) {
    return null;
  }

  const refreshed = persistUserSession({
    ...stored,
    accessToken: buildToken(stored, deriveExpiry(stored), 'access'),
    tokenIssuedAt: nowIso()
  });

  return refreshed?.accessToken ? String(refreshed.accessToken) : null;
};

export const dispatchAuthInvalid = (reason = 'Your session is not authorized. Please sign in again.') => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(AUTH_INVALID_EVENT, {
    detail: { reason, at: nowIso() }
  }));
};

export const getAuthInvalidEventName = () => AUTH_INVALID_EVENT;

