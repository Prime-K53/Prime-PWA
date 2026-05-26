import Dexie, { type Table } from 'dexie';
import { ALL_TABLES, buildDexieSchemaString } from './schema-types';
import type { BaseEntity } from './types';

export const DB_NAME = 'PrimeERP_Enterprise_v2';
export const DB_SCHEMA_VERSION = 2;

export interface EnterpriseDatabaseTables {
  settings: Table<BaseEntity & Record<string, unknown>, string>;
  users: Table<BaseEntity & Record<string, unknown>, string>;
  notifications: Table<BaseEntity & Record<string, unknown>, string>;
  auditLogs: Table<BaseEntity & Record<string, unknown>, string>;
  syncOperations: Table<BaseEntity & Record<string, unknown>, string>;
  syncConflicts: Table<BaseEntity & Record<string, unknown>, string>;
  syncLogs: Table<BaseEntity & Record<string, unknown>, string>;
  syncQueue: Table<BaseEntity & Record<string, unknown>, string>;
  syncSnapshots: Table<BaseEntity & Record<string, unknown>, string>;
  customers: Table<BaseEntity & Record<string, unknown>, string>;
  suppliers: Table<BaseEntity & Record<string, unknown>, string>;
  invoices: Table<BaseEntity & Record<string, unknown>, string>;
  payments: Table<BaseEntity & Record<string, unknown>, string>;
  expenses: Table<BaseEntity & Record<string, unknown>, string>;
  products: Table<BaseEntity & Record<string, unknown>, string>;
  stockMovements: Table<BaseEntity & Record<string, unknown>, string>;
  warehouses: Table<BaseEntity & Record<string, unknown>, string>;
  inventoryBalances: Table<BaseEntity & Record<string, unknown>, string>;
  workCenters: Table<BaseEntity & Record<string, unknown>, string>;
  productionResources: Table<BaseEntity & Record<string, unknown>, string>;
  manufacturingJobs: Table<BaseEntity & Record<string, unknown>, string>;
  examinationPricing: Table<BaseEntity & Record<string, unknown>, string>;
  examinationResults: Table<BaseEntity & Record<string, unknown>, string>;
  analyticsCache: Table<BaseEntity & Record<string, unknown>, string>;
  kpiCache: Table<BaseEntity & Record<string, unknown>, string>;
  dashboardSnapshots: Table<BaseEntity & Record<string, unknown>, string>;
}

export class EnterpriseDexieDatabase extends Dexie {
  declare settings: Table<BaseEntity & Record<string, unknown>, string>;
  declare users: Table<BaseEntity & Record<string, unknown>, string>;
  declare notifications: Table<BaseEntity & Record<string, unknown>, string>;
  declare auditLogs: Table<BaseEntity & Record<string, unknown>, string>;
  declare syncOperations: Table<BaseEntity & Record<string, unknown>, string>;
  declare syncConflicts: Table<BaseEntity & Record<string, unknown>, string>;
  declare syncLogs: Table<BaseEntity & Record<string, unknown>, string>;
  declare syncQueue: Table<BaseEntity & Record<string, unknown>, string>;
  declare syncSnapshots: Table<BaseEntity & Record<string, unknown>, string>;
  declare customers: Table<BaseEntity & Record<string, unknown>, string>;
  declare suppliers: Table<BaseEntity & Record<string, unknown>, string>;
  declare invoices: Table<BaseEntity & Record<string, unknown>, string>;
  declare payments: Table<BaseEntity & Record<string, unknown>, string>;
  declare expenses: Table<BaseEntity & Record<string, unknown>, string>;
  declare products: Table<BaseEntity & Record<string, unknown>, string>;
  declare stockMovements: Table<BaseEntity & Record<string, unknown>, string>;
  declare warehouses: Table<BaseEntity & Record<string, unknown>, string>;
  declare inventoryBalances: Table<BaseEntity & Record<string, unknown>, string>;
  declare workCenters: Table<BaseEntity & Record<string, unknown>, string>;
  declare productionResources: Table<BaseEntity & Record<string, unknown>, string>;
  declare manufacturingJobs: Table<BaseEntity & Record<string, unknown>, string>;
  declare examinationPricing: Table<BaseEntity & Record<string, unknown>, string>;
  declare examinationResults: Table<BaseEntity & Record<string, unknown>, string>;
  declare analyticsCache: Table<BaseEntity & Record<string, unknown>, string>;
  declare kpiCache: Table<BaseEntity & Record<string, unknown>, string>;
  declare dashboardSnapshots: Table<BaseEntity & Record<string, unknown>, string>;

