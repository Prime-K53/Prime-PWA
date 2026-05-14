import { Invoice } from '../types';
import { api } from './api';
import { dbService } from './db';
import { transactionService } from './transactionService';
import { ExaminationGeneratedInvoicePayload } from './examinationBatchService';

export interface ExaminationInvoiceSyncResult {
  synced: boolean;
  fallbackUsed: boolean;
  invoiceId: string | null;
  message?: string;
}

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeInvoiceStatus = (status: unknown): Invoice['status'] => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'draft') return 'Draft';
  if (normalized === 'paid') return 'Paid';
  if (normalized === 'partial' || normalized === 'partially_paid') return 'Partial';
  if (normalized === 'overdue') return 'Overdue';
  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'void') return 'Cancelled';
  return 'Unpaid';
};

const mapLineItems = (payload: ExaminationGeneratedInvoicePayload) => {
  const rows = Array.isArray(payload?.items) ? payload.items : [];
  if (rows.length === 0) {
    return [
      {
        id: `EXM-ITEM-${payload.id}`,
        itemId: `EXM-ITEM-${payload.id}`,
        name: 'Examination Service',
        sku: `EXM-${payload.id}`,
        description: `Examination invoice ${payload.invoiceNumber}`,
        category: 'Examination',
        type: 'Service' as const,
        unit: 'job',
        minStockLevel: 0,
        stock: 0,
        reserved: 0,
        price: toNumber(payload.totalAmount),
        cost: toNumber(payload.totalAmount),
        quantity: 1,
        total: toNumber(payload.totalAmount)
      }
    ];
  }

  return rows.map((row, index) => ({
    id: String(row?.id || `EXM-ITEM-${payload.id}-${index + 1}`),
    itemId: String(row?.itemId || row?.id || `EXM-ITEM-${payload.id}-${index + 1}`),
    name: String(row?.name || `Examination Service ${index + 1}`),
    sku: String(row?.sku || `EXM-${payload.id}-${index + 1}`),
    description: String(row?.description || ''),
    category: String(row?.category || 'Examination'),
    type: 'Service' as const,
    unit: String(row?.unit || 'job'),
    minStockLevel: toNumber(row?.minStockLevel, 0),
    stock: toNumber(row?.stock, 0),
    reserved: toNumber(row?.reserved, 0),
    price: toNumber(row?.price, toNumber(row?.total)),
    cost: toNumber(row?.cost, toNumber(row?.price, toNumber(row?.total))),
    quantity: Math.max(1, toNumber(row?.quantity, 1)),
    total: toNumber(row?.total, toNumber(row?.price) * Math.max(1, toNumber(row?.quantity, 1)))
  }));
};

const allocateAmounts = (totals: number[], target: number) => {
  if (totals.length === 0) return [];
  const safeTarget = toNumber(target, 0);
  const baseTotal = totals.reduce((sum, value) => sum + value, 0);
  let running = 0;

  return totals.map((value, index) => {
    const allocation = index === totals.length - 1
      ? Number((safeTarget - running).toFixed(2))
      : Number(((baseTotal > 0 ? value / baseTotal : 1 / totals.length) * safeTarget).toFixed(2));
    running = Number((running + allocation).toFixed(2));
    return allocation;
  });
};

