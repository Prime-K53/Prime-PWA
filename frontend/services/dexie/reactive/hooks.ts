import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Observable } from 'dexie';
import { liveQuery } from 'dexie';
import type { BaseEntity } from '../types';
import type { PaginatedResult, QueryOptions } from '../repositories/types';
import { QueryCache } from './cache';
import type { BaseRepository } from '../repositories/BaseRepository';

interface UseLiveQueryResult<T> {
  data: T[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

interface UseLiveObjectResult<T> {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
}

const nowIso = () => new Date().toISOString();

export function useLiveQuery<T>(
  queryFn: () => Promise<T[]>,
  deps: unknown[] = [],
  options?: { cacheKey?: string; cacheTtlMs?: number }
): UseLiveQueryResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const refreshRef = useRef(0);
  const isMountedRef = useRef(true);

  const refresh = useCallback(() => {
    refreshRef.current++;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    setIsLoading(true);
    setError(null);

    const observable = liveQuery(queryFn);

    const subscription = observable.subscribe({
      next: (result) => {
        if (isMountedRef.current) {
          setData(result as T[]);
          setIsLoading(false);
          if (options?.cacheKey) {
            QueryCache.set(options.cacheKey, result, options.cacheTtlMs);
          }
        }
      },
      error: (err) => {
        if (isMountedRef.current) {
          setError(err);
          setIsLoading(false);
        }
      },
    });

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [refreshRef.current, ...deps]);

  return { data, isLoading, error, refresh };
}

export function useLiveObject<T>(
  queryFn: () => Promise<T | undefined>,
  deps: unknown[] = []
): UseLiveObjectResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    setIsLoading(true);
    setError(null);

    const observable = liveQuery(queryFn);

    const subscription = observable.subscribe({
      next: (result) => {
        if (isMountedRef.current) {
          setData(result as T | undefined);
          setIsLoading(false);
        }
      },
      error: (err) => {
        if (isMountedRef.current) {
          setError(err);
          setIsLoading(false);
        }
      },
    });

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, deps);

  return { data, isLoading, error };
}

export function useRepositoryQuery<T extends BaseEntity>(
  repository: BaseRepository<T>,
  options: QueryOptions<T> = {},
  deps: unknown[] = []
): UseLiveQueryResult<T> {
  return useLiveQuery(
    () => repository.findAll(options),
    [JSON.stringify(options), ...deps],
    { cacheKey: `${repository['tableName']}:${JSON.stringify(options)}` }
  );
}

export function useRepositoryObject<T extends BaseEntity>(
  repository: BaseRepository<T>,
  id: string | undefined
): UseLiveObjectResult<T> {
  return useLiveObject(
    () => id ? repository.findById(id) : Promise.resolve(undefined),
    [id]
  );
}

export function usePaginatedQuery<T extends BaseEntity>(
  repository: BaseRepository<T>,
  page: number,
  pageSize: number,
  selector?: Record<string, unknown>
): { data: PaginatedResult<T> | null; isLoading: boolean; error: Error | null; refresh: () => void } {
  const [data, setData] = useState<PaginatedResult<T> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const refreshRef = useRef(0);
  const isMountedRef = useRef(true);

  const refresh = useCallback(() => { refreshRef.current++; }, []);

  useEffect(() => {
    isMountedRef.current = true;
    setIsLoading(true);
    setError(null);

    const observable = liveQuery(() =>
      repository.findPage({ page, pageSize, selector })
    );

    const subscription = observable.subscribe({
      next: (result) => {
        if (isMountedRef.current) {
          setData(result as PaginatedResult<T>);
          setIsLoading(false);
        }
      },
      error: (err: Error) => {
        if (isMountedRef.current) {
          setError(err);
          setIsLoading(false);
        }
      },
    });

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [page, pageSize, JSON.stringify(selector), refreshRef.current]);

  return { data, isLoading, error, refresh };
}
