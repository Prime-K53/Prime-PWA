import { DatabaseManagerFactory } from '../DatabaseManagerFactory';
import type { CustomerEntity, SupplierEntity, InvoiceEntity, PaymentEntity, ExpenseEntity } from '../types';

const table = <T>(name: string) => DatabaseManagerFactory.getTable<T>(name);

export const FinanceDomain = {
  customers: () => table<CustomerEntity>('customers'),
  suppliers: () => table<SupplierEntity>('suppliers'),
  invoices: () => table<InvoiceEntity>('invoices'),
  payments: () => table<PaymentEntity>('payments'),
  expenses: () => table<ExpenseEntity>('expenses'),
};
