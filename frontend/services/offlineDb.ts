import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { BatchRecord, OfflineState, SyncQueueItem, SyncQueuePriority, SyncQueueStatus } from '../types/offline';
import { dexieBridge } from './dexie/bridge';
import { dexieQueueCoordinator } from './dexie/queue-coordinator';

interface PrimeErpOfflineDbSchema extends DBSchema {
  batches: {
    key: string;
    value: BatchRecord;
  };
  syncQueue: {
    key: string;
    value: SyncQueueItem;
    indexes: {
      'by-status': SyncQueueStatus;
      'by-next-retry': string;
      'by-entity-id': string;
    };
  };
  meta: {
    key: string;
    value: {
      key: string;
      value: unknown;
      updatedAt: string;
    };
  };
}

const DB_NAME = 'PrimeERP_OfflineFirst';
const DB_VERSION = 1;
const STORAGE_PREFIX = 'primeerp:offline-db';
const OFFLINE_DB_EVENT = 'primeerp:offline-db-changed';

let dbPromise: Promise<IDBPDatabase<PrimeErpOfflineDbSchema>> | null = null;

const nowIso = () => new Date().toISOString();

const storageKey = (storeName: 'batches' | 'syncQueue' | 'meta') => `${STORAGE_PREFIX}:${storeName}`;

const canUseIndexedDb = () => typeof indexedDB !== 'undefined';

const emitOfflineDbChange = (store: string, ids: string[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(OFFLINE_DB_EVENT, {
    detail: {
      store,
      ids,
      at: nowIso()
    }
  }));
};

const readLocalFallback = <T extends { id?: string; key?: string }>(storeName: 'batches' | 'syncQueue' | 'meta'): T[] => {
  if (typeof localStorage === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(storageKey(storeName));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLocalFallback = <T extends { id?: string; key?: string }>(storeName: 'batches' | 'syncQueue' | 'meta', rows: T[]) => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(storageKey(storeName), JSON.stringify(rows));
};

const upsertLocalFallback = <T extends { id?: string; key?: string }>(
  storeName: 'batches' | 'syncQueue' | 'meta',
  row: T
) => {
  const rows = readLocalFallback<T>(storeName);
  const key = String(row.id ?? row.key ?? '');
  const next = rows.filter((entry) => String(entry.id ?? entry.key ?? '') !== key);
  next.push(row);
  writeLocalFallback(storeName, next);
};

const removeFromLocalFallback = (storeName: 'batches' | 'syncQueue' | 'meta', key: string) => {
  const rows = readLocalFallback<any>(storeName);
  writeLocalFallback(storeName, rows.filter((entry) => String(entry.id ?? entry.key ?? '') !== String(key)));
};

const initDb = async () => {
  if (!canUseIndexedDb()) {
    throw new Error('IndexedDB is not available in this runtime.');
  }

  if (!dbPromise) {
    dbPromise = openDB<PrimeErpOfflineDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('batches')) {
          db.createObjectStore('batches', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('syncQueue')) {
          const queueStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
          queueStore.createIndex('by-status', 'status');
          queueStore.createIndex('by-next-retry', 'nextRetryAt');
          queueStore.createIndex('by-entity-id', 'entityId');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      }
    });
  }

  return dbPromise;
};

export const closeOfflineDbConnection = async () => {
  if (!dbPromise) {
    return;
  }

  try {
    const db = await dbPromise;
    db.close();
  } catch {
    // Ignore close failures during teardown/reset.
  } finally {
    dbPromise = null;
  }
};

const withIndexedDbFallback = async <T>(fallback: () => T | Promise<T>, operation: (db: IDBPDatabase<PrimeErpOfflineDbSchema>) => Promise<T>) => {
  if (!canUseIndexedDb()) {
    return fallback();
  }

  try {
    const db = await initDb();
    return await operation(db);
  } catch {
    return fallback();
  }
};

const shouldUseDexie = (_collectionId?: string) => false;
const shouldMirrorLegacyWrites = (_collectionId?: string) => false;

const readBatchesFromLegacy = () => withIndexedDbFallback(
  () => readLocalFallback<BatchRecord>('batches'),
  async (db) => db.getAll('batches')
);

