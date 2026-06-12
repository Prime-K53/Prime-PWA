import { DatabaseManagerFactory } from '../DatabaseManagerFactory';
import type { BaseEntity } from '../types';

const table = <T>(name: string) => DatabaseManagerFactory.getTable<T>(name);

export const AnalyticsDomain = {
  analyticsCache: () => table<BaseEntity & Record<string, unknown>>('analyticsCache'),
  kpiCache: () => table<BaseEntity & Record<string, unknown>>('kpiCache'),
  dashboardSnapshots: () => table<BaseEntity & Record<string, unknown>>('dashboardSnapshots'),
};
