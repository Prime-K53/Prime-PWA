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

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  categories: string[]; // e.g., ['Paper', 'Toner', 'Ink']
  rating: number; // 1-5
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

  // Default suppliers for Malawi context
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
    this.initializeSuppliers();
  }

  /**
   * Initialize with default suppliers if empty
   */
  private initializeSuppliers(): void {
    const suppliers = this.getSuppliers();
    if (suppliers.length === 0) {
      localStorage.setItem(this.SUPPLIERS_KEY, JSON.stringify(this.defaultSuppliers));
    }
  }

  /**
   * Get all suppliers
   */
  getSuppliers(): Supplier[] {
    try {
      const stored = localStorage.getItem(this.SUPPLIERS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('[SupplierIntegration] Error loading suppliers:', error);
    }
    return this.defaultSuppliers;
  }

  /**
   * Get suppliers by category
   */
  getSuppliersByCategory(category: string): Supplier[] {
    return this.getSuppliers().filter(s =>
      s.active && s.categories.some(c => c.toLowerCase() === category.toLowerCase())
    );
  }

  /**
   * Get supplier by ID
   */
  getSupplierById(supplierId: string): Supplier | undefined {
    return this.getSuppliers().find(s => s.id === supplierId);
  }

  /**
   * Add a new supplier
   */
  addSupplier(supplier: Omit<Supplier, 'id' | 'createdAt'>): Supplier {
    const suppliers = this.getSuppliers();
    const newSupplier: Supplier = {
      ...supplier,
      id: `SUP-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      createdAt: new Date().toISOString()
    };
    suppliers.push(newSupplier);
    localStorage.setItem(this.SUPPLIERS_KEY, JSON.stringify(suppliers));
    return newSupplier;
  }

  /**
   * Update supplier
   */
  updateSupplier(supplierId: string, updates: Partial<Supplier>): Supplier | null {
    const suppliers = this.getSuppliers();
    const index = suppliers.findIndex(s => s.id === supplierId);
    if (index === -1) return null;

    suppliers[index] = { ...suppliers[index], ...updates };
    localStorage.setItem(this.SUPPLIERS_KEY, JSON.stringify(suppliers));
    return suppliers[index];
  }

  /**
   * Get all purchase orders
   */
  getPurchaseOrders(): PurchaseOrder[] {
    try {
      const stored = localStorage.getItem(this.ORDERS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('[SupplierIntegration] Error loading orders:', error);
    }
    return [];
  }

  /**
   * Create purchase order
   */
  createPurchaseOrder(
    supplierId: string,
    items: Omit<PurchaseOrderItem, 'totalPrice' | 'receivedQuantity'>[],
    notes: string = '',
    expectedDeliveryDays: number = 7
  ): PurchaseOrder | null {
    const supplier = this.getSupplierById(supplierId);
    if (!supplier) return null;

    const orderItems: PurchaseOrderItem[] = items.map(item => ({
      ...item,
      totalPrice: item.quantity * item.unitPrice,
      receivedQuantity: 0
    }));

    const subtotal = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const tax = subtotal * 0.16; // 16% VAT for Malawi
    const total = subtotal + tax;

    const order: PurchaseOrder = {
      id: `PO-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      orderNumber: `PO-${new Date().getFullYear()}-${String(this.getPurchaseOrders().length + 1).padStart(4, '0')}`,
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

    const orders = this.getPurchaseOrders();
    orders.push(order);
    localStorage.setItem(this.ORDERS_KEY, JSON.stringify(orders));

    return order;
  }

  /**
   * Update order status
   */
  updateOrderStatus(orderId: string, status: PurchaseOrder['status']): boolean {
    const orders = this.getPurchaseOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) return false;

    order.status = status;
    if (status === 'fulfilled') {
      order.actualDelivery = new Date().toISOString();
    }

    localStorage.setItem(this.ORDERS_KEY, JSON.stringify(orders));
    return true;
  }

  /**
   * Generate reorder suggestions based on inventory levels
   */
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

    inventoryItems.forEach(item => {
      if (item.stock <= item.reorderPoint) {
        const suppliers = this.getSuppliersByCategory(item.category);
        const suggestedQty = Math.max(
          item.reorderPoint * 2 - item.stock, // Order enough to reach 2x reorder point
          100 // Minimum order quantity
        );

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

    return suggestions.sort((a, b) => b.estimatedCost - a.estimatedCost);
  }

  /**
   * Send order to supplier (simulated)
   */
  sendOrderToSupplier(orderId: string): boolean {
    const orders = this.getPurchaseOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order || order.status !== 'draft') return false;

    order.status = 'sent';
    localStorage.setItem(this.ORDERS_KEY, JSON.stringify(orders));

    // In a real implementation, this would send an email or API call
    // Log to audit trail would go here

    return true;
  }

  /**
   * Get order by ID
   */
  getOrderById(orderId: string): PurchaseOrder | undefined {
    return this.getPurchaseOrders().find(o => o.id === orderId);
  }

  /**
   * Get orders by supplier
   */
  getOrdersBySupplier(supplierId: string): PurchaseOrder[] {
    return this.getPurchaseOrders().filter(o => o.supplierId === supplierId);
  }

  /**
   * Export orders to CSV
   */
  exportOrdersToCSV(orders?: PurchaseOrder[]): string {
    const data = orders || this.getPurchaseOrders();

    const headers = [
      'Order Number', 'Supplier', 'Status', 'Items', 'Subtotal', 'Tax', 'Total',
      'Created', 'Expected Delivery', 'Actual Delivery'
    ];

    const rows = data.map(o => [
      o.orderNumber,
      `"${o.supplierName}"`,
      o.status,
      o.items.length,
      o.subtotal.toFixed(2),
      o.tax.toFixed(2),
      o.total.toFixed(2),
      o.createdAt.split('T')[0],
      o.expectedDelivery.split('T')[0],
      o.actualDelivery?.split('T')[0] || ''
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  /**
   * Simulate quote request to suppliers
   */
  requestQuotes(
    itemId: string,
    itemName: string,
    quantity: number,
    category: string
  ): SupplierQuote[] {
    const suppliers = this.getSuppliersByCategory(category);

    return suppliers.map((supplier, index) => {
      const availability: 'in_stock' | 'limited' | 'out_of_stock' =
        Math.random() > 0.2 ? 'in_stock' : 'limited';
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
        status: 'pending' as const
      };
    });
  }
}

export const supplierIntegrationService = new SupplierIntegrationService();
export default supplierIntegrationService;
