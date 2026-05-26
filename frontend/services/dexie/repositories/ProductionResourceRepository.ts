import { BaseRepository } from './BaseRepository';
import type { ProductionResourceEntity } from '../types';

export class ProductionResourceRepository extends BaseRepository<ProductionResourceEntity> {
  protected tableName = 'productionResources';

  async findByWorkCenter(workCenterId: string): Promise<ProductionResourceEntity[]> {
    return this.findAll({ selector: { workCenterId } as Partial<ProductionResourceEntity> });
  }

  async findAvailable(): Promise<ProductionResourceEntity[]> {
    return this.findAll({ selector: { status: 'active' } as Partial<ProductionResourceEntity> });
  }
}

export const productionResourceRepository = new ProductionResourceRepository();