  constructor() {
    super(DB_NAME);
    const schemaString = buildDexieSchemaString(ALL_TABLES);
    this.version(DB_SCHEMA_VERSION).stores({
      settings: 'id, settingKey, category, updatedAt, scope, *tags',
      users: 'id, username, email, role, status, *tags',
      notifications: 'id, userId, isRead, category, updatedAt, priority, entityId, *tags',
      auditLogs: 'id, timestamp, entityType, actorId, correlationId, *tags',
      syncOperations: 'id, queueStatus, updatedAt, entityType, entityId, nextRetryAt, *tags',
      syncConflicts: 'id, entityType, entityId, status, createdAt, *tags',
      syncLogs: 'id, timestamp, entityType, status, *tags',
      syncQueue: 'id, status, priority, entityType, nextRetryAt, *tags',
      syncSnapshots: 'id, entityType, entityId, snapshotAt, *tags',
      customers: 'id, customerCode, name, status, updatedAt, segment, *tags',
      suppliers: 'id, supplierCode, name, status, updatedAt, *tags',
      invoices: 'id, invoiceNumber, customerId, issuedAt, status, originModule, *tags',
      payments: 'id, paymentNumber, invoiceId, customerId, status, processedAt, *tags',
      expenses: 'id, expenseNumber, supplierId, category, status, incurredAt, *tags',
      products: 'id, sku, barcode, productType, updatedAt, status, categoryId, *tags',
      stockMovements: 'id, productId, warehouseId, type, movedAt, reference, *tags',
      warehouses: 'id, warehouseCode, name, status, updatedAt, *tags',
      inventoryBalances: 'id, productId, warehouseId, updatedAt, status, *tags',
      workCenters: 'id, centerCode, name, status, updatedAt, *tags',
      productionResources: 'id, resourceCode, workCenterId, status, updatedAt, *tags',
      manufacturingJobs: 'id, jobNumber, status, scheduledStart, module, updatedAt, workCenterId, *tags',
      examinationPricing: 'id, batchNumber, schoolId, updatedAt, customerId, status, *tags',
      examinationResults: 'id, batchId, schoolId, status, updatedAt, *tags',
      analyticsCache: 'id, cacheKey, category, updatedAt, *tags',
      kpiCache: 'id, kpiKey, period, updatedAt, *tags',
      dashboardSnapshots: 'id, snapshotKey, generatedAt, *tags',
    });
  }
}

export type EnterpriseTable = EnterpriseDexieDatabase[keyof EnterpriseDexieDatabase];

export class DatabaseConnection {
  private db: EnterpriseDexieDatabase | null = null;
  private openPromise: Promise<EnterpriseDexieDatabase> | null = null;
  private _isOpen = false;
  private _version = 0;

  get isOpen(): boolean { return this._isOpen; }
  get version(): number { return this._version; }

  async open(): Promise<EnterpriseDexieDatabase> {
    if (this.db && this._isOpen) return this.db;
    if (this.openPromise) return this.openPromise;

    this.openPromise = (async () => {
      const database = new EnterpriseDexieDatabase();
      await database.open();
      this.db = database;
      this._isOpen = true;
      this._version = DB_SCHEMA_VERSION;
      return database;
    })();

    return this.openPromise;
  }

  async getDb(): Promise<EnterpriseDexieDatabase> {
    return this.open();
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this._isOpen = false;
      this.openPromise = null;
    }
  }

  async reset(): Promise<void> {
    await this.close();
    await Dexie.delete(DB_NAME);
  }

  isHealthy(): boolean {
    return this.db !== null && this._isOpen && this.db.isOpen();
  }
}

export class DatabaseManager {
  private static instance: DatabaseManager;
  private connection: DatabaseConnection;
  private initializationPromise: Promise<EnterpriseDexieDatabase> | null = null;
  private _ready = false;

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  private constructor() {
    this.connection = new DatabaseConnection();
  }

  get ready(): boolean { return this._ready; }
  get db(): DatabaseConnection { return this.connection; }

  async initialize(): Promise<EnterpriseDexieDatabase> {
    if (this._ready && this.connection.isOpen) {
      return this.connection.getDb();
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      const database = await this.connection.open();
      this._ready = true;
      return database;
    })();

    return this.initializationPromise;
  }

  async getDatabase(): Promise<EnterpriseDexieDatabase> {
    return this.initialize();
  }

  getTable<T = BaseEntity & Record<string, unknown>>(tableName: string): Table<T, string> | null {
    if (!this.connection.isOpen || !this.connection) return null;
    const db = this.db as unknown as { [key: string]: Table<T, string> };
    return db[tableName] || null;
  }

  async close(): Promise<void> {
    await this.connection.close();
    this._ready = false;
    this.initializationPromise = null;
  }

  async reset(): Promise<void> {
    await this.connection.reset();
    this._ready = false;
    this.initializationPromise = null;
  }

  isHealthy(): boolean {
    return this.connection.isHealthy();
  }
}

export const databaseManager = DatabaseManager.getInstance();
