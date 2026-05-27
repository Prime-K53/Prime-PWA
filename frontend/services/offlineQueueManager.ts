import { offlineDb } from './offlineDb';
import type { SyncOperation, SyncQueueItem, SyncQueuePriority, SyncQueueStatus } from '../types/offline';

export const BACKGROUND_SYNC_TAG = 'prime-erp-sync';

const nowIso = () => new Date().toISOString();

const createQueueId = (entityId: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `sync-${entityId}-${crypto.randomUUID()}`;
  }
  return `sync-${entityId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const createCorrelationId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const notifySyncWorker = async () => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  if (registrations.length === 0) return;

  try {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ]).catch(() => null);
    if (!registration) return;

    const syncManager = (registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    }).sync;

    if (syncManager?.register) {
      await syncManager.register(BACKGROUND_SYNC_TAG);
    }

    registration.active?.postMessage({ type: 'SYNC_PENDING_CHANGES' });
  } catch {
    // Background Sync is best effort.
  }
};

export const queueOfflineMutation = async <TPayload extends Record<string, unknown> | null>(input: {
  entityId: string;
  operation: SyncOperation;
  request: SyncQueueItem<TPayload>['request'];
  payload: TPayload;
  priority?: SyncQueuePriority;
  dedupeKey?: string;
  processor?: string;
  optimistic?: boolean;
  conflictKey?: string;
}) => {
  const item: SyncQueueItem<TPayload> = {
    id: createQueueId(input.entityId),
    entityType: 'examination-batch',
    operation: input.operation,
    entityId: String(input.entityId),
    correlationId: createCorrelationId(),
    request: input.request,
    payload: input.payload,
    status: 'pending',
    retries: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    nextRetryAt: null,
    lastError: null,
    priority: input.priority || 'normal',
    dedupeKey: input.dedupeKey || `examination-batch:${input.entityId}:${input.operation}`,
    processor: input.processor || 'examination-batch',
    optimistic: input.optimistic ?? true,
    conflictKey: input.conflictKey,
    availableAt: null,
    lastAttemptAt: null,
    attemptHistory: []
  };

  await offlineDb.enqueueSyncQueueItem(item);
  await notifySyncWorker();
  return item;
};

export const getQueuedMutations = async (statuses?: SyncQueueStatus[]) => offlineDb.getSyncQueue(statuses);

export const saveQueuedMutation = async (item: SyncQueueItem) => offlineDb.saveSyncQueueItem(item);

export const removeQueuedMutation = async (id: string) => offlineDb.deleteSyncQueueItem(id);

export const countQueuedMutations = async () => (await offlineDb.getSyncQueue()).length;
