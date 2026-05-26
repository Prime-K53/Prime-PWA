import { DatabaseManagerFactory } from '../DatabaseManagerFactory';
import type { BaseEntity } from '../types';

export interface AnalyticsCacheEntry extends BaseEntity {
  cacheKey: string;
  category: string;
  payload: string;
  ttlMs: number;
  expiresAt: string;
  generatedAt: string;
}

export interface KpiCacheEntry extends BaseEntity {
  kpiKey: string;
  period: string;
  value: number;
  label: string;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  changePercent: number;
  generatedAt: string;
}

export interface DashboardSnapshotEntry extends BaseEntity {
  snapshotKey: string;
  payload: string;
  generatedAt: string;
  expiresAt: string;
}

export class AnalyticsCache {
  async getOrCompute<T>(
    cacheKey: string,
    category: string,
    ttlMs: number,
    computeFn: () => Promise<T>
  ): Promise<{ data: T; fromCache: boolean }> {
    const table = await DatabaseManagerFactory.getTable<AnalyticsCacheEntry>('analyticsCache');
    const existing = await table
      .filter((e) => e.cacheKey === cacheKey && !e.isDeleted && new Date(e.expiresAt).getTime() > Date.now())
      .first();

    if (existing) {
      return { data: JSON.parse(existing.payload) as T, fromCache: true };
    }

    const data = await computeFn();
    const now = new Date().toISOString();
    const entry: AnalyticsCacheEntry = {
      id: cacheKey,
      cacheKey,
      category,
      payload: JSON.stringify(data),
      ttlMs,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      generatedAt: now,
      entityVersion: 1,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      source: 'user-action',
      sync: { status: 'pending', retryCount: 0 },
      tags: [category],
    };

    await table.put(entry);
    return { data, fromCache: false };
  }

  async invalidateCache(pattern?: RegExp): Promise<void> {
    const table = await DatabaseManagerFactory.getTable<AnalyticsCacheEntry>('analyticsCache');
    const entries = await table.toArray();
    for (const entry of entries) {
      if (!pattern || pattern.test(entry.cacheKey)) {
        await table.put({ ...entry, isDeleted: true, updatedAt: new Date().toISOString() });
      }
    }
  }

  async clearAll(): Promise<void> {
    const table = await DatabaseManagerFactory.getTable<AnalyticsCacheEntry>('analyticsCache');
    await table.clear();
  }

  async storeKpi(kpiKey: string, period: string, value: number, label: string, unit: string, previousValue?: number): Promise<void> {
    const table = await DatabaseManagerFactory.getTable<KpiCacheEntry>('kpiCache');
    const now = new Date().toISOString();
    const changePercent = previousValue ? ((value - previousValue) / previousValue) * 100 : 0;
    const trend: 'up' | 'down' | 'stable' = changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'stable';

    const entry: KpiCacheEntry = {
      id: `${kpiKey}:${period}`,
      kpiKey,
      period,
      value,
      label,
      unit,
      trend,
      changePercent,
      generatedAt: now,
      entityVersion: 1,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      source: 'migration',
      sync: { status: 'synced', retryCount: 0 },
      tags: ['kpi', kpiKey],
    };

    await table.put(entry);
  }

  async getKpi(kpiKey: string, period: string): Promise<KpiCacheEntry | undefined> {
    const table = await DatabaseManagerFactory.getTable<KpiCacheEntry>('kpiCache');
    return table.get(`${kpiKey}:${period}`);
  }

  async getKpisByPeriod(period: string): Promise<KpiCacheEntry[]> {
    const table = await DatabaseManagerFactory.getTable<KpiCacheEntry>('kpiCache');
    return table.filter((e) => e.period === period && !e.isDeleted).toArray();
  }

  async storeDashboardSnapshot(snapshotKey: string, payload: unknown, ttlMs: number = 60000): Promise<void> {
    const table = await DatabaseManagerFactory.getTable<DashboardSnapshotEntry>('dashboardSnapshots');
    const now = new Date().toISOString();
    const entry: DashboardSnapshotEntry = {
      id: snapshotKey,
      snapshotKey,
      payload: JSON.stringify(payload),
      generatedAt: now,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      entityVersion: 1,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      source: 'migration',
      sync: { status: 'synced', retryCount: 0 },
      tags: ['snapshot', snapshotKey],
    };
    await table.put(entry);
  }

  async getDashboardSnapshot<T>(snapshotKey: string): Promise<T | undefined> {
    const table = await DatabaseManagerFactory.getTable<DashboardSnapshotEntry>('dashboardSnapshots');
    const entry = await table
      .filter((e) => e.snapshotKey === snapshotKey && !e.isDeleted && new Date(e.expiresAt).getTime() > Date.now())
      .first();
    if (!entry) return undefined;
    try { return JSON.parse(entry.payload) as T; } catch { return undefined; }
  }
}

export const analyticsCache = new AnalyticsCache();
