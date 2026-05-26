import {
  CustomerPayment,
  CustomerReceiptSnapshot,
  ReceiptPaymentStatus,
  Sale,
  SupplierPayment
} from '../types';
import { roundMoney } from '../utils/roundingUtils';

const EPSILON = 0.000001;

const round2 = roundMoney;

const toIsoDate = (date?: string): string => {
  if (!date) return new Date().toISOString();
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
};

const toDisplayDate = (date?: string): string => {
  const parsed = date ? new Date(date) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date().toLocaleDateString('en-GB');
  return parsed.toLocaleDateString('en-GB');
};

export interface CustomerReceiptInvoiceInput {
  invoiceId: string;
  allocationAmount: number;
  outstandingAmount?: number;
}

export interface CalculateCustomerPaymentSnapshotInput {
  amountTendered: number;
  appliedInvoices: CustomerReceiptInvoiceInput[];
  excessHandling?: 'Change' | 'Wallet';
  paymentPurpose?: CustomerReceiptSnapshot['paymentPurpose'];
  paymentDate?: string;
  customerName?: string;
}

const resolvePaymentStatus = (
  invoiceTotalAtPosting: number,
  amountApplied: number,
  walletDeposit: number
): ReceiptPaymentStatus => {
  if (invoiceTotalAtPosting <= EPSILON) {
    return walletDeposit > EPSILON ? 'Overpaid' : 'Paid';
  }
  if (walletDeposit > EPSILON) return 'Overpaid';
  if (amountApplied >= invoiceTotalAtPosting - EPSILON) return 'Paid';
  return 'Partial';
};

/** Maps the internal ReceiptPaymentStatus to the uppercase strings expected by the PDF ReceiptSchema. */
const toSchemaPaymentStatus = (
  status: ReceiptPaymentStatus | undefined
): 'PAID' | 'PARTIALLY PAID' | 'OVERPAID' | undefined => {
  if (!status) return undefined;
  if (status === 'Paid') return 'PAID';
  if (status === 'Partial') return 'PARTIALLY PAID';
  if (status === 'Overpaid') return 'OVERPAID';
  // Passthrough if already in schema format
  const upper = status.toUpperCase() as string;
  if (upper === 'PAID' || upper === 'PARTIALLY PAID' || upper === 'OVERPAID') {
    return upper as 'PAID' | 'PARTIALLY PAID' | 'OVERPAID';
  }
  return undefined;
};

const inferPaymentPurpose = (
  inputPurpose: CustomerReceiptSnapshot['paymentPurpose'] | undefined,
  appliedCount: number,
  walletDeposit: number
): CustomerReceiptSnapshot['paymentPurpose'] => {
  if (inputPurpose) return inputPurpose;
  if (appliedCount > 0) return 'INVOICE_PAYMENT';
  if (walletDeposit > EPSILON) return 'WALLET_TOPUP';
  return 'UNALLOCATED_PAYMENT';
};

