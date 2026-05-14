import { create } from 'zustand';
import { Sale, Quotation, JobOrder, HeldOrder, ZReport, CustomerPayment, Shipment, Customer, SalesExchange, ReprintJob, DeliveryNote, SalesOrder } from '../types';
import { api } from '../services/api';
import { transactionService } from '../services/transactionService';
import { generateNextId } from '../utils/helpers';
import { customerNotificationService } from '../services/customerNotificationService';

const buildDeliveryNotePatchFromShipment = (shipment: Shipment): Partial<DeliveryNote> | undefined => {
  if (!shipment.orderId) return undefined;

  const mappedStatus: DeliveryNote['status'] | undefined =
    shipment.status === 'Delivered'
      ? 'Delivered'
      : shipment.status === 'In Transit'
        ? 'In Transit'
        : undefined;

  return {
    id: shipment.orderId,
    status: mappedStatus,
    carrier: shipment.carrier,
    driverName: shipment.driverName,
    vehicleNo: shipment.vehicleNo,
    trackingNumber: shipment.trackingNumber,
    estimatedDelivery: shipment.estimatedDelivery,
    actualArrival: shipment.actualArrival,
    currentLocation: shipment.currentLocation,
    proofOfDelivery: shipment.proofOfDelivery
  };
};

interface SalesState {
  sales: Sale[];
  quotations: Quotation[];
  jobOrders: JobOrder[];
  heldOrders: HeldOrder[];
  zReports: ZReport[];
  customerPayments: CustomerPayment[];
  shipments: Shipment[];
  customers: Customer[];
  salesExchanges: SalesExchange[];
  salesOrders: SalesOrder[];
  reprintJobs: ReprintJob[];
  isLoading: boolean;

  addSalesOrder: (order: SalesOrder) => Promise<void>;
  updateSalesOrder: (order: SalesOrder) => Promise<void>;
  deleteSalesOrder: (id: string) => Promise<void>;

  fetchSalesData: () => Promise<void>;
  fetchExchanges: () => Promise<void>;
  
  addSale: (sale: Sale) => Promise<void>;
  updateSale: (sale: Sale) => Promise<void>;
  
  addQuotation: (quotation: Quotation) => Promise<void>;
  updateQuotation: (quotation: Quotation) => Promise<void>;
  deleteQuotation: (id: string) => Promise<void>;
  
  addJobOrder: (jobOrder: JobOrder) => Promise<void>;
  updateJobOrder: (jobOrder: JobOrder) => Promise<void>;
  deleteJobOrder: (id: string) => Promise<void>;
  
  addHeldOrder: (order: HeldOrder) => Promise<void>;
  deleteHeldOrder: (id: string) => Promise<void>;
  
  addCustomerPayment: (payment: CustomerPayment) => Promise<void>;
  updateCustomerPayment: (payment: CustomerPayment) => Promise<void>;
  deleteCustomerPayment: (id: string) => Promise<void>;

  addShipment: (shipment: Shipment, deliveryNotePatch?: Partial<DeliveryNote>) => Promise<void>;
  updateShipment: (shipment: Shipment, deliveryNotePatch?: Partial<DeliveryNote>) => Promise<void>;
  deleteShipment: (id: string) => Promise<void>;

  addCustomer: (customer: Customer) => Promise<void>;
  updateCustomer: (customer: Customer) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;

  createSalesExchange: (exchange: any) => Promise<void>;
  approveSalesExchange: (id: string, comments: string) => Promise<void>;
  deleteSalesExchange: (id: string) => Promise<void>;
  cancelSalesExchange: (id: string) => Promise<void>;
  bulkCancelSalesExchanges: (ids: string[]) => Promise<void>;
  updateReprintJob: (id: string, data: any) => Promise<void>;
}

