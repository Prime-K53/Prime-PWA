import type { SyncOperationStatus } from './types';
import { syncQueue, type SyncQueueItem, type SyncQueuePriority } from './sync/SyncQueue';

const canUseDexie = () => typeof indexedDB !== 'undefined';

const safeJsonEquals = (left: unknown, right: unknown) => {
  try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
};

export const dexieQueueCoordinator = {
  supportsDexie() { return canUseDexie(); },

  async getQueueItems(statuses?: SyncOperationStatus[]): Promise<SyncQueueItem[]> {
    if (!canUseDexie()) return [];
    return syncQueue.dequeue(statuses);
  },

  async enqueue(item: SyncQueueItem): Promise<SyncQueueItem | null> {
    if (!canUseDexie()) return null;
    return syncQueue.enqueue({
      entityType: item.entityType,
      operation: item.operation,
      entityId: item.entityId,
      correlationId: item.correlationId,
      priority: (item.priority as SyncQueuePriority) || 'normal',
      dedupeKey: item.dedupeKey || `${item.entityType}:${item.entityId}:${item.operation}`,
      processor: item.processor || item.entityType,
      optimistic: item.optimistic ?? true,
      conflictKey: item.conflictKey,
      availableAt: item.availableAt || item.nextRetryAt,
      request: item.request,
      payload: (item as any).payload || null,
    });
  },

  async save(item: SyncQueueItem): Promise<SyncQueueItem | null> {
    if (!canUseDexie()) return null;
    await syncQueue.updateStatus(item.id, item.status as SyncOperationStatus);
    return item;
  },

  async remove(id: string): Promise<boolean> {
    if (!canUseDexie()) return false;
    await syncQueue.remove(id);
    return true;
  },

  async getMetrics() {
    const items = await syncQueue.dequeue();
    return items.reduce((acc, item) => {
      acc.total++;
      acc.byStatus[item.status] = (acc.byStatus[item.status] || 0) + 1;
      acc.byPriority[item.priority] = (acc.byPriority[item.priority] || 0) + 1;
      return acc;
    }, { total: 0, byStatus: {} as Record<string, number>, byPriority: {} as Record<string, number> });
  },

  createFailurePatch(item: SyncQueueItem, status: SyncOperationStatus, error: unknown, nextRetryAt: string | null): SyncQueueItem {
    const attemptedAt = new Date().toISOString();
    return {
      ...item,
      status,
      nextRetryAt,
      availableAt: nextRetryAt,
      lastError: error instanceof Error ? error.message : String(error || 'Queue processing failed'),
      lastAttemptAt: attemptedAt,
      updatedAt: attemptedAt,
      retries: item.retries + 1,
      attemptHistory: [
        ...(item.attemptHistory || []),
        { attemptedAt, status, error: error instanceof Error ? error.message : String(error) },
      ].slice(-20),
    };
  },
};
