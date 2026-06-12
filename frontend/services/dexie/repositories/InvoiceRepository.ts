import { BaseRepository } from './BaseRepository';
import type { InvoiceEntity } from '../types';

export class InvoiceRepository extends BaseRepository<InvoiceEntity> {
  protected tableName = 'invoices';

  async findByInvoiceNumber(invoiceNumber: string): Promise<InvoiceEntity | undefined> {
    const table = await this.getTable();
    return table.filter((i) => i.invoiceNumber === invoiceNumber && !i.isDeleted).first();
  }

  async findByCustomer(customerId: string): Promise<InvoiceEntity[]> {
    return this.findAll({ selector: { customerId } as Partial<InvoiceEntity> });
  }

  async findPending(): Promise<InvoiceEntity[]> {
    return this.findAll({ selector: { status: 'unpaid' } as Partial<InvoiceEntity> });
  }

  async getOutstandingBalance(customerId: string): Promise<number> {
    const invoices = await this.findByCustomer(customerId);
    return invoices.reduce((sum, inv) => sum + inv.balanceDue, 0);
  }
}

export const invoiceRepository = new InvoiceRepository();
