import type { SyncOperationEntity, SyncOperationStatus, SyncOperationType, BaseEntity } from '../types';
import { syncOperationRepository } from '../repositories/SyncOperationRepository';
import { databaseManager } from '../DatabaseManager';

export type SyncQueuePriority = 'low' | 'normal' | 'high' | 'urgent';

export interface SyncQueueItem {
  id: string;
  entityType: string;
  operation: SyncOperationType;
  entityId: string;
  correlationId: string;
  status: SyncOperationStatus;
  retries: number;
  priority: SyncQueuePriority;
  dedupeKey?: string;
  processor?: string;
  optimistic?: boolean;
  conflictKey?: string;
  availableAt?: string | null;
  nextRetryAt?: string | null;
  lastError?: string | null;
  lastAttemptAt?: string | null;
  payload?: Record<string, unknown> | null;
  request: { url: string; method: 'POST' | 'PUT' | 'DELETE'; headers: Record<string, string>; body: unknown };
  attemptHistory?: Array<{ attemptedAt: string; status: string; error?: string }>;
  createdAt: string;
  updatedAt: string;
}

export class SyncQueue {
  async enqueue(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'retries'>): Promise<SyncQueueItem> {
    const now = new Date().toISOString();
    const queueItem: SyncQueueItem = {
      ...item,
      id: `sync-${item.entityId}-${crypto.randomUUID?.() ?? Date.now().toString()}`,
      status: 'pending',
      retries: 0,
      createdAt: now,
      updatedAt: now,
      attemptHistory: [],
    };

    const { DatabaseManagerFactory } = await import('../DatabaseManagerFactory');
    const table = await DatabaseManagerFactory.getTable<BaseEntity & Record<string, unknown>>('syncOperations');

    const entity: SyncOperationEntity = {
      id: queueItem.id,
      entityType: queueItem.entityType,
      operation: queueItem.operation,
      entityId: queueItem.entityId,
      correlationId: queueItem.correlationId,
      queueStatus: queueItem.status as SyncOperationStatus,
      retries: queueItem.retries,
      nextRetryAt: queueItem.nextRetryAt || new Date(Date.now() + 60000).toISOString(),
      lastError: queueItem.lastError || undefined,
      request: {
        url: queueItem.request.url,
        method: queueItem.request.method,
        headers: queueItem.request.headers,
        bodyJson: JSON.stringify(queueItem.request.body),
      },
      entityVersion: 1,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      source: 'user-action',
      sync: { status: 'pending', retryCount: 0 },
      tags: [],
      extra: {
        queuePriority: item.priority,
        dedupeKey: item.dedupeKey,
        processor: item.processor,
        availableAt: item.availableAt,
        optimistic: item.optimistic,
        conflictKey: item.conflictKey,
        lastAttemptAt: item.lastAttemptAt,
      },
    };

    const existing = await table
      .filter((e) => (e as any).extra?.dedupeKey === item.dedupeKey)
      .first();

    if (existing) {
      await table.put({ ...existing, ...entity, id: existing.id, createdAt: existing.createdAt });
    } else {
      await table.put(entity as any);
    }

    return queueItem;
  }

  async dequeue(statuses: SyncOperationStatus[] = ['pending', 'failed']): Promise<SyncQueueItem[]> {
    const items = await syncOperationRepository.findByStatus(statuses);
    return items.map((op) => this.toQueueItem(op));
  }

  async updateStatus(id: string, status: SyncOperationStatus, error?: unknown): Promise<void> {
    const now = new Date().toISOString();
    const patch: Partial<SyncOperationEntity> = {
      queueStatus: status,
      updatedAt: now,
      lastError: error ? (error instanceof Error ? error.message : String(error)) : undefined,
      retries: status === 'failed' ? undefined : undefined,
    };
    if (status === 'failed') {
      const existing = await syncOperationRepository.findById(id);
      if (existing) {
        (patch as any).retries = existing.retries + 1;
        (patch as any).nextRetryAt = new Date(Date.now() + this.buildBackoff(existing.retries + 1)).toISOString();
      }
    }
    await syncOperationRepository.patch(id, patch as Partial<SyncOperationEntity>);
  }

  async remove(id: string): Promise<void> {
    await syncOperationRepository.softDelete(id);
  }

  async count(): Promise<number> {
    return syncOperationRepository.countPending();
  }

  private toQueueItem(op: SyncOperationEntity): SyncQueueItem {
    return {
      id: op.id,
      entityType: op.entityType,
      operation: op.operation,
      entityId: op.entityId,
      correlationId: op.correlationId,
      status: op.queueStatus,
      retries: op.retries,
      priority: (op.extra?.queuePriority as SyncQueuePriority) || 'normal',
      dedupeKey: op.extra?.dedupeKey as string | undefined,
      processor: op.extra?.processor as string | undefined,
      optimistic: op.extra?.optimistic as boolean | undefined,
      conflictKey: op.extra?.conflictKey as string | undefined,
      availableAt: op.extra?.availableAt as string | undefined || op.nextRetryAt,
      nextRetryAt: op.nextRetryAt,
      lastError: op.lastError,
      lastAttemptAt: op.extra?.lastAttemptAt as string | undefined,
      payload: null,
      request: {
        url: op.request.url,
        method: op.request.method,
        headers: op.request.headers,
        body: JSON.parse(op.request.bodyJson || 'null'),
      },
      attemptHistory: [],
      createdAt: op.createdAt,
      updatedAt: op.updatedAt,
    };
  }

  private buildBackoff(retries: number): number {
    return Math.min(60000, 1000 * Math.pow(2, Math.max(0, retries)));
  }
}

export const syncQueue = new SyncQueue();
