import { DatabaseManagerFactory } from '../DatabaseManagerFactory';
import type { WorkCenterEntity, ProductionResourceEntity, ManufacturingJobEntity } from '../types';

const table = <T>(name: string) => DatabaseManagerFactory.getTable<T>(name);

export const ProductionDomain = {
  workCenters: () => table<WorkCenterEntity>('workCenters'),
  productionResources: () => table<ProductionResourceEntity>('productionResources'),
  manufacturingJobs: () => table<ManufacturingJobEntity>('manufacturingJobs'),
};
