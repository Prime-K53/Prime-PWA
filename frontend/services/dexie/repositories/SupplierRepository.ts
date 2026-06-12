import { BaseRepository } from './BaseRepository';
import type { SupplierEntity } from '../types';

export class SupplierRepository extends BaseRepository<SupplierEntity> {
  protected tableName = 'suppliers';

  async findBySupplierCode(code: string): Promise<SupplierEntity | undefined> {
    const table = await this.getTable();
    return table.filter((s) => s.supplierCode === code && !s.isDeleted).first();
  }

  async findActive(): Promise<SupplierEntity[]> {
    return this.findAll({ selector: { status: 'active' } as Partial<SupplierEntity> });
  }
}

export const supplierRepository = new SupplierRepository();
