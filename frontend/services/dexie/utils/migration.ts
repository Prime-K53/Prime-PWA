import { databaseManager } from '../DatabaseManager';
import { openDB } from 'idb';
import type { BaseEntity } from '../types';

const LEGACY_DATABASES = [
  { name: 'PrimeERP_Final_v3_Clean', stores: ['customers', 'suppliers', 'inventory', 'invoices', 'examinationBatchNotifications', 'auditLogs'] },
  { name: 'PrimeERP_Production_v1', stores: ['workCenters', 'resources', 'batches', 'workOrders', 'jobTickets'] },
  { name: 'PrimeERP_OfflineFirst', stores: ['batches', 'syncQueue', 'meta'] },
];

const MIGRATION_STATE_KEY = 'system:legacy-migration-complete';

const nowIso = () => new Date().toISOString();

interface MigrationSummary {
  collections: Record<string, number>;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed';
  warnings: string[];
}

async function safeGetAll(dbName: string, storeName: string): Promise<any[]> {
  try {
    const db = await openDB(dbName);
    if (!db.objectStoreNames.contains(storeName)) {
      db.close();
      return [];
    }
    const rows = await db.getAll(storeName);
    db.close();
    return rows;
  } catch {
    return [];
  }
}

export async function runMigration(): Promise<MigrationSummary> {
  const db = await databaseManager.getDatabase();
  const existing = await db.settings.get(MIGRATION_STATE_KEY);
  if (existing && (existing as any)?.value?.status === 'completed') {
    return (existing as any).value as MigrationSummary;
  }

  const summary: MigrationSummary = {
    collections: {},
    startedAt: nowIso(),
    status: 'running',
    warnings: [],
  };

  await db.settings.put({ id: MIGRATION_STATE_KEY, settingKey: MIGRATION_STATE_KEY, value: summary, isDeleted: false } as any);

  try {
    for (const legacyDb of LEGACY_DATABASES) {
      for (const storeName of legacyDb.stores) {
        const rows = await safeGetAll(legacyDb.name, storeName);
        if (rows.length === 0) continue;

        const targetTable = (db as any)[storeName] as import('dexie').Table<any, string> | undefined;
        if (!targetTable) {
          summary.warnings.push(`Table '${storeName}' not found in enterprise database`);
          continue;
        }

        const normalized = rows.map((row) => ({
          ...row,
          entityVersion: row.entityVersion || 1,
          createdAt: row.createdAt || row.created_at || nowIso(),
          updatedAt: row.updatedAt || row.updated_at || nowIso(),
          isDeleted: Boolean(row.deleted || row.isDeleted),
          source: 'legacy-idb',
          sync: { status: 'pending', retryCount: 0 },
          tags: [],
        }));

        await targetTable.bulkPut(normalized);
        summary.collections[storeName] = (summary.collections[storeName] || 0) + rows.length;
      }
    }

    summary.status = 'completed';
    summary.completedAt = nowIso();
    await db.settings.put({ id: MIGRATION_STATE_KEY, settingKey: MIGRATION_STATE_KEY, value: summary, isDeleted: false } as any);
  } catch (error) {
    summary.status = 'failed';
    summary.warnings.push(error instanceof Error ? error.message : String(error));
  }

  return summary;
}
