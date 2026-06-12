import { DatabaseManagerFactory } from '../DatabaseManagerFactory';
import type { ExaminationPricingEntity } from '../types';

const table = <T>(name: string) => DatabaseManagerFactory.getTable<T>(name);

export const ExaminationDomain = {
  examinationPricing: () => table<ExaminationPricingEntity>('examinationPricing'),
  examinationResults: () => table<Record<string, unknown>>('examinationResults'),
};