const enrichInvoiceWithBatchPricing = (
  invoice: Invoice & Record<string, unknown>,
  batch: any
) => {
  const classes = Array.isArray(batch?.classes) ? batch.classes : [];
  const materialTotal = Number(classes.reduce((sum: number, cls: any) => sum + toNumber(cls?.material_total_cost, 0), 0).toFixed(2));
  const marketAdjustmentTotal = Number(classes.reduce((sum: number, cls: any) => sum + toNumber(cls?.market_adjustment_total ?? cls?.adjustment_total_cost, 0), 0).toFixed(2));
  const roundingAdjustmentTotal = Number(classes.reduce((sum: number, cls: any) => sum + toNumber(cls?.rounding_adjustment, 0), 0).toFixed(2));
  const roundingTotal = roundingAdjustmentTotal !== 0 ? roundingAdjustmentTotal : toNumber(invoice.roundingTotal ?? invoice.roundingDifference, 0);

  const classTotals = classes.map((cls: any) => {
    const learners = Math.max(1, toNumber(cls?.number_of_learners, 1));
    return toNumber(
      cls?.live_total_preview,
      toNumber(cls?.final_fee_per_learner ?? cls?.price_per_learner, 0) * learners
    );
  });
  const totalRevenue = Number(classTotals.reduce((sum: number, value: number) => sum + value, 0).toFixed(2));
  const roundedAllocations = roundingAdjustmentTotal === 0 ? allocateAmounts(classTotals, roundingTotal) : [];
  const totalAdjustmentBase = marketAdjustmentTotal > 0 ? marketAdjustmentTotal : classTotals.reduce((sum, value) => sum + value, 0);
  const rawSnapshots = Array.isArray(invoice.adjustmentSnapshots) ? invoice.adjustmentSnapshots : [];

  const items = classes.map((cls: any, index: number) => {
    const quantity = Math.max(1, toNumber(cls?.number_of_learners, 1));
    const revenue = Number(classTotals[index].toFixed(2));
    const material = Number(toNumber(cls?.material_total_cost, 0).toFixed(2));
    const adjustment = Number(toNumber(cls?.market_adjustment_total ?? cls?.adjustment_total_cost, 0).toFixed(2));
    const rounding = roundingAdjustmentTotal !== 0 
      ? Number(toNumber(cls?.rounding_adjustment, 0).toFixed(2))
      : Number((roundedAllocations[index] || 0).toFixed(2));
    const profit = Number((revenue - material - adjustment - rounding).toFixed(2));
    const adjustmentWeight = totalAdjustmentBase > 0
      ? adjustment / totalAdjustmentBase
      : (totalRevenue > 0 ? revenue / totalRevenue : 0);
    const scaledAdjustmentSnapshots = rawSnapshots.map((snapshot: any) => ({
      ...snapshot,
      calculatedAmount: Number((toNumber(snapshot?.calculatedAmount ?? snapshot?.amount ?? snapshot?.value, 0) * adjustmentWeight).toFixed(2))
    }));

    return {
      id: String(cls?.id || `EXM-ITEM-${invoice.id}-${index + 1}`),
      itemId: String(cls?.id || `EXM-ITEM-${invoice.id}-${index + 1}`),
      name: String(cls?.class_name || `Class ${index + 1}`),
      sku: `EXM-CLASS-${String(cls?.id || index + 1)}`,
      description: `${Array.isArray(cls?.subjects) ? cls.subjects.length : 0} subject(s)`,
      category: 'Examination',
      type: 'Service' as const,
      unit: 'learner',
      minStockLevel: 0,
      stock: 0,
      reserved: 0,
      price: Number((quantity > 0 ? revenue / quantity : revenue).toFixed(2)),
      cost: Number((quantity > 0 ? material / quantity : material).toFixed(2)),
      quantity,
      total: revenue,
      adjustmentSnapshots: scaledAdjustmentSnapshots,
      adjustmentTotal: Number((quantity > 0 ? adjustment / quantity : adjustment).toFixed(2)),
      pricingBreakdown: {
        paperCost: 0,
        tonerCost: 0,
        finishingCost: 0,
        baseMaterialCost: Number((quantity > 0 ? material / quantity : material).toFixed(2)),
        adjustmentTotal: Number((quantity > 0 ? adjustment / quantity : adjustment).toFixed(2)),
        adjustmentLines: scaledAdjustmentSnapshots.map((snapshot: any) => ({
          name: String(snapshot?.name || 'Adjustment'),
          type: String(snapshot?.type || 'FIXED'),
          value: toNumber(snapshot?.value ?? snapshot?.percentage ?? snapshot?.calculatedAmount, 0)
        })),
        profitMarginAmount: Number((quantity > 0 ? profit / quantity : profit).toFixed(2)),
        marginType: 'fixed_amount' as const,
        marginValue: Number((quantity > 0 ? profit / quantity : profit).toFixed(2)),
        roundingDifference: Number((quantity > 0 ? rounding / quantity : rounding).toFixed(2)),
        wasRounded: Math.abs(rounding) > 0.0001,
        roundingMethod: String(invoice.roundingMethod || 'nearest_50'),
        sellingPrice: Number((quantity > 0 ? revenue / quantity : revenue).toFixed(2)),
        copies: quantity
      }
    };
  });

  return {
    ...invoice,
    items,
    materialTotal,
    adjustmentTotal: marketAdjustmentTotal,
    profitMarginTotal: Number((totalRevenue - materialTotal - marketAdjustmentTotal - roundingTotal).toFixed(2)),
    roundingTotal
  };
};

