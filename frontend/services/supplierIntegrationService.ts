/**
 * Supplier Integration Service
 *
 * Provides integration capabilities for:
 * - Supplier portals for ordering
 * - Automated purchase order generation
 * - Supplier catalog synchronization
 * - Price comparison and tender management
 * - Delivery tracking
 */

import type { SupplierEntity } from './dexie/types';
import { getEnterpriseRepositories } from './dexie/database';
import { settingsBackplane } from './dexie/settings-backplane';

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  categories: string[];
  rating: number;
  leadTimeDays: number;
  minimumOrderValue: number;
  paymentTerms: string;
  active: boolean;
  createdAt: string;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseOrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: 'draft' | 'sent' | 'acknowledged' | 'partial' | 'fulfilled' | 'cancelled';
  createdAt: string;
  expectedDelivery: string;
  actualDelivery?: string;
  notes: string;
}

export interface PurchaseOrderItem {
  itemId: string;
  itemName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  receivedQuantity: number;
}

export interface SupplierQuote {
  id: string;
  supplierId: string;
  supplierName: string;
  quoteNumber: string;
  validUntil: string;
  items: QuoteItem[];
  subtotal: number;
  total: number;
  currency: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
}

export interface QuoteItem {
  itemId: string;
  itemName: string;
  unitPrice: number;
  availability: 'in_stock' | 'limited' | 'out_of_stock';
  leadTimeDays: number;
}

export interface ReorderSuggestion {
  itemId: string;
  itemName: string;
  currentStock: number;
  reorderPoint: number;
  suggestedQuantity: number;
  estimatedCost: number;
  preferredSupplier?: Supplier;
  alternatives: Supplier[];
}

class SupplierIntegrationService {
  private readonly SUPPLIERS_KEY = 'suppliers';
  private readonly ORDERS_KEY = 'purchaseOrders';
  private readonly QUOTES_KEY = 'supplierQuotes';
  private suppliersCache: Supplier[] = [];
  private ordersCache: PurchaseOrder[] = [];
  private quotesCache: SupplierQuote[] = [];
  private hydrationPromise: Promise<void> | null = null;

  private defaultSuppliers: Supplier[] = [
    {
      id: 'SUP-PAPER-001',
      name: 'Malawi Paper Supplies Ltd',
      contactPerson: 'John Chimwemwe',
      email: 'orders@malawipapersupplies.mw',
      phone: '+265 1 234 567',
      address: 'Private Bag 304, Blantyre',
      categories: ['Paper'],
      rating: 4.5,
      leadTimeDays: 7,
      minimumOrderValue: 50000,
      paymentTerms: 'Net 30',
      active: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'SUP-TONER-001',
      name: 'Tech Solutions Malawi',
      contactPerson: 'Maria Banda',
      email: 'sales@techsolutions.mw',
      phone: '+265 1 234 568',
      address: 'P.O. Box 1234, Lilongwe',
      categories: ['Toner', 'Ink'],
      rating: 4.2,
      leadTimeDays: 14,
      minimumOrderValue: 75000,
      paymentTerms: 'Net 45',
      active: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'SUP-GENERAL-001',
      name: 'Office Essentials Ltd',
      contactPerson: 'David Phiri',
      email: 'bulk@officeessentials.mw',
      phone: '+265 1 234 569',
      address: 'P.O. Box 5678, Zomba',
      categories: ['Paper', 'Toner', 'Ink', 'General'],
      rating: 4.0,
      leadTimeDays: 10,
      minimumOrderValue: 25000,
      paymentTerms: 'Net 30',
      active: true,
      createdAt: new Date().toISOString()
    }
  ];

  constructor() {
    this.initializeCaches();
  }

  private canUseIndexedDb(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  private readLocalArray<T>(key: string): T[] {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed as T[] : [];
    } catch {
      return [];
    }
  }

