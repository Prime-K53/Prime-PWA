export interface LegacyDataSlices {
  auth?: Record<string, any> | null;
  finance?: Record<string, any> | null;
  inventory?: Record<string, any> | null;
  production?: Record<string, any> | null;
  sales?: Record<string, any> | null;
  procurement?: Record<string, any> | null;
  orders?: Record<string, any> | null;
  examination?: Record<string, any> | null;
}

export const runLegacyRefreshTasks = async (slices: LegacyDataSlices) => {
  const tasks = [
    () => slices.finance?.fetchFinanceData?.(),
    () => slices.sales?.fetchSalesData?.(),
    () => slices.inventory?.fetchInventoryData?.(),
    () => slices.procurement?.fetchProcurementData?.(),
    () => slices.production?.fetchProductionData?.(),
    () => slices.orders?.fetchOrders?.(),
  ];

  return Promise.allSettled(tasks.map((task) => task()));
};