const readBatchFromLegacy = (id: string) => withIndexedDbFallback(
  () => readLocalFallback<BatchRecord>('batches').find((row) => String(row.id) === id),
  async (db) => db.get('batches', id)
);

const writeBatchToLegacy = async (batch: BatchRecord) => {
  await withIndexedDbFallback(
    () => {
      upsertLocalFallback('batches', batch);
      return undefined;
    },
    async (db) => {
      await db.put('batches', batch);
    }
  );
};

const writeBatchesToLegacy = async (batches: BatchRecord[]) => {
  await withIndexedDbFallback(
    () => {
      writeLocalFallback('batches', batches);
      return undefined;
    },
    async (db) => {
      const tx = db.transaction('batches', 'readwrite');
      await tx.store.clear();
      for (const batch of batches) {
        await tx.store.put(batch);
      }
      await tx.done;
    }
  );
};

const deleteBatchFromLegacy = async (id: string) => {
  await withIndexedDbFallback(
    () => {
      removeFromLocalFallback('batches', id);
      return undefined;
    },
    async (db) => {
      await db.delete('batches', id);
    }
  );
};

const normalizeQueueRows = (rows: SyncQueueItem[], statuses?: SyncQueueStatus[]) => {
  const priorityWeight: Record<SyncQueuePriority, number> = {
    urgent: 0,
    high: 1,
    normal: 2,
    low: 3
  };
  const wanted = Array.isArray(statuses) && statuses.length > 0 ? new Set(statuses) : null;
  return rows
    .filter((row) => !wanted || wanted.has(row.status))
    .sort((left, right) => {
      const leftPriority = priorityWeight[(left.priority || 'normal') as SyncQueuePriority] ?? priorityWeight.normal;
      const rightPriority = priorityWeight[(right.priority || 'normal') as SyncQueuePriority] ?? priorityWeight.normal;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      const leftAvailableAt = left.availableAt || left.nextRetryAt || left.createdAt;
      const rightAvailableAt = right.availableAt || right.nextRetryAt || right.createdAt;
      const availableDelta = new Date(leftAvailableAt).getTime() - new Date(rightAvailableAt).getTime();
      if (availableDelta !== 0) {
        return availableDelta;
      }

      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    });
};

const mergeByIdentifier = <T extends { id?: string; dedupeKey?: string }>(primary: T[], fallback: T[]) => {
  const merged = new Map<string, T>();

  [...fallback, ...primary].forEach((row) => {
    const key = String(row.id || row.dedupeKey || '');
    if (!key) return;
    merged.set(key, row);
  });

  return Array.from(merged.values());
};

const readQueueFromLegacy = (statuses?: SyncQueueStatus[]) => withIndexedDbFallback(
  () => normalizeQueueRows(readLocalFallback<SyncQueueItem>('syncQueue'), statuses),
  async (db) => normalizeQueueRows(await db.getAll('syncQueue'), statuses)
);

const writeQueueToLegacy = async (item: SyncQueueItem) => {
  await withIndexedDbFallback(
    () => {
      upsertLocalFallback('syncQueue', item);
      return undefined;
    },
    async (db) => {
      await db.put('syncQueue', item);
    }
  );
};

const deleteQueueFromLegacy = async (id: string) => {
  await withIndexedDbFallback(
    () => {
      removeFromLocalFallback('syncQueue', id);
      return undefined;
    },
    async (db) => {
      await db.delete('syncQueue', id);
    }
  );
};

const readMetaFromLegacy = async <T>(key: string): Promise<T | undefined> =>
  withIndexedDbFallback(
    () => {
      const record = readLocalFallback<{ key: string; value: T }>('meta').find((entry) => String(entry.key) === String(key));
      return record?.value;
    },
    async (db) => {
      const record = await db.get('meta', key);
      return record?.value as T | undefined;
    }
  );

const writeMetaToLegacy = async <T>(key: string, value: T) => {
  const record = {
    key,
    value,
    updatedAt: nowIso()
  };

  await withIndexedDbFallback(
    () => {
      upsertLocalFallback('meta', record);
      return undefined;
    },
    async (db) => {
      await db.put('meta', record);
    }
  );
};

