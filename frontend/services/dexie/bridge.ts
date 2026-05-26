import { databaseManager } from './DatabaseManager';
import { getRepositories, type RepositoryRegistry } from './repositories';
import { startupOrchestrator } from './startup/StartupOrchestrator';
import { phaseManager } from './startup/PhaseManager';
import { runMigration } from './utils/migration';
import { TABLE_DEFINITIONS } from './schema-types';
import type { BaseEntity, SyncOperationStatus, CustomerEntity, SupplierEntity, ProductEntity, InvoiceEntity, WorkCenterEntity, ProductionResourceEntity, ExaminationPricingEntity, NotificationEntity, SettingEntity, AuditLogEntity, SyncOperationEntity } from './types';
import {
  denormalizeCustomer, denormalizeProduct, denormalizeInvoice, denormalizeExaminationBatch,
  normalizeLegacyCustomer, normalizeLegacyProduct, normalizeLegacyInvoice, normalizeLegacyExaminationBatch,
  normalizeLegacyWorkCenter, normalizeLegacyProductionResource, normalizeLegacyNotification,
  normalizeLegacyAuditLog, normalizeLegacySetting, normalizeLegacySyncOperation,
  parseSettingValue,
} from './normalizers';

export type BackedLegacyStoreName =
  | 'inventory' | 'customers' | 'suppliers' | 'invoices'
  | 'workCenters' | 'resources' | 'auditLogs' | 'examinationBatchNotifications';

const BACKED_STORES = new Set<BackedLegacyStoreName>([
  'inventory', 'customers', 'suppliers', 'invoices',
  'workCenters', 'resources', 'auditLogs', 'examinationBatchNotifications'
]);

export const isBackedStore = (storeName: string): storeName is BackedLegacyStoreName =>
  BACKED_STORES.has(storeName as BackedLegacyStoreName);

let ready = false;
let readyPromise: Promise<void> | null = null;

const ensureReady = async (): Promise<void> => {
  if (ready) return;
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    await databaseManager.initialize();
    await phaseManager.registerCoreTasks();
    await runMigration();
    ready = true;
  })();
  return readyPromise;
};

interface BridgeQueryOptions { limit?: number; skip?: number; timeoutMs?: number; includeDeleted?: boolean; }

const getAllForStore = async (storeName: BackedLegacyStoreName, opts?: BridgeQueryOptions): Promise<any[]> => {
  const repos = await getRepositories();
  switch (storeName) {
    case 'inventory': return (await repos.products.findAll()).map(denormalizeProduct);
    case 'customers': return (await repos.customers.findAll()).map(denormalizeCustomer);
    case 'suppliers': return (await repos.suppliers.findAll()).map((s) => ({ ...s }));
    case 'invoices': return (await repos.invoices.findAll()).map(denormalizeInvoice);
    case 'workCenters': return (await repos.workCenters.findAll()).map(denormalizeWorkCenter);
    case 'resources': return (await repos.productionResources.findAll()).map(denormalizeProductionResource);
    case 'auditLogs': return (await repos.auditLogs.findAll()).map(denormalizeAuditLog);
    case 'examinationBatchNotifications': return (await repos.notifications.findAll()).map(denormalizeNotification);
    default: return [];
  }
};

const denormalizeWorkCenter = (d: WorkCenterEntity) => ({ ...(d.legacySnapshot || {}), id: d.id, code: d.centerCode, name: d.name, status: d.status, description: d.description, location: d.location, hourlyRate: d.hourlyRate, capacityPerDay: d.capacityPerDay, createdAt: d.createdAt, updatedAt: d.updatedAt, deleted: d.isDeleted });
const denormalizeProductionResource = (d: ProductionResourceEntity) => ({ ...(d.legacySnapshot || {}), id: d.id, code: d.resourceCode, name: d.name, workCenterId: d.workCenterId, status: d.status, resourceType: d.resourceType, description: d.description, capacityHoursPerDay: d.capacityHoursPerDay, hourlyCost: d.hourlyCost, createdAt: d.createdAt, updatedAt: d.updatedAt, deleted: d.isDeleted });
const denormalizeNotification = (d: NotificationEntity) => ({ ...(d.legacySnapshot || {}), id: d.id, notificationType: d.notificationType, category: d.category, userId: d.userId, title: d.title, message: d.message, priority: d.priority, entityType: d.entityType, entityId: d.entityId, isRead: d.isRead, deliveredAt: d.deliveredAt, readAt: d.readAt, createdAt: d.createdAt, updatedAt: d.updatedAt, deleted: d.isDeleted });
const denormalizeAuditLog = (d: AuditLogEntity) => ({ ...(d.legacySnapshot || {}), id: d.id, timestamp: d.timestamp, correlationId: d.correlationId, actorId: d.actorId, actorRole: d.actorRole, action: d.action, entityType: d.entityType, entityId: d.entityId, reason: d.reason, ipAddress: d.ipAddress, userAgent: d.userAgent, beforeJson: d.beforeJson, afterJson: d.afterJson, deltaJson: d.deltaJson, integrityHash: d.integrityHash, createdAt: d.createdAt, updatedAt: d.updatedAt, deleted: d.isDeleted });

