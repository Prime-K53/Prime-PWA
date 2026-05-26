const normalizeBase = (value) => String(value || '').trim().replace(/\/+$/, '');
const normalizePath = (value) => String(value || '').trim().replace(/^\/+/, '');
const ensureApiPath = (value) => {
  const normalized = normalizeBase(value);
  if (!normalized) return '';
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
};
const stripApiSuffix = (value) => normalizeBase(value).replace(/\/api$/i, '');

const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
const isFileProtocol = typeof window !== 'undefined' && window.location?.protocol === 'file:';

const isDevMode = env?.DEV === true || env?.MODE === 'development';

// In development, use relative URLs through the Vite proxy (avoids CORS/mixed content issues).
// In production, the backend serves the frontend on the same origin, so relative URLs work too.
let BACKEND_ORIGIN = '';
let API_BASE_URL = '/api';

if (typeof window !== 'undefined') {
  const urlParams = new URLSearchParams(window.location.search);
  const backendParam = urlParams.get('backend');
  if (backendParam) {
    BACKEND_ORIGIN = backendParam;
    API_BASE_URL = ensureApiPath(BACKEND_ORIGIN);
  } else if (isFileProtocol) {
    BACKEND_ORIGIN = '';
    API_BASE_URL = '';
  }
}
const BASE_URL = API_BASE_URL;
const HAS_REMOTE_BACKEND = Boolean(API_BASE_URL);

const getUrl = (path = '') => {
  const rawPath = String(path || '').trim();
  if (/^(https?:\/\/|file:|blob:|data:)/i.test(rawPath)) return rawPath;

  let base = normalizeBase(API_BASE_URL);

  let cleanedPath = normalizePath(rawPath);
  if (!base && !cleanedPath) return '';
  if (!base) return cleanedPath ? (isFileProtocol ? cleanedPath : `/${cleanedPath}`) : '';
  if (base.endsWith('/api') && cleanedPath.startsWith('api/')) {
    cleanedPath = cleanedPath.slice(4);
  }
  if (!cleanedPath) return base;
  return `${base}/${cleanedPath}`;
};

if (typeof window !== 'undefined') {
  window.getApiUrl = async (path) => getUrl(path);
  window.API_BASE_URL = API_BASE_URL;
  window.BASE_URL = BASE_URL;
  window.BACKEND_ORIGIN = BACKEND_ORIGIN;
  window.HAS_REMOTE_BACKEND = HAS_REMOTE_BACKEND;
}

export { API_BASE_URL, BASE_URL, BACKEND_ORIGIN, HAS_REMOTE_BACKEND, getUrl };
