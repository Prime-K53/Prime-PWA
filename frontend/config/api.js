const normalizeBase = (value) => String(value || '').trim().replace(/\/+$/, '');
const normalizePath = (value) => String(value || '').trim().replace(/^\/+/, '');
const ensureApiPath = (value) => {
  const normalized = normalizeBase(value);
  if (!normalized) return '';
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
};
const stripApiSuffix = (value) => normalizeBase(value).replace(/\/api$/i, '');

const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;

const isDevMode = env?.DEV === true || env?.MODE === 'development';
let BACKEND_ORIGIN = isDevMode ? 'http://localhost:3000' : 'http://127.0.0.1:3000';

if (typeof window !== 'undefined') {
  const urlParams = new URLSearchParams(window.location.search);
  const backendParam = urlParams.get('backend');
  if (backendParam) {
    BACKEND_ORIGIN = backendParam;
  }
}
const API_BASE_URL = ensureApiPath(BACKEND_ORIGIN);
const BASE_URL = API_BASE_URL;

const getUrl = (path = '') => {
  const rawPath = String(path || '').trim();
  if (/^https?:\/\//i.test(rawPath)) return rawPath;

  let base = normalizeBase(API_BASE_URL);

  let cleanedPath = normalizePath(rawPath);
  if (!base && !cleanedPath) return '';
  if (!base) return cleanedPath ? `/${cleanedPath}` : '';
  if (base.endsWith('/api') && cleanedPath.startsWith('api/')) {
    cleanedPath = cleanedPath.slice(4);
  }
  if (!cleanedPath) return base;
  return `${base}/${cleanedPath}`;
};

const isRunningInDesktop = () => {
  if (typeof window === 'undefined') return false;
  return !!(window.__TAURI_INTERNALS__ || window.electronAPI?.writeTempPdf);
};

if (typeof window !== 'undefined') {
  window.getApiUrl = async (path) => getUrl(path);
  window.API_BASE_URL = API_BASE_URL;
  window.BASE_URL = BASE_URL;
  window.BACKEND_ORIGIN = BACKEND_ORIGIN;
  window.isElectron = isRunningInDesktop();
}

export { API_BASE_URL, BASE_URL, BACKEND_ORIGIN, getUrl, isRunningInDesktop as isElectron };