  private writeLocalArray(key: string, value: unknown[]) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Local mirroring is best effort only.
    }
  }

  private parsePaymentTermsDays(paymentTerms: string): number {
    const match = String(paymentTerms || '').match(/(\d+)/);
    return match ? Number(match[1]) : 30;
  }

  private toSupplierEntity(supplier: Supplier): SupplierEntity {
    return {
      id: supplier.id,
      supplierCode: supplier.id,
      name: supplier.name,
      status: supplier.active ? 'active' : 'inactive',
      category: supplier.categories[0] || 'General',
      email: supplier.email,
      phone: supplier.phone,
      address: {
        line1: supplier.address
      },
      primaryContact: {
        name: supplier.contactPerson,
        email: supplier.email,
        phone: supplier.phone
      },
      currency: 'MWK',
      paymentTermsDays: this.parsePaymentTermsDays(supplier.paymentTerms),
      outstandingBalance: 0,
      entityVersion: 1,
      createdAt: supplier.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
      source: 'user-action',
      sync: {
        status: 'pending',
        retryCount: 0
      },
      tags: supplier.categories,
      extra: {
        contactPerson: supplier.contactPerson,
        rating: supplier.rating,
        leadTimeDays: supplier.leadTimeDays,
        minimumOrderValue: supplier.minimumOrderValue,
        paymentTerms: supplier.paymentTerms,
        categories: supplier.categories
      }
    };
  }

  private fromSupplierEntity(entity: SupplierEntity): Supplier {
    const extra = (entity.extra || {}) as Record<string, any>;
    return {
      id: entity.id,
      name: entity.name,
      contactPerson: String(extra.contactPerson || entity.primaryContact?.name || ''),
      email: entity.email || '',
      phone: entity.phone || '',
      address: String(entity.address?.line1 || ''),
      categories: Array.isArray(extra.categories) ? extra.categories.map(String) : [entity.category].filter(Boolean),
      rating: Number(extra.rating || 0) || 0,
      leadTimeDays: Number(extra.leadTimeDays || 0) || 0,
      minimumOrderValue: Number(extra.minimumOrderValue || 0) || 0,
      paymentTerms: String(extra.paymentTerms || `Net ${entity.paymentTermsDays || 30}`),
      active: entity.status === 'active',
      createdAt: entity.createdAt
    };
  }

  private initializeCaches(): void {
    const localSuppliers = this.readLocalArray<Supplier>(this.SUPPLIERS_KEY);
    const localOrders = this.readLocalArray<PurchaseOrder>(this.ORDERS_KEY);
    const localQuotes = this.readLocalArray<SupplierQuote>(this.QUOTES_KEY);

    this.suppliersCache = localSuppliers.length > 0 ? localSuppliers : [...this.defaultSuppliers];
    this.ordersCache = localOrders;
    this.quotesCache = localQuotes;

    this.writeLocalArray(this.SUPPLIERS_KEY, this.suppliersCache);

    if (!this.hydrationPromise) {
      this.hydrationPromise = this.hydrate().finally(() => {
        this.hydrationPromise = null;
      });
    }
  }

  private async hydrate() {
    try {
      const [orders, quotes] = await Promise.all([
        settingsBackplane.getJson<PurchaseOrder[]>(this.ORDERS_KEY, { exactKey: true }),
        settingsBackplane.getJson<SupplierQuote[]>(this.QUOTES_KEY, { exactKey: true })
      ]);

      if (Array.isArray(orders) && orders.length > 0) {
        this.ordersCache = orders;
        this.writeLocalArray(this.ORDERS_KEY, this.ordersCache);
      }

      if (Array.isArray(quotes) && quotes.length > 0) {
        this.quotesCache = quotes;
        this.writeLocalArray(this.QUOTES_KEY, this.quotesCache);
      }

      if (this.canUseIndexedDb()) {
        try {
          const repositories = await getEnterpriseRepositories();
          const rows = await repositories.suppliers.findAll({
            sort: { field: 'updatedAt', direction: 'desc' }
          });

          if (rows.length > 0) {
            this.suppliersCache = rows.map((row) => this.fromSupplierEntity(row));
            this.writeLocalArray(this.SUPPLIERS_KEY, this.suppliersCache);
          }
        } catch {
          // Dexie not available yet — fallback to local cache
        }
      }
    } catch (error) {
      console.error('[SupplierIntegration] Hydration failed:', error);
    }
  }

  private async persistSuppliers() {
    this.writeLocalArray(this.SUPPLIERS_KEY, this.suppliersCache);

    if (!this.canUseIndexedDb()) return;

    try {
      const repositories = await getEnterpriseRepositories();
      await repositories.suppliers.bulkUpsert(this.suppliersCache.map((supplier) => this.toSupplierEntity(supplier)));
    } catch (error) {
      console.error('[SupplierIntegration] Persist failed:', error);
    }
  }

  private async persistOrders() {
    this.writeLocalArray(this.ORDERS_KEY, this.ordersCache);
    await settingsBackplane.setJson(this.ORDERS_KEY, this.ordersCache, { exactKey: true });
  }

  private async persistQuotes() {
    this.writeLocalArray(this.QUOTES_KEY, this.quotesCache);
    await settingsBackplane.setJson(this.QUOTES_KEY, this.quotesCache, { exactKey: true });
  }

  getSuppliers(): Supplier[] {
    return [...this.suppliersCache];
  }

  getSuppliersByCategory(category: string): Supplier[] {
    return this.suppliersCache.filter((supplier) =>
      supplier.active && supplier.categories.some((entry) => entry.toLowerCase() === category.toLowerCase())
    );
  }

  getSupplierById(supplierId: string): Supplier | undefined {
    return this.suppliersCache.find((supplier) => supplier.id === supplierId);
  }

  addSupplier(supplier: Omit<Supplier, 'id' | 'createdAt'>): Supplier {
    const newSupplier: Supplier = {
      ...supplier,
      id: `SUP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString()
    };

    this.suppliersCache = [...this.suppliersCache, newSupplier];
    void this.persistSuppliers();
    return newSupplier;
  }

  updateSupplier(supplierId: string, updates: Partial<Supplier>): Supplier | null {
    const index = this.suppliersCache.findIndex((supplier) => supplier.id === supplierId);
    if (index === -1) return null;

    this.suppliersCache[index] = { ...this.suppliersCache[index], ...updates };
    void this.persistSuppliers();
    return this.suppliersCache[index];
  }

  getPurchaseOrders(): PurchaseOrder[] {
    return [...this.ordersCache];
  }

  createPurchaseOrder(
    supplierId: string,
    items: Omit<PurchaseOrderItem, 'totalPrice' | 'receivedQuantity'>[],
    notes = '',
    expectedDeliveryDays = 7
  ): PurchaseOrder | null {
    const supplier = this.getSupplierById(supplierId);
    if (!supplier) return null;

    const orderItems: PurchaseOrderItem[] = items.map((item) => ({
      ...item,
      totalPrice: item.quantity * item.unitPrice,
      receivedQuantity: 0
    }));

    const subtotal = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const tax = subtotal * 0.16;
    const total = subtotal + tax;

    const order: PurchaseOrder = {
      id: `PO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      orderNumber: `PO-${new Date().getFullYear()}-${String(this.ordersCache.length + 1).padStart(4, '0')}`,
      supplierId,
      supplierName: supplier.name,
      items: orderItems,
      subtotal,
      tax,
      total,
      status: 'draft',
      createdAt: new Date().toISOString(),
      expectedDelivery: new Date(Date.now() + expectedDeliveryDays * 24 * 60 * 60 * 1000).toISOString(),
      notes
    };

    this.ordersCache = [...this.ordersCache, order];
    void this.persistOrders();
    return order;
  }

  updateOrderStatus(orderId: string, status: PurchaseOrder['status']): boolean {
    const order = this.ordersCache.find((entry) => entry.id === orderId);
    if (!order) return false;

    order.status = status;
    if (status === 'fulfilled') {
      order.actualDelivery = new Date().toISOString();
    }

    void this.persistOrders();
    return true;
  }

  generateReorderSuggestions(
    inventoryItems: Array<{
      id: string;
      name: string;
      stock: number;
      reorderPoint: number;
      cost: number;
      category: string;
    }>
  ): ReorderSuggestion[] {
    const suggestions: ReorderSuggestion[] = [];

    inventoryItems.forEach((item) => {
      if (item.stock <= item.reorderPoint) {
        const suppliers = this.getSuppliersByCategory(item.category);
        const suggestedQty = Math.max(item.reorderPoint * 2 - item.stock, 100);

        suggestions.push({
          itemId: item.id,
          itemName: item.name,
          currentStock: item.stock,
          reorderPoint: item.reorderPoint,
          suggestedQuantity: suggestedQty,
          estimatedCost: suggestedQty * item.cost,
          preferredSupplier: suppliers[0],
          alternatives: suppliers.slice(1)
        });
      }
    });

    return suggestions.sort((left, right) => right.estimatedCost - left.estimatedCost);
  }

  sendOrderToSupplier(orderId: string): boolean {
    const order = this.ordersCache.find((entry) => entry.id === orderId);
    if (!order || order.status !== 'draft') return false;

    order.status = 'sent';
    void this.persistOrders();
    return true;
  }

  getOrderById(orderId: string): PurchaseOrder | undefined {
    return this.ordersCache.find((order) => order.id === orderId);
  }

  getOrdersBySupplier(supplierId: string): PurchaseOrder[] {
    return this.ordersCache.filter((order) => order.supplierId === supplierId);
  }

  exportOrdersToCSV(orders?: PurchaseOrder[]): string {
    const data = orders || this.ordersCache;
    const headers = [
      'Order Number', 'Supplier', 'Status', 'Items', 'Subtotal', 'Tax', 'Total',
      'Created', 'Expected Delivery', 'Actual Delivery'
    ];

    const rows = data.map((order) => [
      order.orderNumber,
      `"${order.supplierName}"`,
      order.status,
      order.items.length,
      order.subtotal.toFixed(2),
      order.tax.toFixed(2),
      order.total.toFixed(2),
      order.createdAt.split('T')[0],
      order.expectedDelivery.split('T')[0],
      order.actualDelivery?.split('T')[0] || ''
    ]);

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  }

  requestQuotes(
    itemId: string,
    itemName: string,
    quantity: number,
    category: string
  ): SupplierQuote[] {
    const suppliers = this.getSuppliersByCategory(category);

    this.quotesCache = suppliers.map((supplier, index) => {
      const availability: 'in_stock' | 'limited' | 'out_of_stock' = Math.random() > 0.2 ? 'in_stock' : 'limited';
      const unitPrice = supplier.rating * 100 + Math.random() * 50;
      const total = quantity * unitPrice;

      return {
        id: `QUOTE-${Date.now()}-${index}`,
        supplierId: supplier.id,
        supplierName: supplier.name,
        quoteNumber: `Q-${Date.now()}-${index}`,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items: [{
          itemId,
          itemName,
          unitPrice,
          availability,
          leadTimeDays: supplier.leadTimeDays
        }],
        subtotal: total,
        total,
        currency: 'MWK',
        status: 'pending'
      };
    });

    void this.persistQuotes();
    return [...this.quotesCache];
  }
}

export const supplierIntegrationService = new SupplierIntegrationService();
export default supplierIntegrationService;