export const mapExaminationPayloadToInvoice = (
  payload: ExaminationGeneratedInvoicePayload
): Invoice & Record<string, unknown> => {
  const date = payload?.date || new Date().toISOString();
  const dueDate = payload?.dueDate || new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString();
  const totalAmount = toNumber(payload?.totalAmount);
  const paidAmount = Math.max(0, Math.min(totalAmount, toNumber(payload?.paidAmount)));
  const sourceBatchNumber = String(payload?.batchId || payload?.origin_batch_id || '').trim();
  const acceptedBy = payload?.schoolName || payload?.customerName || 'Customer';

  return {
    id: String(payload?.id),
    date,
    dueDate,
    customerId: String(payload?.customerId || ''),
    customerName: String(payload?.customerName || 'Unknown Customer'),
    totalAmount,
    paidAmount,
    status: normalizeInvoiceStatus(payload?.status),
    items: mapLineItems(payload) as any,
    subtotal: toNumber(payload?.preRoundingTotalAmount, totalAmount),
    materialTotal: toNumber(payload?.materialTotal, 0),
    adjustmentTotal: toNumber(payload?.adjustmentTotal, 0),
    adjustmentSnapshots: Array.isArray(payload?.adjustmentSnapshots) ? payload.adjustmentSnapshots : [],
    roundingDifference: toNumber(payload?.roundingDifference, 0),
    roundingTotal: toNumber(payload?.roundingDifference, 0),
    profitMarginTotal: Number((
      toNumber(payload?.preRoundingTotalAmount, totalAmount)
      - toNumber(payload?.materialTotal, 0)
      - toNumber(payload?.adjustmentTotal, 0)
    ).toFixed(2)),
    roundingMethod: payload?.roundingMethod || 'nearest_50',
    applyRounding: Boolean(payload?.applyRounding),
    classBreakdown: Array.isArray(payload?.classBreakdown) ? payload.classBreakdown : [],
    schoolName: payload?.schoolName || payload?.customerName,
    academicYear: payload?.academicYear,
    term: payload?.term,
    examType: payload?.examType,
    batchId: payload?.batchId || payload?.origin_batch_id || '',
    preRoundingTotalAmount: toNumber(payload?.preRoundingTotalAmount, totalAmount),
    documentTitle: payload?.documentTitle || 'Service Invoice',
    subAccountName: payload?.subAccountName || undefined,
    notes: payload?.notes || `Generated from examination batch ${payload?.origin_batch_id || ''}`,
    reference: payload?.reference || payload?.invoiceNumber || undefined,
    isConverted: Boolean(sourceBatchNumber),
    conversionDetails: sourceBatchNumber ? {
      sourceType: 'Examination Batch',
      sourceNumber: sourceBatchNumber,
      date: new Date(date).toLocaleDateString(),
      acceptedBy
    } : undefined,
    originModule: payload?.origin_module || 'examination',
    origin_module: payload?.origin_module || 'examination',
    category: 'Examination',
    originBatchId: payload?.origin_batch_id || '',
    origin_batch_id: payload?.origin_batch_id || '',
    backendInvoiceId: payload?.backendInvoiceId || '',
    invoiceNumber: payload?.invoiceNumber || '',
    currency: payload?.currency || 'MWK'
  };
};

export const persistExaminationInvoiceToFinance = async (
  payload?: ExaminationGeneratedInvoicePayload
): Promise<ExaminationInvoiceSyncResult> => {
  if (!payload) {
    return { synced: false, fallbackUsed: false, invoiceId: null, message: 'No invoice payload to sync.' };
  }

  let invoice = mapExaminationPayloadToInvoice(payload);
  const batchId = String(payload?.batchId || payload?.origin_batch_id || '').trim();
  if (batchId) {
    const localBatch = await dbService.get<any>('examinationBatches', batchId);
    if (localBatch) {
      invoice = enrichInvoiceWithBatchPricing(invoice, localBatch);
    }
  }

  try {
    await api.finance.saveInvoice(invoice as any);
    return { synced: true, fallbackUsed: false, invoiceId: String(invoice.id) };
  } catch (error: any) {
    // Finance API failed - attempt local fallback: save invoice and post via transactionService
    let savedLocally = false;
    try {
      await dbService.put('invoices', invoice as any);
      savedLocally = true;
    } catch (fallbackError: any) {
      // If saving locally fails, return failure
      return {
        synced: false,
        fallbackUsed: true,
        invoiceId: null,
        message: fallbackError?.message || error?.message || 'Failed to sync invoice to local finance store.'
      };
    }

    // Try to process the invoice locally to ensure ledger entries are created
    try {
      await transactionService.processInvoice(invoice as any);
      return {
        synced: true,
        fallbackUsed: true,
        invoiceId: String(invoice.id),
        message: error?.message || 'Finance API save failed; invoice saved locally and ledger posted.'
      };
    } catch (txError: any) {
      // Clean up idempotency key on failure so retry can work
      const idempotencyKey = (invoice as any)?.idempotencyKey || `invoice:${invoice.id}`;
      try {
        await dbService.executeAtomicOperation(
          ['idempotencyKeys'],
          async (tx) => {
            const store = tx.objectStore('idempotencyKeys');
            await store.delete(idempotencyKey);
          }
        );
      } catch (cleanupError) {
        // Ignore cleanup errors - non-critical
        console.warn('[ExaminationInvoice] Failed to cleanup idempotency key:', cleanupError);
      }

      // Ledger posting failed, but invoice is saved locally
      return {
        synced: true,
        fallbackUsed: true,
        invoiceId: savedLocally ? String(invoice.id) : null,
        message: txError?.message || error?.message || 'Finance API save failed; invoice saved locally but ledger posting failed.'
      };
    }
  }
};
