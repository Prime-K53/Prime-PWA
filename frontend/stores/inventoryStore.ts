
import { create } from 'zustand';
import { Item, Warehouse } from '../types';
import { api } from '../services/api';
import { dbService } from '../services/db';
import { INITIAL_INVENTORY, MOCK_WAREHOUSES } from '../constants';
import { generateNextId } from '../utils/helpers';
import { transactionService } from '../services/transactionService';
import { normalizeInventoryItemPricing } from '../utils/pricing';
import {
  recalculatePrice as recalculateProductPrice,
  repriceMasterInventoryFromAdjustments
} from '../services/masterInventoryPricingService';

interface InventoryState {
  inventory: Item[];
  warehouses: Warehouse[];
  isLoading: boolean;
  error: string | null;

  fetchInventory: () => Promise<void>;
  addItem: (item: Item) => Promise<void>;
  updateItem: (item: Item) => Promise<void>;
  recalculatePrice: (itemId: string) => Promise<Item | undefined>;
  deleteItem: (id: string) => Promise<void>;
  addWarehouse: (warehouse: Warehouse) => Promise<void>;
  updateStock: (itemId: string, quantityChange: number, locationId?: string, variantId?: string) => Promise<void>;
  updateReservedStock: (itemId: string, reservedChange: number, variantId?: string) => Promise<void>;
  transferStock: (itemId: string, fromLocationId: string, toLocationId: string, quantity: number) => Promise<void>;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  inventory: [],
  warehouses: [],
  isLoading: false,
  error: null,

  fetchInventory: async () => {
    set({ isLoading: true, error: null });
    try {
      const [loadedItems, loadedWarehouses] = await Promise.all([
        dbService.getAll<Item>('inventory'),
        dbService.getAll<Warehouse>('warehouses')
      ]);

      if (loadedItems.length === 0 && loadedWarehouses.length === 0) {
        // Seed Data using dbService directly to avoid UNAUTHORIZED errors before login
        set({ inventory: INITIAL_INVENTORY, warehouses: MOCK_WAREHOUSES });
        for (const i of INITIAL_INVENTORY) await dbService.put('inventory', i);
        for (const w of MOCK_WAREHOUSES) await dbService.put('warehouses', w);
      } else {
        const normalizedItems = loadedItems.map(normalizeInventoryItemPricing);
        const repairedItems = normalizedItems.filter((item, index) => JSON.stringify(item) !== JSON.stringify(loadedItems[index]));

        if (repairedItems.length > 0) {
          await Promise.all(repairedItems.map((item) => dbService.put('inventory', item)));
        }

        set({ inventory: normalizedItems, warehouses: loadedWarehouses });
      }
    } catch (error) {
      console.error('Inventory Load Error:', error);
      set({ error: 'Failed to load inventory data' });
    } finally {
      set({ isLoading: false });
    }
  },

  addItem: async (item: Item) => {
    const newItem = { ...item, id: item.id || generateNextId('ITM', get().inventory) };
    set(state => ({ inventory: [...state.inventory, newItem] }));
    await api.inventory.createItem(newItem);
    await get().fetchInventory();
  },

  updateItem: async (item: Item) => {
    const previous = get().inventory.find(i => i.id === item.id);
    set(state => ({
      inventory: state.inventory.map(i => i.id === item.id ? item : i)
    }));
    await api.inventory.updateItem(item);
    await get().fetchInventory();

    const previousCost = Number(previous?.cost_price ?? previous?.cost ?? 0);
    const nextCost = Number(item.cost_price ?? item.cost ?? 0);
    const materialCostChanged = item.type === 'Material' && Math.abs(previousCost - nextCost) > 0.00001;
    if (materialCostChanged) {
      await repriceMasterInventoryFromAdjustments();
      await get().fetchInventory();
    }
  },

  recalculatePrice: async (itemId: string) => {
    const repriced = await recalculateProductPrice(itemId);
    if (repriced.item) {
      set(state => ({
        inventory: state.inventory.map(i => i.id === repriced.item!.id ? repriced.item! : i)
      }));
      return repriced.item;
    }
    return undefined;
  },

  deleteItem: async (id: string) => {
    const itemToDelete = get().inventory.find(i => i.id === id);
    if (itemToDelete?.isProtected) {
      set({ error: 'Cannot delete protected item' });
      throw new Error('Cannot delete protected item');
    }
    set(state => ({
      inventory: state.inventory.filter(i => i.id !== id)
    }));
    await api.inventory.deleteItem(id);
  },

  addWarehouse: async (warehouse: Warehouse) => {
    set(state => ({ warehouses: [...state.warehouses, warehouse] }));
    await api.inventory.saveWarehouse(warehouse);
  },

  updateStock: async (itemId: string, quantityChange: number, locationId: string = 'WH-MAIN', variantId?: string) => {
    // We use transactionService for the heavy lifting to ensure atomicity and ledger integrity
    // Note: This store method is now a wrapper around the atomic service
    await transactionService.adjustStock({
      itemId,
      qtyChange: quantityChange,
      reason: 'System adjustment via store',
      warehouseId: locationId,
      variantId
    });
    // Refresh the local state from the DB
    await get().fetchInventory();
  },

  updateReservedStock: async (itemId: string, reservedChange: number, variantId?: string) => {
    await transactionService.updateReservedStock(itemId, reservedChange, variantId);
    await get().fetchInventory();
  },

  transferStock: async (itemId: string, fromLocationId: string, toLocationId: string, quantity: number) => {
    await transactionService.transferStock(itemId, fromLocationId, toLocationId, quantity);
    await get().fetchInventory();
  }
}));