export const offlineDb = {
  eventName: OFFLINE_DB_EVENT,

  async getAllBatches(): Promise<BatchRecord[]> {
    if (shouldUseDexie('examinationPricing') && canUseIndexedDb()) {
      try {
        await dexieBridge.ensureReady();
        const rows = await dexieBridge.getOfflineBatches();
        const legacyRows = await readBatchesFromLegacy();
        const mergedRows = mergeByIdentifier(rows as BatchRecord[], legacyRows);
        if (mergedRows.length > 0) {
          return mergedRows;
        }
      } catch {
        // Fall back to legacy batch cache.
      }
    }

    return readBatchesFromLegacy();
  },

  async getBatch(id: string): Promise<BatchRecord | undefined> {
    const key = String(id || '');
    if (shouldUseDexie('examinationPricing') && canUseIndexedDb()) {
      try {
        await dexieBridge.ensureReady();
        const rows = await dexieBridge.getOfflineBatches();
        const row = rows.find((r: any) => r.id === key);
        if (row) {
          return row as BatchRecord | undefined;
        }
      } catch {
        // Fall back to legacy batch cache.
      }
    }

    return readBatchFromLegacy(key);
  },

  async saveBatch(batch: BatchRecord, { silent = true }: { silent?: boolean } = {}): Promise<BatchRecord> {
    const next = {
      ...batch,
      updated_at: String(batch.updated_at || nowIso())
    };

    let storedInRxDb = false;

    if (shouldUseDexie('examinationPricing') && canUseIndexedDb()) {
      try {
        await dexieBridge.ensureReady();
        await dexieBridge.saveOfflineBatch(next);
        storedInRxDb = true;
      } catch {
        storedInRxDb = false;
      }
    }

    if (!storedInRxDb || shouldMirrorLegacyWrites('examinationPricing')) {
      await writeBatchToLegacy(next);
    }

    if (!silent) {
      emitOfflineDbChange('batches', [String(next.id)]);
    }

    return next;
  },

  async saveBatches(batches: BatchRecord[], { silent = true }: { silent?: boolean } = {}): Promise<BatchRecord[]> {
    const normalized = batches.map((batch) => ({
      ...batch,
      updated_at: String(batch.updated_at || nowIso())
    }));

    let storedInRxDb = false;

    if (shouldUseDexie('examinationPricing') && canUseIndexedDb()) {
      try {
        await dexieBridge.ensureReady();
        for (const batch of normalized) { await dexieBridge.saveOfflineBatch(batch); }
        storedInRxDb = true;
      } catch {
        storedInRxDb = false;
      }
    }

    if (!storedInRxDb || shouldMirrorLegacyWrites('examinationPricing')) {
      await writeBatchesToLegacy(normalized);
    }

    if (!silent && normalized.length > 0) {
      emitOfflineDbChange('batches', normalized.map((batch) => String(batch.id)));
    }

    return normalized;
  },

  async deleteBatch(id: string, { silent = true }: { silent?: boolean } = {}) {
    const key = String(id || '');

    let removedFromRxDb = false;

    if (shouldUseDexie('examinationPricing') && canUseIndexedDb()) {
      try {
        await dexieBridge.ensureReady();
        await dexieBridge.deleteOfflineBatch(key);
        removedFromRxDb = true;
      } catch {
        removedFromRxDb = false;
      }
    }

    if (!removedFromRxDb || shouldMirrorLegacyWrites('examinationPricing')) {
      await deleteBatchFromLegacy(key);
    }

    if (!silent) {
      emitOfflineDbChange('batches', [key]);
    }
  },

  async getSyncQueue(statuses?: SyncQueueStatus[]): Promise<SyncQueueItem[]> {
    if (shouldUseDexie('syncOperations') && dexieQueueCoordinator.supportsDexie()) {
      try {
        const rows = await Promise.race([
          dexieQueueCoordinator.getQueueItems(statuses),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000))
        ]);
        const legacyRows = await readQueueFromLegacy(statuses);
        const mergedRows = normalizeQueueRows(mergeByIdentifier<SyncQueueItem>((rows as SyncQueueItem[]) || [] as any, legacyRows), statuses);
        if (mergedRows.length > 0) {
          return mergedRows;
        }
      } catch {
        // Fall back to legacy queue.
      }
    }

    return readQueueFromLegacy(statuses);
  },

  async enqueueSyncQueueItem(item: SyncQueueItem, { silent = false }: { silent?: boolean } = {}): Promise<SyncQueueItem | null> {
    let next = {
      ...item,
      updatedAt: nowIso()
    } as SyncQueueItem;

    let storedInRxDb = false;

    if (shouldUseDexie('syncOperations') && dexieQueueCoordinator.supportsDexie()) {
      try {
        const queued = await Promise.race([
          dexieQueueCoordinator.enqueue(next as any),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000))
        ]);
        if (queued) {
          next = queued as SyncQueueItem;
          storedInRxDb = true;
        }
      } catch {
        storedInRxDb = false;
      }
    }

    if (!storedInRxDb || shouldMirrorLegacyWrites('syncOperations')) {
      await writeQueueToLegacy(next);
    }

    if (!silent) {
      emitOfflineDbChange('syncQueue', [String(next.id)]);
    }

    return next;
  },

  async saveSyncQueueItem(item: SyncQueueItem, { silent = false }: { silent?: boolean } = {}): Promise<SyncQueueItem> {
    const next: SyncQueueItem = {
      ...item,
      updatedAt: nowIso()
    };

    let storedInRxDb = false;

    if (shouldUseDexie('syncOperations') && dexieQueueCoordinator.supportsDexie()) {
      try {
        const saved = await Promise.race([
          dexieQueueCoordinator.save(next as any),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000))
        ]);
        storedInRxDb = Boolean(saved);
      } catch {
        storedInRxDb = false;
      }
    }

    if (!storedInRxDb || shouldMirrorLegacyWrites('syncOperations')) {
      await writeQueueToLegacy(next);
    }

    if (!silent) {
      emitOfflineDbChange('syncQueue', [String(next.id)]);
    }

    return next;
  },

  async deleteSyncQueueItem(id: string, { silent = false }: { silent?: boolean } = {}) {
    const key = String(id || '');

    let removedFromRxDb = false;

    if (shouldUseDexie('syncOperations') && dexieQueueCoordinator.supportsDexie()) {
      try {
        removedFromRxDb = await dexieQueueCoordinator.remove(key);
      } catch {
        removedFromRxDb = false;
      }
    }

    if (!removedFromRxDb || shouldMirrorLegacyWrites('syncOperations')) {
      await deleteQueueFromLegacy(key);
    }

    if (!silent) {
      emitOfflineDbChange('syncQueue', [key]);
    }
  },

  async getMetaValue<T>(key: string): Promise<T | undefined> {
    if (shouldUseDexie('settings') && canUseIndexedDb()) {
      try {
        await dexieBridge.ensureReady();
        const value = await dexieBridge.getOfflineMetaValue<T>(key);
        if (value !== undefined) {
          return value;
        }
      } catch {
        // Fall back to legacy meta store.
      }
    }

    return readMetaFromLegacy<T>(key);
  },

  async setMetaValue<T>(key: string, value: T, { silent = true }: { silent?: boolean } = {}) {
    let storedInRxDb = false;

    if (shouldUseDexie('settings') && canUseIndexedDb()) {
      try {
        await dexieBridge.ensureReady();
        await dexieBridge.setOfflineMetaValue(key, value);
        storedInRxDb = true;
      } catch {
        storedInRxDb = false;
      }
    }

    if (!storedInRxDb || shouldMirrorLegacyWrites('settings')) {
      await writeMetaToLegacy(key, value);
    }

    if (!silent) {
      emitOfflineDbChange('meta', [key]);
    }
  },

  async getOfflineState(): Promise<OfflineState> {
    const stored = await this.getMetaValue('offline-state') as OfflineState | undefined;
    return stored || {
      isOnline: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
      isSyncing: false,
      lastSyncedAt: null,
      pendingMutations: 0,
      authBlocked: false,
      cacheReady: false
    };
  },

  async setOfflineState(nextState: OfflineState, { silent = true }: { silent?: boolean } = {}) {
    await this.setMetaValue('offline-state', nextState, { silent });
  }
};
