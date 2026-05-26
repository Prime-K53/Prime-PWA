import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const store: Record<string, string> = {};

  return {
    localStorage: {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        Object.keys(store).forEach((key) => delete store[key]);
      }),
      key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
      get length() {
        return Object.keys(store).length;
      }
    },
    idbGetAll: vi.fn(),
    idbGet: vi.fn(),
    idbPut: vi.fn(),
    idbDelete: vi.fn(),
    openDB: vi.fn(),
    deleteDB: vi.fn(async () => undefined),
    rxGetAll: vi.fn(),
    rxGet: vi.fn(),
    rxPut: vi.fn(),
    rxDelete: vi.fn(),
    rxReset: vi.fn(async () => undefined),
    rxEnsureReady: vi.fn(async () => ({ status: 'completed' })),
    backplaneGetJson: vi.fn(),
    backplaneSetJson: vi.fn(async () => undefined),
    recordHealthy: vi.fn(async () => undefined),
    recordError: vi.fn(async () => undefined),
    recordRollback: vi.fn(async () => undefined),
    getCollectionRoute: vi.fn(),
    resetPrimeDatabase: vi.fn(async () => undefined)
  };
});

vi.mock('idb', () => ({
  openDB: mocks.openDB,
  deleteDB: mocks.deleteDB
}));

vi.mock('../../../services/rxdb/bridge', () => ({
  isRxDbBackedStore: (storeName: string) => [
    'inventory',
    'customers',
    'suppliers',
    'invoices',
    'workCenters',
    'resources',
    'auditLogs',
    'examinationBatchNotifications'
  ].includes(storeName),
  rxDbBridge: {
    getAll: mocks.rxGetAll,
    get: mocks.rxGet,
    put: mocks.rxPut,
    delete: mocks.rxDelete,
    reset: mocks.rxReset,
    ensureReady: mocks.rxEnsureReady
  }
}));

vi.mock('../../../services/rxdb/settings-backplane', () => ({
  settingsBackplane: {
    getJson: mocks.backplaneGetJson,
    setJson: mocks.backplaneSetJson
  }
}));

vi.mock('../../../services/rxdb/migration-control', () => ({
  getMigrationControlPlane: () => ({
    getCollectionRoute: mocks.getCollectionRoute,
    recordHealthy: mocks.recordHealthy,
    recordError: mocks.recordError,
    recordRollback: mocks.recordRollback
  })
}));

vi.mock('../../../services/rxdb/database', () => ({
  resetPrimeDatabase: mocks.resetPrimeDatabase
}));

describe('dbService routing', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    Object.defineProperty(global, 'localStorage', {
      value: mocks.localStorage,
      configurable: true
    });

    mocks.idbGetAll.mockImplementation(async (storeName: string) => {
      if (storeName === 'customers') {
        return [
          { id: 'c-1', name: 'Legacy Customer' },
          { id: 'c-2', name: 'Legacy Only' }
        ];
      }
      return [];
    });

    mocks.idbGet.mockResolvedValue(undefined);
    mocks.idbPut.mockImplementation(async (_storeName: string, value: any) => value?.id || 'legacy-id');
    mocks.idbDelete.mockResolvedValue(undefined);

    mocks.openDB.mockResolvedValue({
      objectStoreNames: {
        contains: vi.fn(() => true)
      },
      getAll: mocks.idbGetAll,
      get: mocks.idbGet,
      put: mocks.idbPut,
      delete: mocks.idbDelete,
      close: vi.fn(),
      transaction: vi.fn(() => ({
        done: Promise.resolve(),
        abort: vi.fn(),
        objectStore: vi.fn(() => ({
          clear: vi.fn(async () => undefined),
          put: vi.fn(async () => undefined)
        }))
      }))
    });

    mocks.getCollectionRoute.mockImplementation((collectionId: string) => {
      if (collectionId === 'customers') {
        return {
          id: 'customers',
          mode: 'dual-read',
          readOrder: ['rxdb', 'legacy'],
          writeTargets: ['rxdb']
        };
      }

      if (collectionId === 'settings') {
        return {
          id: 'settings',
          mode: 'rxdb',
          readOrder: ['rxdb', 'legacy'],
          writeTargets: ['rxdb']
        };
      }

      return {
        id: collectionId,
        mode: 'legacy',
        readOrder: ['legacy', 'rxdb'],
        writeTargets: ['legacy']
      };
    });
  });

  it('merges RxDB and legacy rows for dual-read collections', async () => {
    mocks.rxGetAll.mockResolvedValue([{ id: 'c-1', name: 'Rx Customer' }]);
    const { dbService } = await import('../../../services/db');

    const rows = await dbService.getAll<{ id: string; name: string }>('customers');

    expect(rows).toEqual([
      { id: 'c-1', name: 'Rx Customer' },
      { id: 'c-2', name: 'Legacy Only' }
    ]);
    expect(mocks.rxGetAll).toHaveBeenCalledWith('customers');
    expect(mocks.idbGetAll).toHaveBeenCalledWith('customers');
  });

  it('routes settings through the exact-key settings backplane', async () => {
    const { dbService } = await import('../../../services/db');
    const value = { defaultCurrency: 'MWK', timezone: 'Africa/Johannesburg' };

    await dbService.saveSetting('workspaceConfig', value);

    expect(mocks.backplaneSetJson).toHaveBeenCalledWith('workspaceConfig', value, { exactKey: true });
    expect(mocks.idbPut).not.toHaveBeenCalledWith('settings', expect.anything());
  });

  it('falls back to legacy writes when an RxDB-primary write fails', async () => {
    mocks.rxPut.mockRejectedValue(new Error('RxDB write failed'));
    mocks.getCollectionRoute.mockImplementation((collectionId: string) => {
      if (collectionId === 'customers') {
        return {
          id: 'customers',
          mode: 'rxdb',
          readOrder: ['rxdb', 'legacy'],
          writeTargets: ['rxdb']
        };
      }

      if (collectionId === 'settings') {
        return {
          id: 'settings',
          mode: 'rxdb',
          readOrder: ['rxdb', 'legacy'],
          writeTargets: ['rxdb']
        };
      }

      return {
        id: collectionId,
        mode: 'legacy',
        readOrder: ['legacy', 'rxdb'],
        writeTargets: ['legacy']
      };
    });

    const { dbService } = await import('../../../services/db');
    const result = await dbService.put('customers', { id: 'c-9', name: 'Fallback Customer' } as any);

    expect(result).toBe('c-9');
    expect(mocks.idbPut).toHaveBeenCalledWith('customers', expect.objectContaining({ id: 'c-9' }));
    expect(mocks.recordRollback).toHaveBeenCalled();
  });
});