export const useSalesStore = create<SalesState>((set, get) => ({
  sales: [],
  quotations: [],
  jobOrders: [],
  heldOrders: [],
  zReports: [],
  customerPayments: [],
  shipments: [],
  customers: [],
  salesExchanges: [],
  salesOrders: [],
  reprintJobs: [],
  isLoading: false,

  fetchSalesData: async () => {
    set({ isLoading: true });
    try {
      const [sales, quotations, jobOrders, customerPayments, shipments, customers, salesExchanges, reprintJobs, salesOrders] = await Promise.all([
        api.sales.getAllSales(),
        api.sales.getQuotations(),
        api.sales.getJobOrders(),
        api.sales.getCustomerPayments(),
        api.sales.getShipments(),
        api.customers.getAll(),
        api.sales.getSalesExchanges(),
        api.sales.getReprintJobs(),
        api.sales.getSalesOrders()
      ]);

      set({ sales, quotations, jobOrders, customerPayments, shipments, customers, salesExchanges, reprintJobs, salesOrders });
    } catch (error) {
      console.error("Failed to load sales data", error);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchExchanges: async () => {
    try {
      const [salesExchanges, reprintJobs] = await Promise.all([
        api.sales.getSalesExchanges(),
        api.sales.getReprintJobs()
      ]);
      set({ salesExchanges, reprintJobs });
    } catch (error) {
      console.error("Failed to fetch exchanges", error);
    }
  },

  addSale: async (sale) => {
    const newSale = { ...sale, id: sale.id || generateNextId('SALE', get().sales) };
    set(state => ({ sales: [...state.sales, newSale] }));
    await api.sales.createSale(newSale);
    
    // Trigger customer notification
    if (newSale.customerPhone) {
      await customerNotificationService.triggerNotification('SALES_ORDER', {
        id: newSale.id,
        customerName: newSale.customerName,
        phoneNumber: newSale.customerPhone,
        amount: newSale.total ? `${newSale.currency || 'KES'} ${Number(newSale.total).toLocaleString()}` : '',
      });
    }
  },
  updateSale: async (sale) => {
    set(state => ({ sales: state.sales.map(s => s.id === sale.id ? sale : s) }));
    await transactionService.updateSale(sale);
  },

  addQuotation: async (quotation) => {
    const newQuotation = { ...quotation, id: quotation.id || generateNextId('QTN', get().quotations) };
    set(state => ({ quotations: [...state.quotations, newQuotation] }));
    await api.sales.saveQuotation(newQuotation);
    
    // Trigger customer notification
    if (newQuotation.customerPhone) {
      await customerNotificationService.triggerNotification('QUOTATION', {
        id: newQuotation.id,
        customerName: newQuotation.customerName,
        phoneNumber: newQuotation.customerPhone,
        amount: newQuotation.total ? `${newQuotation.currency || 'KES'} ${Number(newQuotation.total).toLocaleString()}` : '',
      });
    }
  },
  updateQuotation: async (quotation) => {
    set(state => ({ quotations: state.quotations.map(q => q.id === quotation.id ? quotation : q) }));
    await api.sales.saveQuotation(quotation);
  },
  deleteQuotation: async (id) => {
    set(state => ({ quotations: state.quotations.filter(q => q.id !== id) }));
    await api.sales.deleteQuotation(id);
  },

  addJobOrder: async (jobOrder) => {
    const newJob = { ...jobOrder, id: jobOrder.id || generateNextId('JO', get().jobOrders) };
    set(state => ({ jobOrders: [...state.jobOrders, newJob] }));
    await api.sales.saveJobOrder(newJob);
  },
  updateJobOrder: async (jobOrder) => {
    set(state => ({ jobOrders: state.jobOrders.map(j => j.id === jobOrder.id ? jobOrder : j) }));
    await api.sales.saveJobOrder(jobOrder);
  },
  deleteJobOrder: async (id) => {
    set(state => ({ jobOrders: state.jobOrders.filter(j => j.id !== id) }));
    await api.sales.deleteJobOrder(id);
  },

  addHeldOrder: async (order) => {
      const newOrder = { ...order, id: order.id || generateNextId('HELD', get().heldOrders) };
      set(state => ({ heldOrders: [...state.heldOrders, newOrder] }));
  },
  deleteHeldOrder: async (id) => {
      set(state => ({ heldOrders: state.heldOrders.filter(h => h.id !== id) }));
  },

addCustomerPayment: async (payment) => {
      const newPayment = { ...payment, id: payment.id || generateNextId('RCPT', get().customerPayments) };
      set(state => ({ customerPayments: [...state.customerPayments, newPayment] }));
      await api.sales.saveCustomerPayment(newPayment);
      
      // Trigger customer notification
      if (newPayment.customerPhone) {
        await customerNotificationService.triggerNotification('PAYMENT', {
          id: newPayment.id,
          customerName: newPayment.customerName,
          phoneNumber: newPayment.customerPhone,
          amount: newPayment.amount ? `${newPayment.currency || 'KES'} ${Number(newPayment.amount).toLocaleString()}` : '',
        });
      }
    },
  updateCustomerPayment: async (payment) => {
      set(state => ({ customerPayments: state.customerPayments.map(p => p.id === payment.id ? payment : p) }));
      await api.sales.saveCustomerPayment(payment);
  },
  deleteCustomerPayment: async (id) => {
      set(state => ({ customerPayments: state.customerPayments.filter(p => p.id !== id) }));
      await api.sales.deleteCustomerPayment(id);
  },

  addShipment: async (shipment, deliveryNotePatch) => {
    const newShipment = { ...shipment, id: shipment.id || generateNextId('SHP', get().shipments) };
    set(state => ({ shipments: [...state.shipments, newShipment] }));
    await transactionService.updateShipmentStatus(newShipment, deliveryNotePatch || buildDeliveryNotePatchFromShipment(newShipment));
  },

  updateShipment: async (shipment, deliveryNotePatch) => {
    set(state => ({ shipments: state.shipments.map(s => s.id === shipment.id ? shipment : s) }));
    await transactionService.updateShipmentStatus(shipment, deliveryNotePatch || buildDeliveryNotePatchFromShipment(shipment));
  },

  deleteShipment: async (id) => {
    set(state => ({ shipments: state.shipments.filter(s => s.id !== id) }));
    await api.sales.deleteShipment(id);
  },

  addCustomer: async (customer) => {
    const newCustomer = { ...customer, id: customer.id || generateNextId('CUST', get().customers) };
    set(state => ({ customers: [...state.customers, newCustomer] }));
    await api.customers.save(newCustomer);
  },
  updateCustomer: async (customer) => {
    set(state => ({ customers: state.customers.map(c => c.id === customer.id ? customer : c) }));
    await api.customers.save(customer);
  },
  deleteCustomer: async (id) => {
    set(state => ({ customers: state.customers.filter(c => c.id !== id) }));
    await api.customers.delete(id);
  },

  addSalesOrder: async (order) => {
    const newOrder = { ...order, id: order.id || generateNextId('SO', get().salesOrders) };
    set(state => ({ salesOrders: [...state.salesOrders, newOrder] }));
    await api.sales.saveSalesOrder(newOrder);
  },
  updateSalesOrder: async (order) => {
    set(state => ({ salesOrders: state.salesOrders.map(o => o.id === order.id ? order : o) }));
    await api.sales.saveSalesOrder(order);
  },
  deleteSalesOrder: async (id) => {
    set(state => ({ salesOrders: state.salesOrders.filter(o => o.id !== id) }));
    await api.sales.deleteSalesOrder(id);
  },

  createSalesExchange: async (exchange) => {
    try {
      await api.sales.createSalesExchange(exchange);
      await get().fetchExchanges();
    } catch (error) {
      console.error('createSalesExchange error:', error);
      throw error; // Re-throw to let the caller handle it
    }
  },
  approveSalesExchange: async (id, comments) => {
    await api.sales.approveSalesExchange(id, comments);
    await get().fetchExchanges();
  },
  deleteSalesExchange: async (id) => {
    await api.sales.deleteSalesExchange(id);
    await get().fetchExchanges();
  },
  cancelSalesExchange: async (id) => {
    await api.sales.cancelSalesExchange(id);
    await get().fetchExchanges();
  },
  bulkCancelSalesExchanges: async (ids) => {
    await transactionService.bulkCancelSalesExchanges(ids);
    await get().fetchExchanges();
  },
  updateReprintJob: async (id, data) => {
    await api.sales.updateReprintJob(id, data);
    await get().fetchExchanges();
  }
}));
