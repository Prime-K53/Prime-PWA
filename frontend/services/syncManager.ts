import type { SyncQueueItem } from '../types/offline';
import { apiClient, OfflineRequestError, UnauthorizedRequestError } from './apiClient';
import { getQueuedMutations, removeQueuedMutation, saveQueuedMutation, BACKGROUND_SYNC_TAG } from './offlineQueueManager';
import { offlineDb } from './offlineDb';
import { dexieQueueCoordinator } from './dexie/queue-coordinator';

export interface SyncSummary {
  synced: number;
  failed: number;
  blocked: number;
  pending: number;
}

export interface SyncProcessorResult {
  remove?: boolean;
}

const nowIso = () => new Date().toISOString();

const buildBackoff = (retries: number) => Math.min(60000, 1000 * Math.pow(2, Math.max(0, retries)));

let syncInFlight: Promise<SyncSummary> | null = null;

export const syncQueuedChanges = async (processor?: (item: SyncQueueItem) => Promise<SyncProcessorResult | void>): Promise<SyncSummary> => {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    const queue = await getQueuedMutations(['pending', 'failed', 'blocked']);
    if (queue.length === 0) {
      await offlineDb.setOfflineState({
        ...(await offlineDb.getOfflineState()),
        isSyncing: false,
        pendingMutations: 0,
        cacheReady: true
      });
      return { synced: 0, failed: 0, blocked: 0, pending: 0 };
    }

    const currentState = await offlineDb.getOfflineState();
    await offlineDb.setOfflineState({
      ...currentState,
      isSyncing: true,
      pendingMutations: queue.length,
      cacheReady: true
    });

    let synced = 0;
    let failed = 0;
    let blocked = 0;

    for (const item of queue) {
      if (item.nextRetryAt && new Date(item.nextRetryAt).getTime() > Date.now()) {
        continue;
      }

      if (!apiClient.canUseRemoteApi()) {
        break;
      }

      try {
        await saveQueuedMutation({
          ...item,
          status: 'syncing',
          lastAttemptAt: nowIso(),
          updatedAt: nowIso()
        });

        await apiClient.requestRaw({
          endpoint: item.request.url,
          method: item.request.method,
          headers: item.request.headers,
          body: item.request.body ? JSON.stringify(item.request.body) : null,
          baseCandidates: [''],
          retries: 0
        });

        if (processor) {
          const result = await processor(item);
          if (result && result.remove === false) {
            continue;
          }
        }

        await removeQueuedMutation(item.id);
        synced += 1;
      } catch (error) {
        if (error instanceof UnauthorizedRequestError) {
          blocked += 1;
          await saveQueuedMutation(dexieQueueCoordinator.createFailurePatch(item as any, 'blocked', error, null) as any);
          break;
        }

        if (error instanceof OfflineRequestError) {
          failed += 1;
          await saveQueuedMutation(
            dexieQueueCoordinator.createFailurePatch(
              item as any,
              'failed',
              error,
              new Date(Date.now() + buildBackoff(item.retries + 1)).toISOString()
            ) as any
          );
          break;
        }

        failed += 1;
        await saveQueuedMutation(
          dexieQueueCoordinator.createFailurePatch(
            item as any,
            'failed',
            error,
            new Date(Date.now() + buildBackoff(item.retries + 1)).toISOString()
          ) as any
        );
      }
    }

    const remaining = await getQueuedMutations(['pending', 'failed', 'blocked']);
    await offlineDb.setOfflineState({
      ...(await offlineDb.getOfflineState()),
      isSyncing: false,
      lastSyncedAt: synced > 0 ? nowIso() : currentState.lastSyncedAt,
      pendingMutations: remaining.length,
      authBlocked: blocked > 0 || currentState.authBlocked,
      cacheReady: true
    });

    return {
      synced,
      failed,
      blocked,
      pending: remaining.length
    };
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
};

export const bindSyncLifecycle = (syncFn: () => Promise<unknown>) => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleOnline = () => {
    void syncFn();
  };

  const handleSwMessage = (event: MessageEvent) => {
    const type = event.data?.type;
    if (type === 'SYNC_PENDING_CHANGES' || type === BACKGROUND_SYNC_TAG) {
      void syncFn();
    }
  };

  window.addEventListener('online', handleOnline);
  navigator.serviceWorker?.addEventListener('message', handleSwMessage);

  return () => {
    window.removeEventListener('online', handleOnline);
    navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
  };
};
