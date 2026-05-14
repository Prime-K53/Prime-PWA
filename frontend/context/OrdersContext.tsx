import React, { createContext, useContext, useEffect, useState } from 'react';
import { useOrdersStore } from '../stores/ordersStore';
import { Order, OrderPayment, OrderItem, Quotation } from '../types';
import { useAuth } from './AuthContext';
import { useSales } from './SalesContext';
import { generateNextId } from '../utils/helpers';
import { customerNotificationService } from '../services/customerNotificationService';
import { aggregateMarketAdjustmentSnapshots, attachPricingBreakdown, summarizePricingBreakdown } from '../utils/pricingBreakdown';

interface OrdersContextType {
  orders: Order[];
  isLoading: boolean;
  fetchOrders: () => Promise<void>;
  createOrder: (data: Partial<Order> & { items: OrderItem[] }) => Promise<void>;
  updateOrderStatus: (id: string, status: Order['status']) => Promise<void>;
  recordPayment: (orderId: string, payment: Partial<OrderPayment>) => Promise<void>;
  cancelOrder: (id: string, reason: string) => Promise<void>;
  getOrderById: (id: string) => Order | undefined;
  convertQuotationToOrder: (quotation: Quotation) => Promise<string>;
}

const OrdersContext = createContext<OrdersContextType | undefined>(undefined);

