import { repositories } from '../repositories';
import { analyticsCache } from './AnalyticsCache';

export class AggregationService {
  async getTotalRevenue(period?: string): Promise<number> {
    const cacheKey = `total-revenue:${period || 'all'}`;
    return (await analyticsCache.getOrCompute(cacheKey, 'finance', 30000, async () => {
      const invoices = await repositories.invoices.findAll({
        selector: period ? { status: 'paid' } as any : undefined,
      });
      return invoices.filter((i) => i.status === 'paid' || i.status === 'partial')
        .reduce((sum, i) => sum + i.paidAmount, 0);
    })).data;
  }

  async getOutstandingBalance(): Promise<number> {
    const cacheKey = 'outstanding-balance';
    return (await analyticsCache.getOrCompute(cacheKey, 'finance', 30000, async () => {
      const invoices = await repositories.invoices.findAll({
        selector: { status: 'unpaid' } as any,
      });
      return invoices.reduce((sum, i) => sum + i.balanceDue, 0);
    })).data;
  }

  async getProductCount(): Promise<number> {
    const cacheKey = 'product-count';
    return (await analyticsCache.getOrCompute(cacheKey, 'inventory', 60000, async () => {
      return repositories.products.count();
    })).data;
  }

  async getCustomerCount(): Promise<number> {
    const cacheKey = 'customer-count';
    return (await analyticsCache.getOrCompute(cacheKey, 'core', 60000, async () => {
      return repositories.customers.count();
    })).data;
  }

  async getActiveWorkCenters(): Promise<number> {
    const cacheKey = 'active-work-centers';
    return (await analyticsCache.getOrCompute(cacheKey, 'production', 60000, async () => {
      const centers = await repositories.workCenters.findAll({ selector: { status: 'active' } as any });
      return centers.length;
    })).data;
  }

  async getPendingSyncOperations(): Promise<number> {
    return repositories.syncOperations.countPending();
  }
}

export const aggregationService = new AggregationService();
