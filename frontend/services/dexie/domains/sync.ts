import { DatabaseManagerFactory } from '../DatabaseManagerFactory';
import type { SyncOperationEntity, BaseEntity } from '../types';

const table = <T>(name: string) => DatabaseManagerFactory.getTable<T>(name);

export const SyncDomain = {
  syncOperations: () => table<SyncOperationEntity>('syncOperations'),
  syncConflicts: () => table<BaseEntity & Record<string, unknown>>('syncConflicts'),
  syncLogs: () => table<BaseEntity & Record<string, unknown>>('syncLogs'),
  syncQueue: () => table<BaseEntity & Record<string, unknown>>('syncQueue'),
  syncSnapshots: () => table<BaseEntity & Record<string, unknown>>('syncSnapshots'),
};
