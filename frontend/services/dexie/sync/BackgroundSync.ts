import { syncQueue } from './SyncQueue';
import { defaultRetryPolicy } from './RetryPolicy';

export type SyncProcessor = (item: import('./SyncQueue').SyncQueueItem) => Promise<{ remove?: boolean } | void>;

export interface SyncSummary {
  synced: number;
  failed: number;
  blocked: number;
  pending: number;
}

export class BackgroundSync {
  private syncInProgress = false;
  private processor: SyncProcessor | null = null;
  private online = true;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  setProcessor(processor: SyncProcessor): void {
    this.processor = processor;
  }

  setOnline(online: boolean): void {
    this.online = online;
    if (online) {
      void this.triggerSync();
    }
  }

  async triggerSync(): Promise<SyncSummary> {
    if (this.syncInProgress || !this.online) {
      return { synced: 0, failed: 0, blocked: 0, pending: 0 };
    }

    this.syncInProgress = true;

    try {
      const items = await syncQueue.dequeue();
      if (items.length === 0) {
        return { synced: 0, failed: 0, blocked: 0, pending: 0 };
      }

      let synced = 0;
      let failed = 0;
      let blocked = 0;

      for (const item of items) {
        if (item.nextRetryAt && new Date(item.nextRetryAt).getTime() > Date.now()) {
          continue;
        }

        if (!this.online) break;

        try {
          await syncQueue.updateStatus(item.id, 'syncing');

          if (this.processor) {
            const result = await this.processor(item) as { remove?: boolean } | undefined;
            if (result?.remove === false) {
              continue;
            }
          }

          await syncQueue.remove(item.id);
          synced++;
        } catch (error) {
          failed++;
          const shouldRetry = defaultRetryPolicy.shouldRetry(item.retries + 1);
          const nextRetryAt = shouldRetry
            ? defaultRetryPolicy.getNextRetryAt(item.retries + 1)
            : null;

          await syncQueue.updateStatus(
            item.id,
            nextRetryAt ? 'failed' : 'blocked',
            error
          );

          if (!shouldRetry) blocked++;
        }
      }

      const remaining = await syncQueue.count();

      if (failed > 0 && this.online) {
        this.scheduleRetry();
      }

      return { synced, failed, blocked, pending: remaining };
    } finally {
      this.syncInProgress = false;
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      void this.triggerSync();
    }, defaultRetryPolicy.getDelayMs(1));
  }

  destroy(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.syncInProgress = false;
    this.processor = null;
  }
}

export const backgroundSync = new BackgroundSync();
