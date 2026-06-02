import Dexie, { type Table, type Collection, liveQuery, type Observable } from 'dexie';
import type { BaseEntity } from '../types';
import type { PaginationInput, PaginatedResult, BatchOperationResult, QueryOptions } from './types';

const nowIso = () => new Date().toISOString();

const getCompanyId = (): string | null => {
  try {
    const raw = localStorage.getItem('nexus_company_config');
    if (!raw) return null;
    return JSON.parse(raw).companyId || null;
  } catch {
    return null;
  }
};

const isCurrentCompany = (item: any, companyId: string | null): boolean => {
  if (!companyId) return false;
  return (item as any)?._companyId === companyId;
};

export abstract class BaseRepository<T extends BaseEntity> {
  protected abstract tableName: string;
  private tableCache: Table<T, string> | null = null;
  private static writeLocks = new Map<string, Promise<void>>();
  protected static readonly MAX_CACHE_TTL_MS = 30000;

  protected async getTable(): Promise<Table<T, string>> {
    if (this.tableCache) return this.tableCache;
    const { DatabaseManagerFactory } = await import('../DatabaseManagerFactory');
    this.tableCache = await DatabaseManagerFactory.getTable<T>(this.tableName);
    return this.tableCache;
  }

  protected async withWriteLock<R>(fn: (table: Table<T, string>) => Promise<R>): Promise<R> {
    const key = this.tableName;
    const previous = BaseRepository.writeLocks.get(key) || Promise.resolve();
    let release: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    BaseRepository.writeLocks.set(key, previous.catch(() => undefined).then(() => current));
    await previous.catch(() => undefined);
    try {
      return await fn(await this.getTable());
    } finally {
      release!();
    }
  }

  async findAll(options: QueryOptions<T> = {}): Promise<T[]> {
    const table = await this.getTable();
    const companyId = getCompanyId();
    let collection: Collection<T, string> = table as any;

    collection = collection.filter((item) => {
      if (!isCurrentCompany(item, companyId)) return false;
      if (!options.includeDeleted && (item as any).isDeleted) return false;
      return true;
    }) as any;

    if (options.sort) {
      collection = collection.sortBy(options.sort.field as any) as any;
      if (options.sort.direction === 'desc') {
        collection = collection.reverse() as any;
      }
    }

    if (typeof options.offset === 'number') {
      collection = collection.offset(options.offset) as any;
    }

    if (typeof options.limit === 'number') {
      collection = collection.limit(options.limit) as any;
    }

    return collection.toArray();
  }

  async findById(id: string): Promise<T | undefined> {
    const table = await this.getTable();
    const companyId = getCompanyId();
    const record = await table.get(id);
    if (!record) return undefined;
    if (!isCurrentCompany(record, companyId)) return undefined;
    return record;
  }

  async findByIds(ids: string[]): Promise<T[]> {
    if (ids.length === 0) return [];
    const table = await this.getTable();
    const companyId = getCompanyId();
    const results = await table.bulkGet(ids).then((results) => results.filter(Boolean) as T[]);
    return results.filter((item) => isCurrentCompany(item, companyId));
  }

  async findOne(selector: Partial<T>): Promise<T | undefined> {
    const table = await this.getTable();
    const companyId = getCompanyId();
    const results = await table.filter((item) => {
      if (!isCurrentCompany(item, companyId)) return false;
      if ((item as any).isDeleted) return false;
      for (const [key, value] of Object.entries(selector)) {
        if ((item as any)[key] !== value) return false;
      }
      return true;
    }).limit(1).toArray();
    return results[0];
  }

  async count(selector?: Partial<T>): Promise<number> {
    const table = await this.getTable();
    const companyId = getCompanyId();
    if (selector) {
      return table.filter((item) => {
        if (!isCurrentCompany(item, companyId)) return false;
        if ((item as any).isDeleted) return false;
        for (const [key, value] of Object.entries(selector)) {
          if ((item as any)[key] !== value) return false;
        }
        return true;
      }).count();
    }
    return table.filter((item) => {
      if (!isCurrentCompany(item, companyId)) return false;
      return !(item as any).isDeleted;
    }).count();
  }

