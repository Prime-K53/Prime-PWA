import Dexie, { type Table, type Collection, liveQuery, type Observable } from 'dexie';
import type { BaseEntity } from '../types';
import type { PaginationInput, PaginatedResult, BatchOperationResult, QueryOptions } from './types';

const nowIso = () => new Date().toISOString();

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
    let collection: Collection<T, string> = table as any;

    if (!options.includeDeleted) {
      collection = collection.filter((item) => !item.isDeleted) as any;
    }

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
    return table.get(id);
  }

  async findByIds(ids: string[]): Promise<T[]> {
    if (ids.length === 0) return [];
    const table = await this.getTable();
    return table.bulkGet(ids).then((results) => results.filter(Boolean) as T[]);
  }

  async findOne(selector: Partial<T>): Promise<T | undefined> {
    const table = await this.getTable();
    const results = await table.filter((item) => {
      for (const [key, value] of Object.entries(selector)) {
        if ((item as any)[key] !== value) return false;
      }
      return !item.isDeleted;
    }).limit(1).toArray();
    return results[0];
  }

  async count(selector?: Partial<T>): Promise<number> {
    const table = await this.getTable();
    if (selector) {
      return table.filter((item) => {
        for (const [key, value] of Object.entries(selector)) {
          if ((item as any)[key] !== value) return false;
        }
        return !item.isDeleted;
      }).count();
    }
    return table.filter((item) => !item.isDeleted).count();
  }

  async findPage(input: PaginationInput): Promise<PaginatedResult<T>> {
    const start = performance.now();
    const table = await this.getTable();
    const skip = (input.page - 1) * input.pageSize;

    let collection: Collection<T, string> = table as any;
    if (!input.selector?.isDeleted) {
      collection = collection.filter((item) => !item.isDeleted) as any;
    } else {
      collection = collection.filter((item) => {
        for (const [key, value] of Object.entries(input.selector || {})) {
          if ((item as any)[key] !== value) return false;
        }
        return true;
      }) as any;
    }

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
      const existing = await table.get(entity.id);
      const now = nowIso();
      const updated = {
        ...entity,
        updatedAt: now,
        createdAt: entity.createdAt || now,
        entityVersion: existing ? Math.max(existing.entityVersion + 1, entity.entityVersion || 1) : (entity.entityVersion || 1),
      };
      await table.put(updated);
      return updated;
    });
  }

  async bulkUpsert(entities: T[]): Promise<T[]> {
    if (entities.length === 0) return [];
    return this.withWriteLock(async (table) => {
      const now = nowIso();
      const normalized = entities.map((entity) => ({
        ...entity,
        updatedAt: now,
        createdAt: entity.createdAt || now,
        entityVersion: entity.entityVersion || 1,
      }));
      await table.bulkPut(normalized);
      return normalized;
    });
  }

  async patch(id: string, patch: Partial<T>): Promise<T | undefined> {
    return this.withWriteLock(async (table) => {
      const existing = await table.get(id);
      if (!existing) return undefined;
      const updated = {
        ...existing,
        ...patch,
        id: existing.id,
        updatedAt: nowIso(),
        entityVersion: existing.entityVersion + 1,
      };
      await table.put(updated);
      return updated;
    });
  }

  async softDelete(id: string): Promise<void> {
    return this.withWriteLock(async (table) => {
      const existing = await table.get(id);
      if (!existing) return;
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
      await table.delete(id);
    });
  }

  async bulkDelete(ids: string[]): Promise<BatchOperationResult> {
    return this.withWriteLock(async (table) => {
      const result: BatchOperationResult = { success: 0, failed: 0, errors: [] };
      for (const id of ids) {
        try {
          await table.delete(id);
          result.success++;
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
        result.success++;
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
