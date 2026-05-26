import { analyticsCache } from './AnalyticsCache';
import { aggregationService } from './Aggregations';

export interface DashboardData {
  totalRevenue: number;
  outstandingBalance: number;
  productCount: number;
  customerCount: number;
  activeWorkCenters: number;
  pendingSyncOps: number;
  generatedAt: string;
}

export class DashboardSnapshotService {
  async generateSnapshot(): Promise<DashboardData> {
    const [totalRevenue, outstandingBalance, productCount, customerCount, activeWorkCenters, pendingSyncOps] =
      await Promise.all([
        aggregationService.getTotalRevenue(),
        aggregationService.getOutstandingBalance(),
        aggregationService.getProductCount(),
        aggregationService.getCustomerCount(),
        aggregationService.getActiveWorkCenters(),
        aggregationService.getPendingSyncOperations(),
      ]);

    const data: DashboardData = {
      totalRevenue,
      outstandingBalance,
      productCount,
      customerCount,
      activeWorkCenters,
      pendingSyncOps,
      generatedAt: new Date().toISOString(),
    };

    await analyticsCache.storeDashboardSnapshot('main-dashboard', data);
    return data;
  }

  async getCachedSnapshot(): Promise<DashboardData | undefined> {
    return analyticsCache.getDashboardSnapshot<DashboardData>('main-dashboard');
  }
}

export const dashboardSnapshotService = new DashboardSnapshotService();
