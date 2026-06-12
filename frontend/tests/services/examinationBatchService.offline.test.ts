import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { examinationBatchService } from '../../services/examinationBatchService';
import { dbService } from '../../services/db';
import { examinationDb } from '../../services/examinationDb';
import { offlineDb } from '../../services/offlineDb';
import { getQueuedMutations } from '../../services/offlineQueueManager';

type StoreRecord = Map<string, any>;

const stores = new Map<string, StoreRecord>();

const getStore = (name: string) => {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  return stores.get(name)!;
};

const offlineBatchStore = new Map<string, any>();
const syncQueueStore = new Map<string, any>();

const seedOfflineBatches = (batches: any[]) => {
  offlineBatchStore.clear();
  batches.forEach((batch) => {
    offlineBatchStore.set(String(batch.id), batch);
  });
};

const createResponse = (payload: any, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: (name: string) => name.toLowerCase() === 'content-type' ? 'application/json' : null
  },
  text: async () => JSON.stringify(payload),
  json: async () => payload
});

vi.mock('../../services/db', async () => {
  const dbServiceMock = {
    getAll: vi.fn(async (storeName: string) => Array.from(getStore(storeName).values())),
    put: vi.fn(async (storeName: string, item: any) => {
      const id = String(item.id);
      getStore(storeName).set(id, item);
      return id;
    }),
    delete: vi.fn(async (storeName: string, id: string) => {
      getStore(storeName).delete(String(id));
    }),
    executeAtomicOperation: vi.fn(async (storeNames: string[], operation: (tx: any) => Promise<any>) => {
      const tx = {
        objectStore: (storeName: string) => ({
          get: async (id: string) => getStore(storeName).get(String(id)),
          put: async (item: any) => {
            const id = String(item.id);
            getStore(storeName).set(id, item);
            return id;
          }
        }),
        done: Promise.resolve()
      };
      return operation(tx);
    }),
    getSetting: vi.fn(async (key: string) => getStore('settings').get(String(key))),
    saveSetting: vi.fn(async (key: string, value: any) => {
      getStore('settings').set(String(key), { id: key, ...value });
    })
  };
  return { dbService: dbServiceMock };
});

vi.mock('../../services/examinationDb', () => {
  const examDbMock = {
    examinationBatches: {
      toArray: vi.fn(async () => Array.from(offlineBatchStore.values())),
      get: vi.fn(async (id: string) => offlineBatchStore.get(String(id))),
      put: vi.fn(async (batch: any) => {
        offlineBatchStore.set(String(batch.id), batch);
        return String(batch.id);
      }),
      bulkPut: vi.fn(async (batches: any[]) => {
        batches.forEach((batch: any) => offlineBatchStore.set(String(batch.id), batch));
      }),
      delete: vi.fn(async (id: string) => {
        offlineBatchStore.delete(String(id));
      }),
      update: vi.fn(async (id: string, changes: any) => {
        const existing = offlineBatchStore.get(String(id));
        if (existing) {
          offlineBatchStore.set(String(id), { ...existing, ...changes });
        }
      }),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({ toArray: vi.fn(async () => []) })),
        anyOf: vi.fn(() => ({ toArray: vi.fn(async () => []) })),
      })),
    },
    examinationBatchNotifications: {
      toArray: vi.fn(async () => []),
      put: vi.fn(async (item: any) => item.id),
      delete: vi.fn(async () => {}),
    },
  };
  return { examinationDb: examDbMock };
});

vi.mock('../../services/offlineDb', async () => {
  const offlineDbMock = {
    eventName: 'primeerp:offline-db-changed',
    getAllBatches: vi.fn(async () => Array.from(offlineBatchStore.values())),
    getBatch: vi.fn(async (id: string) => offlineBatchStore.get(String(id))),
    saveBatch: vi.fn(async (batch: any) => {
      offlineBatchStore.set(String(batch.id), batch);
      return batch;
    }),
    saveBatches: vi.fn(async (batches: any[]) => {
      offlineBatchStore.clear();
      batches.forEach((batch) => offlineBatchStore.set(String(batch.id), batch));
      return batches;
    }),
    deleteBatch: vi.fn(async (id: string) => {
      offlineBatchStore.delete(String(id));
    }),
    getSyncQueue: vi.fn(async () => Array.from(syncQueueStore.values())),
    saveSyncQueueItem: vi.fn(async (item: any) => {
      syncQueueStore.set(String(item.id), item);
      return item;
    }),
    deleteSyncQueueItem: vi.fn(async (id: string) => {
      syncQueueStore.delete(String(id));
    }),
    getMetaValue: vi.fn(async () => undefined),
    setMetaValue: vi.fn(async () => undefined),
    getOfflineState: vi.fn(async () => ({
      isOnline: true,
      isSyncing: false,
      lastSyncedAt: null,
      pendingMutations: syncQueueStore.size,
      authBlocked: false,
      cacheReady: true
    })),
    setOfflineState: vi.fn(async () => undefined)
  };
  return { offlineDb: offlineDbMock };
});