export const dexieBridge = {
  async ensureReady() { await ensureReady(); },

  async getAll(storeName: BackedLegacyStoreName, opts?: BridgeQueryOptions) {
    if (!ready) await ensureReady();
    return getAllForStore(storeName, opts);
  },

  async get(storeName: BackedLegacyStoreName, id: string) {
    if (!ready) await ensureReady();
    const repos = await getRepositories();
    switch (storeName) {
      case 'inventory': { const r = await repos.products.findById(id); return r ? denormalizeProduct(r) : undefined; }
      case 'customers': { const r = await repos.customers.findById(id); return r ? denormalizeCustomer(r) : undefined; }
      default: return undefined;
    }
  },

  async put(storeName: BackedLegacyStoreName, value: unknown) {
    if (!ready) await ensureReady();
    const repos = await getRepositories();
    switch (storeName) {
      case 'inventory': await repos.products.upsert(normalizeLegacyProduct(value, 'user-action')); return String((value as any)?.id || '');
      case 'customers': await repos.customers.upsert(normalizeLegacyCustomer(value, 'user-action')); return String((value as any)?.id || '');
      default: return String((value as any)?.id || '');
    }
  },

  async delete(storeName: BackedLegacyStoreName, id: string) {
    if (!ready) await ensureReady();
    const repos = await getRepositories();
    switch (storeName) {
      case 'inventory': return repos.products.softDelete(id);
      case 'customers': return repos.customers.softDelete(id);
      default: return;
    }
  },

  async getSetting<T>(key: string): Promise<T | undefined> {
    if (!ready) await ensureReady();
    const repos = await getRepositories();
    const doc = await repos.settings.findById(key);
    return parseSettingValue<T>(doc);
  },

  async saveSetting<T>(key: string, value: T) {
    if (!ready) await ensureReady();
    const repos = await getRepositories();
    await repos.settings.upsert(normalizeLegacySetting(key, value, 'user-action'));
  },

  async getOfflineBatches() {
    if (!ready) await ensureReady();
    const repos = await getRepositories();
    const rows = await repos.examinationPricing.findAll();
    return rows.map(denormalizeExaminationBatch);
  },

  async saveOfflineBatch(value: unknown) {
    if (!ready) await ensureReady();
    const repos = await getRepositories();
    const doc = normalizeLegacyExaminationBatch(value, 'user-action');
    await repos.examinationPricing.upsert(doc);
    return denormalizeExaminationBatch(doc);
  },

  async deleteOfflineBatch(id: string) {
    if (!ready) await ensureReady();
    const repos = await getRepositories();
    await repos.examinationPricing.softDelete(id);
  },

  async getSyncQueue(statuses?: SyncOperationStatus[]) {
    if (!ready) await ensureReady();
    const repos = await getRepositories();
    const selector: any = {};
    if (statuses?.length) selector.queueStatus = statuses;
    const rows = await syncOpsFindAll(selector);
    return rows;
  },

  async saveSyncQueueItem(value: unknown) {
    if (!ready) await ensureReady();
    const repos = await getRepositories();
    const doc = normalizeLegacySyncOperation(value, 'user-action');
    await repos.syncOperations.upsert(doc);
    return doc;
  },

  async deleteSyncQueueItem(id: string) {
    if (!ready) await ensureReady();
    const repos = await getRepositories();
    await repos.syncOperations.softDelete(id);
  },

  async getOfflineMetaValue<T>(key: string): Promise<T | undefined> {
    if (!ready) await ensureReady();
    const repos = await getRepositories();
    const doc = await repos.settings.findById(`offline:${key}`);
    return parseSettingValue<T>(doc);
  },

  async setOfflineMetaValue<T>(key: string, value: T) {
    if (!ready) await ensureReady();
    const repos = await getRepositories();
    await repos.settings.upsert(normalizeLegacySetting(`offline:${key}`, value, 'user-action', 'offline'));
  },

  async checkHealth() {
    return { healthy: databaseManager.isHealthy(), tables: Object.keys(TABLE_DEFINITIONS).length };
  },
};

async function syncOpsFindAll(selector: any) {
  const repos = await getRepositories();
  const all = await repos.syncOperations.findAll();
  if (selector.queueStatus) {
    const statuses = selector.queueStatus as string[];
    return all.filter((op) => statuses.includes(op.queueStatus));
  }
  return all;
}