export const OrdersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { orders, isLoading, fetchOrders, addOrder, updateOrderStatus, recordPayment, cancelOrder } = useOrdersStore();
  const { companyConfig, notify, user } = useAuth();
  const salesContext = useSales();

  useEffect(() => {
    fetchOrders();
  }, []);

  const toNum = (val: any, fallback = 0) => {
    if (typeof val === 'number') return isNaN(val) ? fallback : val;
    if (!val) return fallback;
    const cleaned = String(val).replace(/[^0-9.-]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? fallback : n;
  };

  const findCustomerForNotification = (customerId?: string, customerName?: string) => {
    const normalizedId = String(customerId || '').trim();
    const normalizedName = String(customerName || '').trim().toLowerCase();

    return salesContext?.customers.find((customer) =>
      (normalizedId && String(customer.id || '').trim() === normalizedId)
      || (normalizedName && String(customer.name || '').trim().toLowerCase() === normalizedName)
    );
  };

  const triggerSalesOrderNotification = async (order: Partial<Order> & { id: string; orderNumber?: string; totalAmount?: number; customerName?: string; customerId?: string }) => {
    const customer = findCustomerForNotification(order.customerId, order.customerName);
    if (!customer?.phone) {
      return;
    }

    try {
      await customerNotificationService.triggerNotification('SALES_ORDER', {
        id: order.orderNumber || order.id,
        customerName: order.customerName || customer.name,
        phoneNumber: customer.phone,
        amount: `${companyConfig?.currencySymbol || ''}${Number(order.totalAmount || 0).toLocaleString()}`
      });
    } catch (notificationError) {
      console.error(`[OrdersContext] Failed to trigger sales order notification for ${order.id}`, notificationError);
    }
  };

  const handleConvertQuotationToOrder = async (quotation: Quotation): Promise<string> => {
    try {
      const orderNumber = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      const conversionDate = new Date().toLocaleDateString();
      const acceptedBy = quotation.customerName || 'Customer';
      const conversionDetails = {
        sourceType: 'Quotation',
        sourceNumber: quotation.id,
        date: conversionDate,
        acceptedBy
      };

      const mappedItems = quotation.items.map(item => {
        const unitPrice = toNum((item as any).price || (item as any).unitPrice || (item as any).cost);
        const quantity = toNum((item as any).quantity || (item as any).qty, 0);
        return {
          id: generateNextId('OI', []),
          orderId: '',
          productId: item.id || (item as any).productId || 'N/A',
          productName: item.name || (item as any).productName || (item as any).description || 'N/A',
          quantity,
          unitPrice,
          subtotal: unitPrice * quantity,
          discount: (item as any).discount || 0,
          // ✅ Preserve variant adjustment data for margin tracking
          parentId: (item as any).parentId,
          pagesOverride: (item as any).pagesOverride,
          pricingSource: (item as any).pricingSource,
          adjustmentSnapshots: (item as any).adjustmentSnapshots || [],
          adjustmentTotal: (item as any).adjustmentTotal || 0,
          productionCostSnapshot: (item as any).productionCostSnapshot
        };
      });

      const normalizedMappedItems = mappedItems.map((item: any) => attachPricingBreakdown({
        ...item,
        variantId: item.parentId ? item.productId : item.variantId,
        pricingBreakdown: item.pricingBreakdown,
        smartPricingSnapshot: item.smartPricingSnapshot
      }));
      const pricingSummary = summarizePricingBreakdown(normalizedMappedItems as any[]);
      const subtotal = normalizedMappedItems.reduce((sum, it) => sum + (toNum(it.subtotal)), 0);
      const discount = 0;
      const totalAmount = subtotal - discount;

        const newOrder: Order & Record<string, any> = {
        id: generateNextId('ORD', orders),
        orderNumber,
        customerId: '', // Quotation might not have customerId directly, we might need to look it up by name
        customerName: quotation.customerName,
        orderDate: new Date().toISOString(),
        status: 'Pending',
        subtotal,
        totalAmount,
        discount,
        items: normalizedMappedItems,
        payments: [],
        paidAmount: 0,
        remainingBalance: totalAmount,
        createdBy: user?.id || 'System',
        quotationId: quotation.id,
        notes: [
          `Converted from [Quotation] #[${quotation.id}] on [${conversionDate}] as accepted by [${acceptedBy}]`,
          quotation.notes
        ].filter(Boolean).join('\n'),
        conversionDetails,
        adjustmentSnapshots: aggregateMarketAdjustmentSnapshots(normalizedMappedItems as any[]),
        adjustmentTotal: (quotation as any).adjustmentTotal || pricingSummary.adjustmentTotal,
        materialTotal: (quotation as any).materialTotal || pricingSummary.materialTotal,
        profitMarginTotal: (quotation as any).profitMarginTotal || pricingSummary.profitMarginTotal,
        roundingTotal: (quotation as any).roundingTotal || pricingSummary.roundingTotal,
        roundingDifference: (quotation as any).roundingDifference || pricingSummary.roundingTotal,
        tax: quotation.tax,
        taxRate: quotation.taxRate
      };

      // Try to find customer ID from sales context customers
      if (salesContext) {
        const customer = salesContext.customers.find(c => c.name === quotation.customerName);
        if (customer) {
          newOrder.customerId = customer.id;
        }
      }

      await addOrder(newOrder);
      await triggerSalesOrderNotification(newOrder);

      // Update quotation status to Converted
      if (salesContext) {
        await salesContext.updateQuotation({ ...quotation, status: 'Converted' });
      }

      notify("Quotation converted to Order successfully", "success");
      return newOrder.id;
    } catch (error: any) {
      notify(`Failed to convert quotation: ${error.message}`, "error");
      throw error;
    }
  };

  const handleCreateOrder = async (data: any) => {
    try {
      const orderNumber = `ORD-${Date.now()}`;

      const subtotal = data.items.reduce((sum: number, it: any) => sum + (toNum(it.subtotal || (toNum(it.quantity || it.qty) * toNum(it.unitPrice || it.price || it.cost)))), 0);
      const discount = toNum(data.discount);
      const totalAmount = subtotal - discount;
      const normalizedItems = data.items.map((item: any) => attachPricingBreakdown({
        ...item,
        orderId: '',
        quantity: toNum(item.quantity || item.qty),
        unitPrice: toNum(item.unitPrice || item.price || item.cost),
        subtotal: toNum(item.subtotal || (toNum(item.quantity || item.qty) * toNum(item.unitPrice || item.price || item.cost)))
      }));
      const pricingSummary = summarizePricingBreakdown(normalizedItems as any[]);

      const newOrder: Order = {
        id: generateNextId('ORD', orders),
        orderNumber,
        customerId: data.customerId || '',
        customerName: data.customerName || 'Walking Customer',
        orderDate: new Date().toISOString(),
        status: 'Pending',
        subtotal,
        totalAmount,
        discount,
        items: normalizedItems,
        payments: [],
        paidAmount: 0,
        remainingBalance: totalAmount,
        createdBy: user?.id || 'System',
        notes: data.notes,
        shippingAddress: data.shippingAddress,
        billingAddress: data.billingAddress,
        adjustmentSnapshots: data.adjustmentSnapshots || aggregateMarketAdjustmentSnapshots(normalizedItems as any[]),
        adjustmentTotal: data.adjustmentTotal || pricingSummary.adjustmentTotal,
        materialTotal: data.materialTotal || pricingSummary.materialTotal,
        profitMarginTotal: data.profitMarginTotal || pricingSummary.profitMarginTotal,
        roundingTotal: data.roundingTotal || pricingSummary.roundingTotal,
        roundingDifference: data.roundingDifference || pricingSummary.roundingTotal,
      };

      await addOrder(newOrder);
      await triggerSalesOrderNotification(newOrder);
      notify("Order created successfully", "success");
    } catch (error: any) {
      notify(`Failed to create order: ${error.message}`, "error");
      throw error;
    }
  };

  const handleRecordPayment = async (orderId: string, payment: Partial<OrderPayment>) => {
    try {
      const fullPayment: OrderPayment = {
        id: generateNextId('PAY', []),
        orderId,
        amountPaid: payment.amountPaid || 0,
        paymentMethod: payment.paymentMethod || 'Cash',
        paymentDate: new Date().toISOString(),
        recordedBy: user?.id || 'System',
        reference: payment.reference
      };

      await recordPayment(orderId, fullPayment);
      notify("Payment recorded successfully", "success");
    } catch (error: any) {
      notify(`Failed to record payment: ${error.message}`, "error");
      throw error;
    }
  };

  const handleUpdateStatus = async (id: string, status: Order['status']) => {
    try {
      await updateOrderStatus(id, status);
      notify(`Order status updated to ${status}`, "success");
    } catch (error: any) {
      notify(`Failed to update status: ${error.message}`, "error");
      throw error;
    }
  };

  const handleCancelOrder = async (id: string, reason: string) => {
    try {
      await cancelOrder(id, reason);
      notify("Order cancelled successfully", "success");
    } catch (error: any) {
      notify(`Failed to cancel order: ${error.message}`, "error");
      throw error;
    }
  };

  const getOrderById = (id: string) => orders.find(o => o.id === id);

  return (
    <OrdersContext.Provider value={{
      orders,
      isLoading,
      fetchOrders,
      createOrder: handleCreateOrder,
      updateOrderStatus: handleUpdateStatus,
      recordPayment: handleRecordPayment,
      cancelOrder: handleCancelOrder,
      getOrderById,
      convertQuotationToOrder: handleConvertQuotationToOrder
    }}>
      {children}
    </OrdersContext.Provider>
  );
};

export const useOrders = () => {
  const context = useContext(OrdersContext);
  if (context === undefined) {
    throw new Error('useOrders must be used within an OrdersProvider');
  }
  return context;
};
