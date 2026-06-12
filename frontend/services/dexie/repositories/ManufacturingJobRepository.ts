import { BaseRepository } from './BaseRepository';
import type { ManufacturingJobEntity } from '../types';

export class ManufacturingJobRepository extends BaseRepository<ManufacturingJobEntity> {
  protected tableName = 'manufacturingJobs';

  async findByJobNumber(jobNumber: string): Promise<ManufacturingJobEntity | undefined> {
    const table = await this.getTable();
    return table.filter((j) => j.jobNumber === jobNumber && !j.isDeleted).first();
  }

  async findByWorkCenter(workCenterId: string): Promise<ManufacturingJobEntity[]> {
    return this.findAll({ selector: { workCenterId } as Partial<ManufacturingJobEntity> });
  }

  async findScheduled(): Promise<ManufacturingJobEntity[]> {
    return this.findAll({ selector: { status: 'scheduled' } as Partial<ManufacturingJobEntity> });
  }

  async findInProgress(): Promise<ManufacturingJobEntity[]> {
    return this.findAll({ selector: { status: 'in_progress' } as Partial<ManufacturingJobEntity> });
  }
}

export const manufacturingJobRepository = new ManufacturingJobRepository();