const buildNarrative = (
  snapshot: CustomerReceiptSnapshot,
  customerName: string,
  currencySymbol: string
): string => {
  const date = toDisplayDate(snapshot.generatedAt);
  const fmt = (v: number) => `${currencySymbol} ${round2(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const invoiceList = snapshot.appliedInvoices.length > 0 ? snapshot.appliedInvoices.join(', ') : 'unallocated invoices';

  if (snapshot.paymentPurpose === 'WALLET_TOPUP') {
    return `Receipt acknowledgment for wallet top-up of ${fmt(snapshot.amountTendered)} received from ${customerName} on ${date}.`;
  }

  if (snapshot.paymentStatus === 'Partial') {
    return `This receipt confirms payment of ${fmt(snapshot.amountTendered)} from ${customerName} on ${date} toward invoice(s) ${invoiceList}. Outstanding balance is ${fmt(snapshot.balanceDueAfterPayment)}.`;
  }

  if (snapshot.paymentStatus === 'Overpaid' && snapshot.walletDeposit > 0) {
    return `Payment of ${fmt(snapshot.amountTendered)} from ${customerName} on ${date} was received for invoice(s) ${invoiceList}. Excess amount ${fmt(snapshot.walletDeposit)} has been credited to wallet.`;
  }

  return `Receipt acknowledgment for payment of ${fmt(snapshot.amountTendered)} received from ${customerName} on ${date} for invoice(s) ${invoiceList}.`;
};

export const calculateCustomerPaymentSnapshot = (
  input: CalculateCustomerPaymentSnapshotInput
): CustomerReceiptSnapshot => {
  const amountTendered = round2(input.amountTendered);
  const normalizedInvoices = (input.appliedInvoices || [])
    .map(invoice => ({
      invoiceId: invoice.invoiceId,
      allocationAmount: round2(invoice.allocationAmount),
      outstandingAmount: round2(invoice.outstandingAmount ?? invoice.allocationAmount)
    }))
    .filter(invoice => invoice.allocationAmount > 0);

  const amountApplied = round2(
    normalizedInvoices.reduce((sum, invoice) => sum + invoice.allocationAmount, 0)
  );
  const invoiceTotalAtPosting = round2(
    normalizedInvoices.reduce((sum, invoice) => sum + invoice.outstandingAmount, 0)
  );

  if (amountApplied - amountTendered > EPSILON) {
    throw new Error(
      `Invalid payment allocation: allocated amount (${amountApplied}) exceeds amount tendered (${amountTendered}).`
    );
  }

  const unapplied = round2(Math.max(0, amountTendered - amountApplied));
  const shouldWalletDeposit = input.excessHandling === 'Wallet';
  const walletDeposit = round2(shouldWalletDeposit ? unapplied : 0);
  const changeGiven = round2(shouldWalletDeposit ? 0 : unapplied);
  const amountRetained = round2(amountTendered - changeGiven);
  const balanceDueAfterPayment = round2(Math.max(0, invoiceTotalAtPosting - amountApplied));
  const paymentStatus = resolvePaymentStatus(invoiceTotalAtPosting, amountApplied, walletDeposit);
  const purpose = inferPaymentPurpose(input.paymentPurpose, normalizedInvoices.length, walletDeposit);

  return {
    generatedAt: toIsoDate(input.paymentDate),
    paymentPurpose: purpose,
    amountTendered,
    amountApplied,
    changeGiven,
    walletDeposit,
    amountRetained,
    invoiceTotalAtPosting,
    balanceDueAfterPayment,
    appliedInvoices: normalizedInvoices.map(invoice => invoice.invoiceId),
    paymentStatus,
    confidence: 'exact',
    calculationVersion: 1
  };
};

export interface BuildCustomerReceiptDocInput {
  payment: CustomerPayment;
  customerName?: string;
  snapshot?: CustomerReceiptSnapshot;
  currencySymbol?: string;
  currentBalance?: number;
}

export const buildCustomerReceiptDoc = ({
  payment,
  customerName,
  snapshot,
  currencySymbol = 'K',
  currentBalance = 0
}: BuildCustomerReceiptDocInput) => {
  const snap = snapshot || payment.receiptSnapshot || calculateCustomerPaymentSnapshot({
    amountTendered: payment.amount,
    appliedInvoices: (payment.allocations || []).map((allocation: any) => ({
      invoiceId: allocation.invoiceId,
      allocationAmount: allocation.amount
    })),
    excessHandling: payment.excessHandling,
    paymentDate: payment.date
  });

  const resolvedCustomerName = customerName || payment.customerName || 'Customer';
  const narrative = snap.narrative || buildNarrative(snap, resolvedCustomerName, currencySymbol);

  return {
    receiptNumber: payment.id,
    date: toDisplayDate(payment.date),
    customerName: resolvedCustomerName,
    amountReceived: round2(snap.amountTendered),
    amountApplied: round2(snap.amountApplied),
    amountRetained: round2(snap.amountRetained),
    changeGiven: round2(snap.changeGiven),
    paymentMethod: payment.paymentMethod,
    appliedInvoices: snap.appliedInvoices,
    invoiceTotal: round2(snap.invoiceTotalAtPosting),
    paymentStatus: toSchemaPaymentStatus(snap.paymentStatus),
    balanceDue: round2(snap.balanceDueAfterPayment),
    overpaymentAmount: round2(snap.walletDeposit),
    walletDeposit: round2(snap.walletDeposit),
    narrative,
    currentBalance: round2(currentBalance),
    calculationVersion: snap.calculationVersion || 1
  };
};

export interface BuildPosReceiptDocInput {
  sale: Sale;
  cashierName: string;
  customerName?: string;
  itemDescriptionFormatter?: (item: any) => string;
  footerMessage?: string;
  companyConfig?: any;
}

export const buildPosReceiptDoc = ({
  sale,
  cashierName,
  customerName,
  itemDescriptionFormatter,
  footerMessage,
  companyConfig
}: BuildPosReceiptDocInput) => {
  const totalPaid = round2(
    (sale.payments && sale.payments.length > 0)
      ? sale.payments.reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0)
      : Number(sale.cash_tendered || sale.totalAmount || 0)
  );
  const totalAmount = round2(Number(sale.totalAmount || 0));
  const discount = round2(Number(sale.discount || 0));
  const subtotal = round2(Number(sale.subtotal ?? totalAmount + discount));
  const changeGiven = round2(Number(sale.change_due ?? Math.max(totalPaid - totalAmount, 0)));

  return {
    receiptNumber: sale.id,
    date: toDisplayDate(sale.date),
    cashierName: cashierName || 'Cashier',
    customerName: customerName || sale.customerName || 'Walk-in Customer',
    items: (sale.items || []).map((item: any) => ({
      desc: itemDescriptionFormatter ? itemDescriptionFormatter(item) : (item.name || item.productName || 'Item'),
      qty: Number(item.quantity || 0),
      price: round2(Number(item.price || item.unitPrice || 0)),
      total: round2(Number((item.quantity || 0) * (item.price || item.unitPrice || 0)))
    })),
    subtotal,
    discount,
    tax: 0,
    totalAmount,
    paymentMethod: sale.paymentMethod || 'Cash',
    amountTendered: totalPaid,
    changeGiven,
    payments: (sale.payments || []).map((payment: any) => ({
      method: payment.method,
      amount: round2(Number(payment.amount || 0)),
      accountId: payment.accountId
    })),
    footerMessage: footerMessage || companyConfig?.transactionSettings?.pos?.receiptFooter,
    companyInfo: {
      name: companyConfig?.companyName || 'Prime ERP',
      address: companyConfig?.addressLine1 || '',
      phone: companyConfig?.phone || '',
      email: companyConfig?.email || '',
      website: companyConfig?.website || '',
      footerMessage: footerMessage || companyConfig?.transactionSettings?.pos?.receiptFooter
    }
  };
};

export const buildSupplierPaymentDoc = (
  payment: SupplierPayment,
  supplierName: string
) => {
  return {
    paymentId: payment.id,
    date: toDisplayDate(payment.date),
    supplierName,
    amountPaid: round2(payment.amount),
    paymentMethod: payment.paymentMethod,
    appliedInvoices: (payment.allocations || []).map((allocation: any) => allocation.purchaseId),
    narrative: payment.notes
  };
};
