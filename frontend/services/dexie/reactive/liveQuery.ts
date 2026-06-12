import { liveQuery, type Observable } from 'dexie';
import type { BaseEntity } from '../types';
import type { QueryOptions, PaginatedResult } from '../repositories/types';
import { databaseManager } from '../DatabaseManager';

export interface LiveQueryResult<T> {
  data: T[];
  isLoading: boolean;
  error: Error | null;
}

export function createLiveQuery<T>(
  queryFn: () => Promise<T[]>
): Observable<T[]> {
  return liveQuery(queryFn);
}

export function createPaginatedLiveQuery<T extends BaseEntity>(
  queryFn: (page: number) => Promise<PaginatedResult<T>>
): (page: number) => Observable<PaginatedResult<T>> {
  return (page: number) => liveQuery(() => queryFn(page));
}

export function observeTable<T>(tableName: string): Observable<T[]> {
  return liveQuery(async () => {
    const db = await databaseManager.getDatabase();
    const table = (db as any)[tableName] as import('dexie').Table<T, string>;
    if (!table) return [];
    return table.filter((item: any) => !item.isDeleted).toArray();
  });
}

export function observeTableById<T>(tableName: string, id: string): Observable<T | undefined> {
  return liveQuery(async () => {
    const db = await databaseManager.getDatabase();
    const table = (db as any)[tableName] as import('dexie').Table<T, string>;
    if (!table) return undefined;
    return table.get(id);
  });
}
