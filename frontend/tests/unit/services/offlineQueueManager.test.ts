import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enqueueSyncQueueItem: vi.fn(async (item: any) => item),
  getSyncQueue: vi.fn(async () => []),
  saveSyncQueueItem: vi.fn(async (item: any) => item),
  deleteSyncQueueItem: vi.fn(async () => undefined),
  supportsRxDb: vi.fn(() => false),
  enqueue: vi.fn(async (item: any) => item)
}));

vi.mock('../../../services/offlineDb', () => ({
  offlineDb: {
    enqueueSyncQueueItem: mocks.enqueueSyncQueueItem,
    getSyncQueue: mocks.getSyncQueue,
    saveSyncQueueItem: mocks.saveSyncQueueItem,
    deleteSyncQueueItem: mocks.deleteSyncQueueItem
  }
}));

vi.mock('../../../services/rxdb/queue-coordinator', () => ({
  rxdbQueueCoordinator: {
    supportsRxDb: mocks.supportsRxDb,
    enqueue: mocks.enqueue
  }
}));

Object.defineProperty(global.navigator, 'serviceWorker', {
  value: {
    ready: Promise.resolve({
      sync: {
        register: vi.fn(async () => undefined)
      },
      active: {
        postMessage: vi.fn()
      }
    })
  },
  configurable: true
});

import { queueOfflineMutation } from '../../../services/offlineQueueManager';

describe('offlineQueueManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds queue metadata for priority, dedupe, and optimistic processing', async () => {
    const queued = await queueOfflineMutation({
      entityId: 'batch-001',
      operation: 'update',
      request: {
        url: '/api/examination/batches/batch-001',
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: { id: 'batch-001' }
      },
      payload: { id: 'batch-001', status: 'draft' },
      priority: 'high',
      dedupeKey: 'exam:batch-001:update',
      processor: 'examination-batch',
      optimistic: true
    });

    expect(mocks.enqueueSyncQueueItem).toHaveBeenCalledTimes(1);
    expect(queued.priority).toBe('high');
    expect(queued.dedupeKey).toBe('exam:batch-001:update');
    expect(queued.processor).toBe('examination-batch');
    expect(queued.optimistic).toBe(true);
    expect(queued.attemptHistory).toEqual([]);
  });
});
