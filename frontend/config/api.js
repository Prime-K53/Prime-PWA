const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;

const SUPABASE_URL = env?.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = env?.VITE_SUPABASE_ANON_KEY || '';

const SUPABASE_CONFIGURED = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  SUPABASE_URL !== 'https://placeholder.supabase.co'
);

const getUrl = (path = '') => {
  const rawPath = String(path || '').trim();
  if (/^(https?:\/\/|file:|blob:|data:)/i.test(rawPath)) return rawPath;
  if (!SUPABASE_URL) return path;
  return `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/${rawPath.replace(/^\//, '')}`;
};

const API_BASE_URL = '';
const BASE_URL = '';
// Whether a dedicated API server is available (separate from Supabase)
const HAS_REMOTE_BACKEND = SUPABASE_CONFIGURED && Boolean(API_BASE_URL);
const BACKEND_ORIGIN = '';

export { API_BASE_URL, BASE_URL, BACKEND_ORIGIN, HAS_REMOTE_BACKEND, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_CONFIGURED, getUrl };
