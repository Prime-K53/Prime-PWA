import { BaseRepository } from './BaseRepository';
import type { SyncOperationEntity, SyncOperationStatus } from '../types';
import { liveQuery, type Observable } from 'dexie';

export class SyncOperationRepository extends BaseRepository<SyncOperationEntity> {
  protected tableName = 'syncOperations';

  async findByStatus(statuses: SyncOperationStatus[]): Promise<SyncOperationEntity[]> {
    const table = await this.getTable();
    const statusSet = new Set(statuses);
    return table.filter((op) => statusSet.has(op.queueStatus) && !op.isDeleted)
      .sortBy('updatedAt');
  }

  async findPending(): Promise<SyncOperationEntity[]> {
    return this.findByStatus(['pending', 'syncing', 'failed', 'blocked']);
  }

  async countPending(): Promise<number> {
    const table = await this.getTable();
    return table.filter((op) =>
      (op.queueStatus === 'pending' || op.queueStatus === 'failed' || op.queueStatus === 'blocked') &&
      !op.isDeleted
    ).count();
  }

  observePending(): Observable<SyncOperationEntity[]> {
    return liveQuery(async () => this.findPending());
  }
}

export const syncOperationRepository = new SyncOperationRepository();
