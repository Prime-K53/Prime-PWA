import { BaseRepository } from './BaseRepository';
import type { ProductEntity } from '../types';

export class ProductRepository extends BaseRepository<ProductEntity> {
  protected tableName = 'products';

  async findBySku(sku: string): Promise<ProductEntity | undefined> {
    const table = await this.getTable();
    return table.filter((p) => p.sku === sku && !p.isDeleted).first();
  }

  async findByBarcode(barcode: string): Promise<ProductEntity | undefined> {
    const table = await this.getTable();
    return table.filter((p) => p.barcode === barcode && !p.isDeleted).first();
  }

  async findByType(productType: ProductEntity['productType']): Promise<ProductEntity[]> {
    return this.findAll({ selector: { productType } as Partial<ProductEntity> });
  }

  async findLowStock(): Promise<ProductEntity[]> {
    const table = await this.getTable();
    return table.filter((p) => !p.isDeleted && p.stockOnHand <= p.reorderPoint).toArray();
  }

  async updateStock(id: string, delta: number): Promise<ProductEntity | undefined> {
    return this.withWriteLock(async (table) => {
      const existing = await table.get(id);
      if (!existing) return undefined;
      const stockOnHand = Math.max(0, existing.stockOnHand + delta);
      const availableStock = Math.max(0, stockOnHand - existing.reservedStock);
      const updated = {
        ...existing,
        stockOnHand,
        availableStock,
        updatedAt: new Date().toISOString(),
        entityVersion: existing.entityVersion + 1,
      };
      await table.put(updated);
      return updated;
    });
  }
}

export const productRepository = new ProductRepository();
