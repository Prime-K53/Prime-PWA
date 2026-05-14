import { create } from 'zustand';
import { Purchase, GoodsReceipt, SubcontractOrder, Supplier } from '../types';
import { api } from '../services/api';
import { transactionService } from '../services/transactionService';
import { generateNextId } from '../utils/helpers';

interface ProcurementState {
  purchases: Purchase[];
  goodsReceipts: GoodsReceipt[];
  subcontractOrders: SubcontractOrder[];
  suppliers: Supplier[];
  isLoading: boolean;

  fetchProcurementData: () => Promise<void>;
  addPurchase: (purchase: Purchase) => Promise<void>;
  updatePurchase: (purchase: Purchase) => Promise<void>;
  approvePurchase: (id: string) => Promise<{ success: boolean; apEntryId?: string }>;
  cancelPurchase: (id: string, reason: string) => Promise<{ success: boolean }>;
  
  addGoodsReceipt: (gr: GoodsReceipt) => Promise<void>;
  updateGoodsReceipt: (gr: GoodsReceipt) => Promise<void>;
  deleteGoodsReceipt: (id: string) => Promise<void>;

  addSubcontractOrder: (order: SubcontractOrder) => Promise<void>;
  updateSubcontractOrder: (order: SubcontractOrder) => Promise<void>;
  deleteSubcontractOrder: (id: string) => Promise<void>;

  addSupplier: (supplier: Supplier) => Promise<void>;
  updateSupplier: (supplier: Supplier) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
}

export const useProcurementStore = create<ProcurementState>((set, get) => ({
  purchases: [],
  goodsReceipts: [],
  subcontractOrders: [],
  suppliers: [],
  isLoading: false,

  fetchProcurementData: async () => {
    set({ isLoading: true });
    try {
      const [purchases, goodsReceipts, subcontractOrders, suppliers] = await Promise.all([
        api.procurement.getPurchases(),
        api.procurement.getGoodsReceipts(),
        api.procurement.getSubcontractOrders(),
        api.suppliers.getAll()
      ]);
      set({ purchases, goodsReceipts, subcontractOrders, suppliers });
    } catch (error) {
      console.error("Failed to load procurement data", error);
    } finally {
      set({ isLoading: false });
    }
  },

  addPurchase: async (purchase) => {
    const newPurchase = { ...purchase, id: purchase.id || generateNextId('PO', get().purchases) };
    set(state => ({ purchases: [...state.purchases, newPurchase] }));
    await api.procurement.savePurchase(newPurchase);
  },

  updatePurchase: async (purchase) => {
    set(state => ({ purchases: state.purchases.map(p => p.id === purchase.id ? purchase : p) }));
    await api.procurement.savePurchase(purchase);
  },

  approvePurchase: async (id: string) => {
    const result = await transactionService.approvePurchaseOrder(id);
    if (result.success) {
      set(state => ({
        purchases: state.purchases.map(p =>
          p.id === id ? { ...p, status: 'Approved', paymentStatus: 'Approved' } : p
        )
      }));
    }
    return result;
  },

  cancelPurchase: async (id: string, reason: string) => {
    const result = await transactionService.cancelPurchaseOrder(id, reason);
    if (result.success) {
      set(state => ({
        purchases: state.purchases.map(p =>
          p.id === id ? { ...p, status: 'Cancelled', paymentStatus: 'Cancelled' } : p
        )
      }));
    }
    return result;
  },

  addGoodsReceipt: async (gr) => {
    const newGR = { ...gr, id: gr.id || generateNextId('GRN', get().goodsReceipts) };
    set(state => ({ goodsReceipts: [...state.goodsReceipts, newGR] }));
    await transactionService.processGoodsReceipt(newGR);
  },

  updateGoodsReceipt: async (gr) => {
    set(state => ({ goodsReceipts: state.goodsReceipts.map(g => g.id === gr.id ? gr : g) }));
    await api.procurement.saveGoodsReceipt(gr);
  },

  deleteGoodsReceipt: async (id) => {
    set(state => ({ goodsReceipts: state.goodsReceipts.filter(g => g.id !== id) }));
  },

  addSubcontractOrder: async (order) => {
    const newOrder = { ...order, id: order.id || generateNextId('SUB', get().subcontractOrders) };
    set(state => ({ subcontractOrders: [...state.subcontractOrders, newOrder] }));
    await api.procurement.saveSubcontractOrder(newOrder);
  },

  updateSubcontractOrder: async (order) => {
    set(state => ({ subcontractOrders: state.subcontractOrders.map(o => o.id === order.id ? order : o) }));
    await api.procurement.saveSubcontractOrder(order);
  },

  deleteSubcontractOrder: async (id) => {
    set(state => ({ subcontractOrders: state.subcontractOrders.filter(o => o.id !== id) }));
    await api.procurement.deleteSubcontractOrder(id);
  },

  addSupplier: async (supplier) => {
    const newSupplier = { ...supplier, id: supplier.id || generateNextId('SUP', get().suppliers) };
    set(state => ({ suppliers: [...state.suppliers, newSupplier] }));
    await api.suppliers.save(newSupplier);
  },

  updateSupplier: async (supplier) => {
    set(state => ({ suppliers: state.suppliers.map(s => s.id === supplier.id ? supplier : s) }));
    await api.suppliers.save(supplier);
  },

  deleteSupplier: async (id) => {
    set(state => ({ suppliers: state.suppliers.filter(s => s.id !== id) }));
    await api.suppliers.delete(id);
  }
}));