import { syncQueue } from './SyncQueue';
import { backgroundSync } from './BackgroundSync';
import { conflictResolver } from './ConflictResolver';
import { defaultRetryPolicy } from './RetryPolicy';
import { databaseManager } from '../DatabaseManager';
import { repositories } from '../repositories';

export interface SyncEngineConfig {
  autoSync: boolean;
  syncIntervalMs: number;
  maxBatchSize: number;
}

const DEFAULT_CONFIG: SyncEngineConfig = {
  autoSync: true,
  syncIntervalMs: 30000,
  maxBatchSize: 50,
};

export class SyncEngine {
  private config: SyncEngineConfig;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private _isRunning = false;

  constructor(config: Partial<SyncEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get isRunning(): boolean { return this._isRunning; }

  async start(): Promise<void> {
    if (this._isRunning) return;
    this._isRunning = true;

    const handleOnline = () => backgroundSync.setOnline(true);
    const handleOffline = () => backgroundSync.setOnline(false);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    if (this.config.autoSync) {
      this.intervalTimer = setInterval(() => {
        if (navigator.onLine !== false) {
          void backgroundSync.triggerSync();
        }
      }, this.config.syncIntervalMs);
    }
  }

  async stop(): Promise<void> {
    this._isRunning = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    backgroundSync.destroy();
  }

  async syncNow(): Promise<import('./BackgroundSync').SyncSummary> {
    return backgroundSync.triggerSync();
  }

  getQueue() {
    return syncQueue;
  }

  getConflictResolver() {
    return conflictResolver;
  }

  getRetryPolicy() {
    return defaultRetryPolicy;
  }

  async getMetrics(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    isRunning: boolean;
    isOnline: boolean;
  }> {
    const items = await syncQueue.dequeue();
    const byStatus: Record<string, number> = {};
    for (const item of items) {
      byStatus[item.status] = (byStatus[item.status] || 0) + 1;
    }
    return {
      total: items.length,
      byStatus,
      isRunning: this._isRunning,
      isOnline: navigator.onLine !== false,
    };
  }
}

export const syncEngine = new SyncEngine();
