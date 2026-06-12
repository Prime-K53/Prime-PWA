import { DatabaseManagerFactory } from '../DatabaseManagerFactory';
import type { ProductEntity, StockMovementEntity, WarehouseEntity, InventoryBalanceEntity } from '../types';

const table = <T>(name: string) => DatabaseManagerFactory.getTable<T>(name);

export const InventoryDomain = {
  products: () => table<ProductEntity>('products'),
  stockMovements: () => table<StockMovementEntity>('stockMovements'),
  warehouses: () => table<WarehouseEntity>('warehouses'),
  inventoryBalances: () => table<InventoryBalanceEntity>('inventoryBalances'),
};
