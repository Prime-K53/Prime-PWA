import type { Observable } from 'dexie';

export interface QueryOptions<T = Record<string, unknown>> {
  selector?: Partial<T>;
  sort?: { field: keyof T; direction: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
}

export interface PaginationInput {
  page: number;
  pageSize: number;
  sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  selector?: Record<string, unknown>;
}

export interface PaginatedResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
  durationMs: number;
}

export interface BatchOperationResult {
  success: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

export interface WriteLock {
  acquire(): Promise<void>;
  release(): void;
}
