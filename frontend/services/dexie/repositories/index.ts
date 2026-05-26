import { customerRepository } from './CustomerRepository';
import { supplierRepository } from './SupplierRepository';
import { productRepository } from './ProductRepository';
import { invoiceRepository } from './InvoiceRepository';
import { workCenterRepository } from './WorkCenterRepository';
import { productionResourceRepository } from './ProductionResourceRepository';
import { manufacturingJobRepository } from './ManufacturingJobRepository';
import { examinationPricingRepository } from './ExaminationPricingRepository';
import { notificationRepository } from './NotificationRepository';
import { settingRepository } from './SettingRepository';
import { auditLogRepository } from './AuditLogRepository';
import { syncOperationRepository } from './SyncOperationRepository';

export interface RepositoryRegistry {
  customers: typeof customerRepository;
  suppliers: typeof supplierRepository;
  products: typeof productRepository;
  invoices: typeof invoiceRepository;
  workCenters: typeof workCenterRepository;
  productionResources: typeof productionResourceRepository;
  manufacturingJobs: typeof manufacturingJobRepository;
  examinationPricing: typeof examinationPricingRepository;
  notifications: typeof notificationRepository;
  settings: typeof settingRepository;
  auditLogs: typeof auditLogRepository;
  syncOperations: typeof syncOperationRepository;
}

export const repositories: RepositoryRegistry = {
  customers: customerRepository,
  suppliers: supplierRepository,
  products: productRepository,
  invoices: invoiceRepository,
  workCenters: workCenterRepository,
  productionResources: productionResourceRepository,
  manufacturingJobs: manufacturingJobRepository,
  examinationPricing: examinationPricingRepository,
  notifications: notificationRepository,
  settings: settingRepository,
  auditLogs: auditLogRepository,
  syncOperations: syncOperationRepository,
};

export function getRepository<K extends keyof RepositoryRegistry>(key: K): RepositoryRegistry[K] {
  return repositories[key];
}

export async function getRepositories(): Promise<RepositoryRegistry> {
  return repositories;
}

export {
  customerRepository,
  supplierRepository,
  productRepository,
  invoiceRepository,
  workCenterRepository,
  productionResourceRepository,
  manufacturingJobRepository,
  examinationPricingRepository,
  notificationRepository,
  settingRepository,
  auditLogRepository,
  syncOperationRepository,
};
