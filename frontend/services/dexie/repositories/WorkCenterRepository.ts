import { BaseRepository } from './BaseRepository';
import type { WorkCenterEntity } from '../types';

export class WorkCenterRepository extends BaseRepository<WorkCenterEntity> {
  protected tableName = 'workCenters';

  async findByCenterCode(code: string): Promise<WorkCenterEntity | undefined> {
    const table = await this.getTable();
    return table.filter((wc) => wc.centerCode === code && !wc.isDeleted).first();
  }

  async findActive(): Promise<WorkCenterEntity[]> {
    return this.findAll({ selector: { status: 'active' } as Partial<WorkCenterEntity> });
  }
}

export const workCenterRepository = new WorkCenterRepository();