  async findPage(input: PaginationInput): Promise<PaginatedResult<T>> {
    const start = performance.now();
    const table = await this.getTable();
    const companyId = getCompanyId();
    const skip = (input.page - 1) * input.pageSize;

    let collection: Collection<T, string> = table as any;
    collection = collection.filter((item) => {
      if (!isCurrentCompany(item, companyId)) return false;
      if (!input.selector?.isDeleted && (item as any).isDeleted) return false;
      if (input.selector) {
        for (const [key, value] of Object.entries(input.selector)) {
          if ((item as any)[key] !== value) return false;
        }
      }
      return true;
    }) as any;

    if (input.sort?.length) {
      const sortField = String(input.sort[0].field) as keyof T;
      const sortDir = input.sort[0].direction;
      collection = (await (collection as any).sortBy(sortField)) as any;
      if (sortDir === 'desc') collection = collection.reverse() as any;
    }

    const total = await collection.clone().count();
    const rows = await collection.offset(skip).limit(input.pageSize).toArray();
    const totalPages = Math.max(1, Math.ceil(total / input.pageSize));
    const durationMs = performance.now() - start;

    return { rows, total, page: input.page, pageSize: input.pageSize, totalPages, hasMore: input.page < totalPages, durationMs };
  }

  async upsert(entity: T): Promise<T> {
    return this.withWriteLock(async (table) => {
      const companyId = getCompanyId();
      const existing = await table.get(entity.id);
      const now = nowIso();
      const updated = {
        ...entity,
        updatedAt: now,
        createdAt: entity.createdAt || now,
        entityVersion: existing ? Math.max(existing.entityVersion + 1, entity.entityVersion || 1) : (entity.entityVersion || 1),
      } as any;
      if (companyId) {
        updated._companyId = companyId;
      }
      await table.put(updated);
      return updated as T;
    });
  }

  async bulkUpsert(entities: T[]): Promise<T[]> {
    if (entities.length === 0) return [];
    return this.withWriteLock(async (table) => {
      const companyId = getCompanyId();
      const now = nowIso();
      const normalized = entities.map((entity) => {
        const e = {
          ...entity,
          updatedAt: now,
          createdAt: entity.createdAt || now,
          entityVersion: entity.entityVersion || 1,
        } as any;
        if (companyId) {
          e._companyId = companyId;
        }
        return e;
      });
      await table.bulkPut(normalized);
      return normalized as T[];
    });
  }

  async patch(id: string, patch: Partial<T>): Promise<T | undefined> {
    return this.withWriteLock(async (table) => {
      const companyId = getCompanyId();
      const existing = await table.get(id);
      if (!existing) return undefined;
      if (!isCurrentCompany(existing, companyId)) return undefined;
      const updated = {
        ...existing,
        ...patch,
        id: existing.id,
        updatedAt: nowIso(),
        entityVersion: existing.entityVersion + 1,
      } as any;
      if (companyId) {
        updated._companyId = companyId;
      }
      await table.put(updated);
      return updated as T;
    });
  }

  async softDelete(id: string): Promise<void> {
    return this.withWriteLock(async (table) => {
      const companyId = getCompanyId();
      const existing = await table.get(id);
      if (!existing) return;
      if (!isCurrentCompany(existing, companyId)) return;
      await table.put({
        ...existing,
        isDeleted: true,
        deletedAt: nowIso(),
        updatedAt: nowIso(),
        entityVersion: existing.entityVersion + 1,
      } as T);
    });
  }

  async hardDelete(id: string): Promise<void> {
    return this.withWriteLock(async (table) => {
      const companyId = getCompanyId();
      const existing = await table.get(id);
      if (!existing) return;
      if (!isCurrentCompany(existing, companyId)) return;
      await table.delete(id);
    });
  }

  async bulkDelete(ids: string[]): Promise<BatchOperationResult> {
    return this.withWriteLock(async (table) => {
      const companyId = getCompanyId();
      const result: BatchOperationResult = { success: 0, failed: 0, errors: [] };
      for (const id of ids) {
        try {
          const existing = await table.get(id);
          if (existing && isCurrentCompany(existing, companyId)) {
            await table.delete(id);
            result.success++;
          } else {
            result.failed++;
            result.errors.push({ id, error: 'Not found or wrong company' });
          }
        } catch (error) {
          result.failed++;
          result.errors.push({ id, error: String(error) });
        }
      }
      return result;
    });
  }

  async bulkSoftDelete(ids: string[]): Promise<BatchOperationResult> {
    const result: BatchOperationResult = { success: 0, failed: 0, errors: [] };
    for (const id of ids) {
      try {
        await this.softDelete(id);
        if (await this.findById(id)) result.failed++;
        else result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push({ id, error: String(error) });
      }
    }
    return result;
  }

  observe(options: QueryOptions<T> = {}): Observable<T[]> {
    return liveQuery(async () => this.findAll(options));
  }

  observeById(id: string): Observable<T | undefined> {
    return liveQuery(async () => this.findById(id));
  }
}
