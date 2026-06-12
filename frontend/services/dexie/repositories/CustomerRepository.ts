import { BaseRepository } from './BaseRepository';
import type { CustomerEntity } from '../types';

export class CustomerRepository extends BaseRepository<CustomerEntity> {
  protected tableName = 'customers';

  async findByCustomerCode(code: string): Promise<CustomerEntity | undefined> {
    const table = await this.getTable();
    return table.filter((c) => c.customerCode === code && !c.isDeleted).first();
  }

  async findActive(): Promise<CustomerEntity[]> {
    return this.findAll({ selector: { status: 'active' } as Partial<CustomerEntity> });
  }

  async findBySegment(segment: string): Promise<CustomerEntity[]> {
    return this.findAll({ selector: { segment } as Partial<CustomerEntity> });
  }
}

export const customerRepository = new CustomerRepository();
