const CACHE_VERSION = 'primeerp-offline-v2';
const STATIC_CACHE = `${CACHE_VERSION}:static`;
const RUNTIME_CACHE = `${CACHE_VERSION}:runtime`;
const API_CACHE = `${CACHE_VERSION}:api`;
const OFFLINE_DB_NAME = 'PrimeERP_OfflineFirst';
const OFFLINE_DB_VERSION = 1;
const SYNC_QUEUE_STORE = 'syncQueue';
const OFFLINE_FALLBACK_URL = '/offline.html';
const BACKGROUND_SYNC_TAG = 'prime-erp-sync';

const APP_SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/pwa-icon-192x192.png',
  '/pwa-icon-192x192-maskable.png',
  '/pwa-icon-512x512.png',
  '/pwa-icon-512x512-maskable.png',
  '/screenshot-dashboard.png',
  '/screenshot-mobile.png',
  OFFLINE_FALLBACK_URL
];

const isCacheableAsset = (pathname) => /\.(?:js|css|png|jpg|jpeg|svg|ico|woff|woff2|ttf)$/i.test(pathname);

const openOfflineDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
      const store = db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: 'id' });
      store.createIndex('by-status', 'status');
      store.createIndex('by-next-retry', 'nextRetryAt');
      store.createIndex('by-entity-id', 'entityId');
    }
  };

  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const readSyncQueue = async () => {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(SYNC_QUEUE_STORE, 'readonly');
    const store = tx.objectStore(SYNC_QUEUE_STORE);
    return await new Promise((resolve, reject) => {
      const getAllRequest = store.getAll();
      getAllRequest.onsuccess = () => resolve(Array.isArray(getAllRequest.result) ? getAllRequest.result : []);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    });
  } catch {
    return [];
  }
};

const waitForTransaction = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

const writeSyncQueueItem = async (item) => {
  const db = await openOfflineDb();
  const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
  tx.objectStore(SYNC_QUEUE_STORE).put(item);
  return waitForTransaction(tx);
};

const deleteSyncQueueItem = async (id) => {
  const db = await openOfflineDb();
  const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
  tx.objectStore(SYNC_QUEUE_STORE).delete(id);
  return waitForTransaction(tx);
};

const notifyClients = async (payload) => {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of clients) {
    client.postMessage(payload);
  }
};

const collectManifestAssets = (manifest) => {
  const assets = new Set();
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'string') {
      if (value.startsWith('/')) {
        assets.add(value);
      } else if (!/^https?:\/\//i.test(value)) {
        assets.add(`/${value.replace(/^\/+/, '')}`);
      }
      return;
    }
    if (typeof value === 'object') {
      Object.values(value).forEach(visit);
    }
  };

  visit(manifest);
  return Array.from(assets);
};

const precacheBuildAssets = async () => {
  try {
    const manifestResponse = await fetch('/asset-manifest.json', { cache: 'no-store' });
    if (!manifestResponse.ok) return;
    const manifest = await manifestResponse.json();
    const assets = collectManifestAssets(manifest);
    if (assets.length === 0) return;
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(assets);
  } catch {
    // Build manifest is optional in development.
  }
};

const cacheFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
};

const staleWhileRevalidate = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || networkPromise;
};

const networkFirst = async (request, cacheName, fallbackResponse) => {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    return fallbackResponse;
  }
};

const handleNavigation = async (request) => {
  const fallback = await caches.match('/index.html') || await caches.match(OFFLINE_FALLBACK_URL);
  return networkFirst(request, RUNTIME_CACHE, fallback || Response.error());
};

const handleApiGet = async (request) => {
  const offlineJson = new Response(JSON.stringify({
    error: 'offline',
    message: 'Remote API unavailable. Using cached data.'
  }), {
    status: 503,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });

  return networkFirst(request, API_CACHE, offlineJson);
};

const buildRetryTime = (retries) => new Date(Date.now() + Math.min(60000, 1000 * Math.pow(2, retries))).toISOString();

const replaySyncQueue = async () => {
  const queue = await readSyncQueue();
  let synced = 0;
  let failed = 0;
  let blocked = 0;

  for (const item of queue) {
    if (!item?.request?.url || !item?.request?.method) continue;

    if (item.nextRetryAt && new Date(item.nextRetryAt).getTime() > Date.now()) {
      continue;
    }

    if (item.operation === 'delete' && String(item.entityId || '').startsWith('local-')) {
      await deleteSyncQueueItem(item.id);
      continue;
    }

    if (item.operation === 'update' && String(item.entityId || '').startsWith('local-')) {
      continue;
    }

    try {
      const response = await fetch(item.request.url, {
        method: item.request.method,
        headers: item.request.headers || {},
        body: item.request.body ? JSON.stringify(item.request.body) : undefined
      });

      if (response.status === 401 || response.status === 403) {
        blocked += 1;
        await writeSyncQueueItem({
          ...item,
          status: 'blocked',
          retries: Number(item.retries || 0) + 1,
          lastError: 'Authentication required during background sync.',
          nextRetryAt: null,
          updatedAt: new Date().toISOString()
        });
        break;
      }

      if (!response.ok) {
        failed += 1;
        await writeSyncQueueItem({
          ...item,
          status: 'failed',
          retries: Number(item.retries || 0) + 1,
          lastError: `Background sync failed with HTTP ${response.status}.`,
          nextRetryAt: buildRetryTime(Number(item.retries || 0) + 1),
          updatedAt: new Date().toISOString()
        });
        continue;
      }

      await deleteSyncQueueItem(item.id);
      synced += 1;
    } catch {
      failed += 1;
      await writeSyncQueueItem({
        ...item,
        status: 'failed',
        retries: Number(item.retries || 0) + 1,
        lastError: 'Network unavailable during background sync.',
        nextRetryAt: buildRetryTime(Number(item.retries || 0) + 1),
        updatedAt: new Date().toISOString()
      });
      break;
    }
  }

  await notifyClients({
    type: BACKGROUND_SYNC_TAG,
    synced,
    failed,
    blocked
  });
};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(APP_SHELL_FILES);
    await precacheBuildAssets();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('primeerp-offline-') && !key.startsWith(CACHE_VERSION))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
    await precacheBuildAssets();
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data?.type;
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (type === 'SYNC_PENDING_CHANGES') {
    event.waitUntil(replaySyncQueue());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === BACKGROUND_SYNC_TAG) {
    event.waitUntil(replaySyncQueue());
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Bypass service worker for Vite HMR WebSocket connections to prevent
  // staleWhileRevalidate from intercepting the WebSocket upgrade request
  // and causing HMR connection failures.
  if (url.pathname.endsWith('/__open-in-editor') || url.pathname.includes('/@vite/') || url.pathname.includes('/@react-refresh') || url.pathname === '/@vite/client') {
    return;
  }

  // Bypass for WebSocket upgrade requests
  if (event.request.headers?.get('Upgrade')?.toLowerCase() === 'websocket') {
    return;
  }

  if (url.origin !== self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiGet(request));
    return;
  }

  if (isCacheableAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
});
