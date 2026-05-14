import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { examinationBatchService } from '../../services/examinationBatchService';
import { dbService } from '../../services/db';

type StoreRecord = Map<string, any>;

const stores = new Map<string, StoreRecord>();

const getStore = (name: string) => {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  return stores.get(name)!;
};

const createResponse = (payload: any, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
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
    })
  };
  return { dbService: dbServiceMock };
});

describe('examinationBatchService offline support', () => {
  let fetchMock: any;
  let shouldFailFetch = false;

  beforeEach(() => {
    stores.clear();
    localStorage.clear();
    sessionStorage.clear();
    shouldFailFetch = false;
    fetchMock = vi.fn((url: string) => {
      if (shouldFailFetch) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return Promise.resolve(createResponse({ id: 'server-1', name: 'Server Batch' }));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-123' });
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns local batches when backend is unavailable', async () => {
    await dbService.put('examinationBatches' as any, { id: 'local-1', name: 'Local Batch' });
    shouldFailFetch = true;
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });

    const result = await examinationBatchService.listBatches();

    expect(result.length).toBe(1);
    expect(result[0].id).toBe('local-1');
  });

  it('creates batches offline and stores them in the outbox', async () => {
    shouldFailFetch = true;
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });

    const batch = await examinationBatchService.createBatch({
      school_id: 'SCH-1',
      name: 'Offline Batch'
    });

    const stored = await dbService.getAll('examinationBatches' as any);
    const outbox = await dbService.getAll('syncOutbox' as any);

    expect(batch.id).toContain('local-');
    expect((batch as any)._syncStatus).toBe('pending');
    expect(stored.length).toBe(1);
    expect(outbox.length).toBe(1);
    expect(outbox[0].type).toBe('examinationBatch:create');
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
    const stored = await dbService.getAll('examinationBatches' as any);
    const outbox = await dbService.getAll('syncOutbox' as any);

    expect(syncResult.failed).toBe(0);
    expect(outbox.length).toBe(0);
    expect(stored.some((batch: any) => batch.id === 'server-1')).toBe(true);
    expect(stored.some((batch: any) => batch.id === offlineBatch.id)).toBe(false);
  });

  it('falls back to localStorage when IndexedDB quota is exceeded', async () => {
    shouldFailFetch = true;
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    (dbService.put as any).mockImplementationOnce(async () => {
      throw new Error('QuotaExceededError');
    });

    await examinationBatchService.createBatch({
      school_id: 'SCH-2',
      name: 'Fallback Batch'
    });

    (dbService.getAll as any).mockImplementationOnce(async () => {
      throw new Error('Database blocked');
    });

    const result = await examinationBatchService.listBatches();

    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Fallback Batch');
  });
});