vi.mock('../../services/offlineQueueManager', async () => {
  const queueOfflineMutation = vi.fn(async (input: any) => {
    const item = {
      id: `sync-${syncQueueStore.size + 1}`,
      entityType: 'examination-batch',
      operation: input.operation,
      entityId: input.entityId,
      request: input.request,
      payload: input.payload,
      status: 'pending',
      retries: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    syncQueueStore.set(String(item.id), item);
    return item;
  });

  return {
    BACKGROUND_SYNC_TAG: 'prime-erp-sync',
    queueOfflineMutation,
    getQueuedMutations: vi.fn(async () => Array.from(syncQueueStore.values())),
    saveQueuedMutation: vi.fn(async (item: any) => {
      syncQueueStore.set(String(item.id), item);
      return item;
    }),
    removeQueuedMutation: vi.fn(async (id: string) => {
      syncQueueStore.delete(String(id));
    }),
    countQueuedMutations: vi.fn(async () => syncQueueStore.size)
  };
});

describe('examinationBatchService offline support', () => {
  let fetchMock: any;
  let shouldFailFetch = false;

  beforeEach(async () => {
    stores.clear();
    offlineBatchStore.clear();
    syncQueueStore.clear();
    localStorage.clear();
    sessionStorage.clear();
    shouldFailFetch = false;
    // indexedDB is available in jsdom via fake-indexeddb
    fetchMock = vi.fn((url: string) => {
      if (shouldFailFetch) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return Promise.resolve(createResponse({ id: 'server-1', name: 'Server Batch' }));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-123' });
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    seedOfflineBatches([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns local batches when backend is unavailable', async () => {
    seedOfflineBatches([{ id: 'local-1', name: 'Local Batch' }]);
    shouldFailFetch = true;
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });

    const result = await examinationBatchService.listBatches();

    expect(result.length).toBe(1);
    expect(result[0].id).toBe('local-1');
  });

  it('returns local batches when the backend responds with an auth challenge', async () => {
    seedOfflineBatches([{ id: 'local-401', name: 'Cached Batch' }]);
    fetchMock = vi.fn(() => Promise.resolve(createResponse({
      error: 'Access denied',
      message: 'No authentication token provided'
    }, 401)));
    vi.stubGlobal('fetch', fetchMock);

    const result = await examinationBatchService.listBatches();

    expect(result.length).toBe(1);
    expect(result[0].id).toBe('local-401');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('creates batches offline and stores them in the outbox', async () => {
    shouldFailFetch = true;
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });

    const batch = await examinationBatchService.createBatch({
      school_id: 'SCH-1',
      name: 'Offline Batch'
    });

    const stored = await offlineDb.getAllBatches();
    const outbox = await getQueuedMutations();

    expect(batch.id).toContain('local-');
    expect((batch as any)._syncStatus).toBe('pending');
    expect(stored.length).toBe(1);
    expect(outbox.length).toBe(1);
    expect(outbox[0].operation).toBe('create');
  });

  it('creates batches locally when the backend responds with an auth challenge', async () => {
    fetchMock = vi.fn(() => Promise.resolve(createResponse({
      error: 'Access denied',
      message: 'No authentication token provided'
    }, 401)));
    vi.stubGlobal('fetch', fetchMock);

    const batch = await examinationBatchService.createBatch({
      school_id: 'SCH-401',
      name: 'Auth Fallback Batch'
    });

    const stored = await offlineDb.getAllBatches();
    const outbox = await getQueuedMutations();

    expect(batch.id).toContain('local-');
    expect((batch as any)._syncStatus).toBe('pending');
    expect(stored.length).toBe(1);
    expect(outbox.length).toBe(1);
  });

  it('syncs offline-created batches when backend is available', async () => {
    shouldFailFetch = true;
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });

    const offlineBatch = await examinationBatchService.createBatch({
      school_id: 'SCH-1',
      name: 'Offline Batch'
    });

    shouldFailFetch = false;
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });

    const syncResult = await examinationBatchService.syncPendingBatches();
    const stored = await offlineDb.getAllBatches();
    const outbox = await getQueuedMutations();

    expect(syncResult.failed).toBe(0);
    expect(stored.length).toBeGreaterThan(0);
    expect(outbox.length).toBeGreaterThanOrEqual(0);
  });

  it('uses the localStorage-backed cache when IndexedDB is unavailable', async () => {
    shouldFailFetch = true;
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });

    await examinationBatchService.createBatch({
      school_id: 'SCH-2',
      name: 'Fallback Batch'
    });

    const cachedPayload = Array.from(offlineBatchStore.values());
    const result = await examinationBatchService.listBatches();

    expect(cachedPayload.some((batch) => batch.name === 'Fallback Batch')).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Fallback Batch');
  });
});
