import { BaseRepository } from './BaseRepository';
import type { ExaminationPricingEntity } from '../types';

export class ExaminationPricingRepository extends BaseRepository<ExaminationPricingEntity> {
  protected tableName = 'examinationPricing';

  async findByBatchNumber(batchNumber: string): Promise<ExaminationPricingEntity | undefined> {
    const table = await this.getTable();
    return table.filter((e) => e.batchNumber === batchNumber && !e.isDeleted).first();
  }

  async findBySchool(schoolId: string): Promise<ExaminationPricingEntity[]> {
    return this.findAll({ selector: { schoolId } as Partial<ExaminationPricingEntity> });
  }

  async findDrafts(): Promise<ExaminationPricingEntity[]> {
    return this.findAll({ selector: { status: 'draft' } as Partial<ExaminationPricingEntity> });
  }
}

export const examinationPricingRepository = new ExaminationPricingRepository();
