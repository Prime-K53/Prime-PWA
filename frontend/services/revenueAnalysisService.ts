import { attachPricingBreakdown, getMarketAdjustmentSnapshots } from '../utils/pricingBreakdown';

export type RevenueSource = 'POS' | 'ORDER_FORM' | 'EXAMINATION';

export interface RevenueAdjustmentLedgerRow {
  source: RevenueSource;
  adjustmentName: string;
  totalAmount: number;
  applicationCount: number;
  transactionCount: number;
}

export interface RevenueItemPerformanceRow {
  source: RevenueSource;
  itemName: string;
  quantity: number;
  revenue: number;
  materialCost: number;
  adjustmentTotal: number;
  profitMargin: number;
  roundingTotal: number;
  grossGain: number;
}

export interface RevenueAnalysisLine {
  lineId: string;
  source: RevenueSource;
  transactionId: string;
  transactionNumber: string;
  transactionType: string;
  date: string;
  status: string;
  customerName: string;
  subAccountName: string;
  itemId: string;
  itemName: string;
  quantity: number;
  revenue: number;
  materialCost: number;
  adjustmentTotal: number;
  profitMargin: number;
  roundingTotal: number;
  grossGain: number;
  reconciliationDelta: number;
  adjustmentLines: Array<{ name: string; amount: number }>;
}

export interface RevenueAnalysisTransaction {
  key: string;
  source: RevenueSource;
  transactionId: string;
  transactionNumber: string;
  transactionType: string;
  date: string;
  status: string;
  customerName: string;
  subAccountName: string;
  lineCount: number;
  quantity: number;
  revenue: number;
  materialCost: number;
  adjustmentTotal: number;
  profitMargin: number;
  roundingTotal: number;
  grossGain: number;
  reconciliationDelta: number;
}

export interface RevenueSourceSummary {
  source: RevenueSource | 'ALL';
  transactionCount: number;
  lineCount: number;
  quantity: number;
  revenue: number;
  materialCost: number;
  adjustmentTotal: number;
  profitMargin: number;
  roundingTotal: number;
  grossGain: number;
  reconciliationDelta: number;
}

export interface RevenueAnalysisDataset {
  lines: RevenueAnalysisLine[];
  transactions: RevenueAnalysisTransaction[];
  sourceSummaries: RevenueSourceSummary[];
  adjustmentLedger: RevenueAdjustmentLedgerRow[];
  itemPerformance: RevenueItemPerformanceRow[];
}

const roundMoney = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toQuantity = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
};

const toDateKey = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : raw;
};

const sourceLabel = (source: RevenueSource | 'ALL') => {
  if (source === 'POS') return 'POS';
  if (source === 'ORDER_FORM') return 'Order Form';
  if (source === 'EXAMINATION') return 'Examination';
  return 'All Modules';
};

const getTransactionNumber = (transaction: any) => {
  return String(
    transaction?.invoiceNumber
    || transaction?.orderNumber
    || transaction?.saleNumber
    || transaction?.id
    || 'UNKNOWN'
  );
};

const isRecognizedSale = (sale: any) => {
  const status = String(sale?.status || '').toLowerCase();
  return (
    status === 'paid' ||
    status === 'completed' ||
    status === 'partial' ||
    status === 'partially paid' ||
    status === 'overpaid'
  );
};

const isPosMirrorInvoice = (invoice: any, recognizedSaleIds: Set<string>) => {
  const noteText = String(invoice?.notes || '').trim().toLowerCase();
  const origin = String(invoice?.originModule || invoice?.origin_module || invoice?.source || '').trim().toLowerCase();
  const conversionType = String(invoice?.conversionDetails?.sourceType || '').trim().toLowerCase();
  const reference = String(invoice?.reference || '').trim();
  const invoiceId = String(invoice?.id || '').trim();

  return origin === 'pos'
    || conversionType === 'sale'
    || noteText.includes('pos sale')
    || noteText.includes('source: pos')
    || (reference.length > 0 && recognizedSaleIds.has(reference))
    || (invoiceId.length > 0 && recognizedSaleIds.has(invoiceId));
};

export const isExaminationInvoice = (invoice: any) => {
  const origin = String(invoice?.originModule || invoice?.origin_module || '').trim().toLowerCase();
  const documentTitle = String(invoice?.documentTitle || invoice?.document_title || '').trim().toLowerCase();
  const reference = String(invoice?.reference || '').trim().toUpperCase();
  const batchId = String(
    invoice?.batchId
    || invoice?.linkedBatchId
    || invoice?.originBatchId
    || invoice?.origin_batch_id
    || ''
  ).trim();

  return origin === 'examination'
    || documentTitle.includes('examination invoice')
    || reference.startsWith('EXM-BATCH-')
    || batchId.length > 0;
};

const extractOrderReferenceKeys = (invoice: any): string[] => {
  const keys = new Set<string>();
  const conversionSourceType = String(invoice?.conversionDetails?.sourceType || '').trim().toLowerCase();
  const conversionSourceNumber = String(invoice?.conversionDetails?.sourceNumber || '').trim();

  if (conversionSourceType === 'order' && conversionSourceNumber) {
    keys.add(conversionSourceNumber.toLowerCase());
  }

  const notes = String(invoice?.notes || '');
  const match = notes.match(/Converted from \[Order\] #\[(.*?)\]/i);
  if (match?.[1]) {
    keys.add(String(match[1]).trim().toLowerCase());
  }

  return Array.from(keys);
};

const buildAdjustmentLines = (
  snapshots: any[] = [],
  quantity: number,
  targetTotal: number
): Array<{ name: string; amount: number }> => {
  const baseLines = getMarketAdjustmentSnapshots(Array.isArray(snapshots) ? snapshots : [])
    .map((snapshot: any) => ({
      name: String(snapshot?.name || snapshot?.adjustmentName || 'Adjustment'),
      amount: roundMoney(toNumber(snapshot?.calculatedAmount ?? snapshot?.amount, 0) * quantity)
    }))
    .filter((line) => Math.abs(line.amount) > 0.0001);

  const baseTotal = roundMoney(baseLines.reduce((sum, line) => sum + line.amount, 0));
  const safeTarget = roundMoney(targetTotal);

  if (baseLines.length === 0 && Math.abs(safeTarget) > 0.0001) {
    return [{ name: 'Adjustment', amount: safeTarget }];
  }

  if (Math.abs(baseTotal - safeTarget) <= 0.01 || Math.abs(baseTotal) <= 0.0001) {
    return baseLines;
  }

  let running = 0;
  return baseLines.map((line, index) => {
    const scaled = index === baseLines.length - 1
      ? roundMoney(safeTarget - running)
      : roundMoney((line.amount / baseTotal) * safeTarget);
    running = roundMoney(running + scaled);
    return {
      name: line.name,
      amount: scaled
    };
  });
};

const createNormalizedLine = ({
  source,
  transaction,
  transactionType,
  item,
  index
}: {
  source: RevenueSource;
  transaction: any;
  transactionType: string;
  item: any;
  index: number;
}): RevenueAnalysisLine => {
  const normalizedItem = attachPricingBreakdown(item);
  const breakdown = normalizedItem.pricingBreakdown;
  const quantity = toQuantity(normalizedItem?.quantity);
  
  const directRevenue = normalizedItem?.subtotal ?? normalizedItem?.total;
  const unitRevenue = breakdown?.sellingPrice ?? toNumber(normalizedItem?.price ?? normalizedItem?.unitPrice, 0);
  const revenue = roundMoney(
    directRevenue !== undefined
      ? toNumber(directRevenue, unitRevenue * quantity)
      : unitRevenue * quantity
  );

  // --- Robust Metric Extraction with Root Fallbacks ---
  const invoiceItems = Array.isArray(transaction?.items) ? transaction.items : [];
  const rootRevenue = invoiceItems.reduce((sum: number, it: any) => {
    const q = Math.max(1, toNumber(it?.quantity, 1));
    const p = toNumber(it?.price ?? it?.unitPrice, 0);
    return sum + p * q;
  }, 0);
  const revenueShare = rootRevenue > 0 ? revenue / rootRevenue : (1 / Math.max(1, invoiceItems.length));

  const rootMaterialTotal = toNumber(transaction?.materialTotal ?? transaction?.material_total, 0);
  const rootAdjustmentTotal = toNumber(transaction?.adjustmentTotal ?? transaction?.adjustment_total, 0);
  const rootProfitMargin = toNumber(transaction?.profitMarginTotal ?? transaction?.profit_margin_total ?? transaction?.profitAdjustment, 0);
  const rootRoundingTotal = toNumber(transaction?.roundingTotal ?? transaction?.rounding_total ?? transaction?.roundingDifference ?? transaction?.rounding_difference, 0);

  const materialCost = roundMoney(
    (breakdown?.baseMaterialCost !== undefined && breakdown.baseMaterialCost > 0)
      ? breakdown.baseMaterialCost * quantity
      : rootMaterialTotal !== 0
        ? rootMaterialTotal * revenueShare
        : toNumber(normalizedItem?.cost_price ?? normalizedItem?.cost, 0) * quantity
  );

  const adjustmentTotal = roundMoney(
    (breakdown?.adjustmentTotal !== undefined && Math.abs(breakdown.adjustmentTotal) > 0.0001)
      ? breakdown.adjustmentTotal * quantity
      : rootAdjustmentTotal !== 0
        ? rootAdjustmentTotal * revenueShare
        : toNumber(normalizedItem?.adjustmentTotal ?? normalizedItem?.adjustment_total, 0) * quantity
  );

  const roundingTotal = roundMoney(
    (breakdown?.roundingDifference !== undefined)
      ? breakdown.roundingDifference * quantity
      : rootRoundingTotal !== 0
        ? rootRoundingTotal * revenueShare
        : toNumber(normalizedItem?.roundingDifference ?? normalizedItem?.rounding_difference, 0) * quantity
  );

  const explicitMargin = toNumber(breakdown?.profitMarginAmount ?? normalizedItem?.profitMarginAmount, Number.NaN);
  const profitMargin = roundMoney(
    Number.isFinite(explicitMargin)
      ? explicitMargin * quantity
      : rootProfitMargin !== 0
        ? rootProfitMargin * revenueShare
        : (revenue - materialCost - adjustmentTotal - roundingTotal)
  );

  const reconciliationDelta = roundMoney(
    revenue - materialCost - adjustmentTotal - profitMargin - roundingTotal
  );

  return {
    lineId: `${source}:${transaction?.id || 'TX'}:${normalizedItem?.id || normalizedItem?.itemId || index}:${index}`,
    source,
    transactionId: String(transaction?.id || ''),
    transactionNumber: getTransactionNumber(transaction),
    transactionType,
    date: toDateKey(transaction?.date || transaction?.orderDate || transaction?.createdAt),
    status: String(transaction?.status || ''),
    customerName: String(transaction?.customerName || 'Walk-in'),
    subAccountName: String(transaction?.subAccountName || transaction?.sub_account_name || '').trim(),
    itemId: String(normalizedItem?.itemId || normalizedItem?.productId || normalizedItem?.id || `ITEM-${index + 1}`),
    itemName: String(
      normalizedItem?.productName
      || normalizedItem?.name
      || normalizedItem?.description
      || `Line ${index + 1}`
    ),
    quantity,
    revenue,
    materialCost,
    adjustmentTotal,
    profitMargin,
    roundingTotal,
    grossGain: roundMoney(revenue - materialCost),
    reconciliationDelta,
    adjustmentLines: buildAdjustmentLines(normalizedItem?.adjustmentSnapshots || [], quantity, adjustmentTotal)
  };
};

const normalizeGenericTransaction = (
  transaction: any,
  source: RevenueSource,
  transactionType: string
): RevenueAnalysisLine[] => {
  const items = Array.isArray(transaction?.items) ? transaction.items : [];
  return items.map((item: any, index: number) =>
    createNormalizedLine({
      source,
      transaction,
      transactionType,
      item,
      index
    })
  );
};

const buildExaminationLines = (invoice: any, batch: any): RevenueAnalysisLine[] => {
  const classes = Array.isArray(batch?.classes) ? batch.classes : [];
  if (classes.length === 0) {
    // Fallback: invoice items were built by examinationInvoiceSyncService where
    // cost=price when no breakdown exists. Use root-level materialTotal to
    // reconstruct proper cost allocation across items.
    const invoiceItems = Array.isArray(invoice?.items) ? invoice.items : [];
    const rootMaterialTotal = toNumber(invoice?.materialTotal, 0);
    const rootAdjustmentTotal = toNumber(invoice?.adjustmentTotal, 0);
    const rootRevenue = invoiceItems.reduce((sum: number, it: any) => {
      const qty = Math.max(1, toNumber(it?.quantity, 1));
      const price = toNumber(it?.price ?? it?.unitPrice, 0);
      return sum + price * qty;
    }, 0);

    return invoiceItems.map((item: any, index: number) => {
      const qty = Math.max(1, toNumber(item?.quantity, 1));
      const price = toNumber(item?.price ?? item?.unitPrice, 0);
      const revenue = roundMoney(price * qty);
      const share = rootRevenue > 0 ? revenue / rootRevenue : (1 / Math.max(1, invoiceItems.length));
      // If the item has an explicit pricingBreakdown with non-zero baseMaterialCost, prefer it.
      const breakdown = item?.pricingBreakdown;
      const materialCost = roundMoney(
        (breakdown?.baseMaterialCost !== undefined && breakdown.baseMaterialCost > 0)
          ? breakdown.baseMaterialCost * qty
          : rootMaterialTotal > 0
            ? rootMaterialTotal * share
            : 0
      );
      const adjustmentTotal = roundMoney(
        (breakdown?.adjustmentTotal !== undefined && breakdown.adjustmentTotal > 0)
          ? breakdown.adjustmentTotal * qty
          : rootAdjustmentTotal > 0
            ? rootAdjustmentTotal * share
            : toNumber(item?.adjustmentTotal, 0) * qty
      );
      const roundingTotal = roundMoney(
        (breakdown?.roundingDifference ?? toNumber(item?.roundingDifference ?? item?.rounding_difference, 0)) * qty
      );
      const explicitMargin = toNumber(breakdown?.profitMarginAmount, Number.NaN);
      const profitMargin = roundMoney(
        Number.isFinite(explicitMargin)
          ? explicitMargin * qty
          : revenue - materialCost - adjustmentTotal - roundingTotal
      );

      return {
        lineId: `EXAMINATION:${invoice?.id || 'INV'}:${item?.id || item?.itemId || index}:${index}`,
        source: 'EXAMINATION' as RevenueSource,
        transactionId: String(invoice?.id || ''),
        transactionNumber: getTransactionNumber(invoice),
        transactionType: 'Examination Invoice',
        date: toDateKey(invoice?.date || invoice?.createdAt),
        status: String(invoice?.status || ''),
        customerName: String(invoice?.customerName || invoice?.schoolName || 'School'),
        subAccountName: String(invoice?.subAccountName || invoice?.sub_account_name || '').trim(),
        itemId: String(item?.id || item?.itemId || `EXM-ITEM-${index + 1}`),
        itemName: String(item?.name || item?.productName || item?.class_name || `Class ${index + 1}`),
        quantity: qty,
        revenue,
        materialCost,
        adjustmentTotal,
        profitMargin,
        roundingTotal,
        grossGain: roundMoney(revenue - materialCost),
        reconciliationDelta: roundMoney(revenue - materialCost - adjustmentTotal - profitMargin - roundingTotal),
        adjustmentLines: Array.isArray(item?.adjustmentSnapshots)
          ? buildAdjustmentLines(item.adjustmentSnapshots, qty, adjustmentTotal)
          : []
      };
    });
  }

  const totalRevenue = roundMoney(
    classes.reduce((sum: number, cls: any) => {
      const learners = Math.max(0, Math.floor(toNumber(cls?.number_of_learners, 0)));
      const classRevenue = toNumber(
        cls?.live_total_preview,
        toNumber(cls?.final_fee_per_learner ?? cls?.price_per_learner, 0) * learners
      );
      return sum + classRevenue;
    }, 0)
  );
  // Separate market adjustments from rounding adjustments
  const totalMarketAdjustment = roundMoney(
    classes.reduce((sum: number, cls: any) => {
      const marketAdj = toNumber(cls?.market_adjustment_total ?? cls?.adjustment_total_cost, 0);
      return sum + marketAdj;
    }, 0)
  );
  const totalRoundingAdjustment = roundMoney(
    classes.reduce((sum: number, cls: any) => sum + toNumber(cls?.rounding_adjustment, 0), 0)
  );
  // Use separated rounding if available, otherwise fall back to batch-level rounding
  const batchRounding = roundMoney(
    totalRoundingAdjustment !== 0
      ? totalRoundingAdjustment
      : (invoice?.roundingDifference
        ?? invoice?.roundingTotal
        ?? batch?.rounding_adjustment_total
        ?? 0)
  );
  const rawSnapshots = Array.isArray(invoice?.adjustmentSnapshots)
    ? invoice.adjustmentSnapshots
    : (Array.isArray(batch?.adjustmentSnapshots) ? batch.adjustmentSnapshots : []);

  let allocatedRounding = 0;

  return classes.map((cls: any, index: number) => {
    const learners = Math.max(1, Math.floor(toNumber(cls?.number_of_learners, 1)));
    const revenue = roundMoney(
      toNumber(
        cls?.live_total_preview,
        toNumber(cls?.final_fee_per_learner ?? cls?.price_per_learner, 0) * learners
      )
    );
    const materialCost = roundMoney(toNumber(cls?.material_total_cost, 0));
    // Use separated market adjustment if available, otherwise fall back to combined adjustment_total_cost
    const adjustmentTotal = roundMoney(toNumber(cls?.market_adjustment_total ?? cls?.adjustment_total_cost, 0));
    const allocationBase = totalRevenue > 0 ? revenue / totalRevenue : (1 / classes.length);
    // Use separated rounding adjustment if available, otherwise allocate from batch rounding
    const classRounding = toNumber(cls?.rounding_adjustment, 0);
    const roundingTotal = classRounding !== 0
      ? roundMoney(classRounding)
      : (index === classes.length - 1
        ? roundMoney(batchRounding - allocatedRounding)
        : roundMoney(batchRounding * allocationBase));
    allocatedRounding = roundMoney(allocatedRounding + roundingTotal);
    const explicitMargin = toNumber(cls?.margin_amount, Number.NaN);
    const calculatedTotalCost = toNumber(cls?.calculated_total_cost, 0);
    
    let baseMargin = 0;
    if (Number.isFinite(explicitMargin)) {
      baseMargin = explicitMargin;
    } else if (calculatedTotalCost > 0) {
      baseMargin = calculatedTotalCost - materialCost - adjustmentTotal;
    } else {
      baseMargin = revenue - materialCost - adjustmentTotal - roundingTotal;
    }
    const profitMargin = roundMoney(Math.max(0, baseMargin));
    
    // Any remaining variance between revenue and costs is the true rounding difference
    const actualRoundingTotal = roundMoney(revenue - materialCost - adjustmentTotal - profitMargin);

    const adjustmentRatio = totalMarketAdjustment > 0
      ? adjustmentTotal / totalMarketAdjustment
      : allocationBase;

    const scaledSnapshots = rawSnapshots.map((snapshot: any) => ({
      ...snapshot,
      calculatedAmount: roundMoney(toNumber(snapshot?.calculatedAmount ?? snapshot?.amount ?? snapshot?.value, 0) * adjustmentRatio)
    }));

    return {
      lineId: `EXAMINATION:${invoice?.id || batch?.id || 'BATCH'}:${cls?.id || index}:${index}`,
      source: 'EXAMINATION' as RevenueSource,
      transactionId: String(invoice?.id || batch?.id || ''),
      transactionNumber: getTransactionNumber(invoice),
      transactionType: 'Examination Invoice',
      date: toDateKey(invoice?.date || batch?.updated_at || batch?.created_at),
      status: String(invoice?.status || batch?.status || ''),
      customerName: String(invoice?.customerName || batch?.school_name || batch?.schoolName || 'School'),
      subAccountName: String(invoice?.subAccountName || invoice?.sub_account_name || batch?.subAccountName || batch?.sub_account_name || '').trim(),
      itemId: String(cls?.id || `EXAM-CLASS-${index + 1}`),
      itemName: String(cls?.class_name || `Class ${index + 1}`),
      quantity: learners,
      revenue,
      materialCost,
      adjustmentTotal,
      profitMargin,
      roundingTotal: actualRoundingTotal,
      grossGain: roundMoney(revenue - materialCost),
      reconciliationDelta: roundMoney(revenue - materialCost - adjustmentTotal - profitMargin - actualRoundingTotal),
      adjustmentLines: buildAdjustmentLines(scaledSnapshots, 1, adjustmentTotal)
    };
  });
};

const aggregateTransactions = (lines: RevenueAnalysisLine[]): RevenueAnalysisTransaction[] => {
  const map = new Map<string, RevenueAnalysisTransaction>();

  lines.forEach((line) => {
    const key = `${line.source}:${line.transactionId}`;
    const existing = map.get(key);
    if (existing) {
      existing.lineCount += 1;
      existing.quantity = roundMoney(existing.quantity + line.quantity);
      existing.revenue = roundMoney(existing.revenue + line.revenue);
      existing.materialCost = roundMoney(existing.materialCost + line.materialCost);
      existing.adjustmentTotal = roundMoney(existing.adjustmentTotal + line.adjustmentTotal);
      existing.profitMargin = roundMoney(existing.profitMargin + line.profitMargin);
      existing.roundingTotal = roundMoney(existing.roundingTotal + line.roundingTotal);
      existing.grossGain = roundMoney(existing.grossGain + line.grossGain);
      existing.reconciliationDelta = roundMoney(existing.reconciliationDelta + line.reconciliationDelta);
      return;
    }

    map.set(key, {
      key,
      source: line.source,
      transactionId: line.transactionId,
      transactionNumber: line.transactionNumber,
      transactionType: line.transactionType,
      date: line.date,
      status: line.status,
      customerName: line.customerName,
      subAccountName: line.subAccountName,
      lineCount: 1,
      quantity: line.quantity,
      revenue: line.revenue,
      materialCost: line.materialCost,
      adjustmentTotal: line.adjustmentTotal,
      profitMargin: line.profitMargin,
      roundingTotal: line.roundingTotal,
      grossGain: line.grossGain,
      reconciliationDelta: line.reconciliationDelta
    });
  });

  return Array.from(map.values()).sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
};

const buildSourceSummaries = (lines: RevenueAnalysisLine[]): RevenueSourceSummary[] => {
  const transactions = aggregateTransactions(lines);
  const sources: Array<RevenueSource | 'ALL'> = ['ALL', 'POS', 'ORDER_FORM', 'EXAMINATION'];

  return sources.map((source) => {
    const scopedLines = source === 'ALL'
      ? lines
      : lines.filter((line) => line.source === source);
    const scopedTransactions = source === 'ALL'
      ? transactions
      : transactions.filter((transaction) => transaction.source === source);

    return {
      source,
      transactionCount: scopedTransactions.length,
      lineCount: scopedLines.length,
      quantity: roundMoney(scopedLines.reduce((sum, line) => sum + line.quantity, 0)),
      revenue: roundMoney(scopedLines.reduce((sum, line) => sum + line.revenue, 0)),
      materialCost: roundMoney(scopedLines.reduce((sum, line) => sum + line.materialCost, 0)),
      adjustmentTotal: roundMoney(scopedLines.reduce((sum, line) => sum + line.adjustmentTotal, 0)),
      profitMargin: roundMoney(scopedLines.reduce((sum, line) => sum + line.profitMargin, 0)),
      roundingTotal: roundMoney(scopedLines.reduce((sum, line) => sum + line.roundingTotal, 0)),
      grossGain: roundMoney(scopedLines.reduce((sum, line) => sum + line.grossGain, 0)),
      reconciliationDelta: roundMoney(scopedLines.reduce((sum, line) => sum + line.reconciliationDelta, 0))
    };
  });
};

const buildAdjustmentLedger = (lines: RevenueAnalysisLine[]): RevenueAdjustmentLedgerRow[] => {
  const map = new Map<string, RevenueAdjustmentLedgerRow & { transactions: Set<string> }>();

  lines.forEach((line) => {
    // Process explicit market adjustments
    line.adjustmentLines.forEach((adjustment) => {
      const key = `${line.source}:${adjustment.name}`;
      const existing = map.get(key);
      if (existing) {
        existing.totalAmount = roundMoney(existing.totalAmount + adjustment.amount);
        existing.applicationCount += 1;
        existing.transactions.add(line.transactionId);
        return;
      }

      map.set(key, {
        source: line.source,
        adjustmentName: adjustment.name,
        totalAmount: adjustment.amount,
        applicationCount: 1,
        transactionCount: 0,
        transactions: new Set([line.transactionId])
      });
    });

    // Process rounding as a virtual adjustment type
    if (Math.abs(line.roundingTotal) > 0.0001) {
      const roundingKey = `${line.source}:Rounding`;
      const existingRounding = map.get(roundingKey);
      if (existingRounding) {
        existingRounding.totalAmount = roundMoney(existingRounding.totalAmount + line.roundingTotal);
        existingRounding.applicationCount += 1;
        existingRounding.transactions.add(line.transactionId);
      } else {
        map.set(roundingKey, {
          source: line.source,
          adjustmentName: 'Rounding',
          totalAmount: line.roundingTotal,
          applicationCount: 1,
          transactionCount: 0,
          transactions: new Set([line.transactionId])
        });
      }
    }
  });

  return Array.from(map.values())
    .map((entry) => ({
      source: entry.source,
      adjustmentName: entry.adjustmentName,
      totalAmount: roundMoney(entry.totalAmount),
      applicationCount: entry.applicationCount,
      transactionCount: entry.transactions.size
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
};

const buildItemPerformance = (lines: RevenueAnalysisLine[]): RevenueItemPerformanceRow[] => {
  const map = new Map<string, RevenueItemPerformanceRow>();

  lines.forEach((line) => {
    const key = `${line.source}:${line.itemName}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity = roundMoney(existing.quantity + line.quantity);
      existing.revenue = roundMoney(existing.revenue + line.revenue);
      existing.materialCost = roundMoney(existing.materialCost + line.materialCost);
      existing.adjustmentTotal = roundMoney(existing.adjustmentTotal + line.adjustmentTotal);
      existing.profitMargin = roundMoney(existing.profitMargin + line.profitMargin);
      existing.roundingTotal = roundMoney(existing.roundingTotal + line.roundingTotal);
      existing.grossGain = roundMoney(existing.grossGain + line.grossGain);
      return;
    }

    map.set(key, {
      source: line.source,
      itemName: line.itemName,
      quantity: line.quantity,
      revenue: line.revenue,
      materialCost: line.materialCost,
      adjustmentTotal: line.adjustmentTotal,
      profitMargin: line.profitMargin,
      roundingTotal: line.roundingTotal,
      grossGain: line.grossGain
    });
  });

  return Array.from(map.values()).sort((a, b) => b.profitMargin - a.profitMargin);
};

export const buildRevenueAnalysisDataset = ({
  sales = [],
  invoices = [],
  orders = [],
  batches = []
}: {
  sales?: any[];
  invoices?: any[];
  orders?: any[];
  batches?: any[];
}): RevenueAnalysisDataset => {
  const batchMap = new Map<string, any>();
  (Array.isArray(batches) ? batches : []).forEach((batch: any) => {
    if (!batch) return;
    if (batch.id) batchMap.set(String(batch.id), batch);
    const bNum = batch.batch_number || batch.batchNumber;
    if (bNum) batchMap.set(String(bNum), batch);
  });

  const orderKeysCoveredByInvoices = new Set<string>();
  const recognizedSales = (Array.isArray(sales) ? sales : []).filter(isRecognizedSale);
  const recognizedSaleIds = new Set<string>(
    recognizedSales
      .map((sale: any) => String(sale?.id || '').trim())
      .filter(Boolean)
  );

  (Array.isArray(invoices) ? invoices : []).forEach((invoice: any) => {
    const status = String(invoice?.status || '').toLowerCase();
    if (status === 'cancelled' || status === 'draft') return;
    if (isExaminationInvoice(invoice) || isPosMirrorInvoice(invoice, recognizedSaleIds)) return;
    extractOrderReferenceKeys(invoice).forEach((key) => orderKeysCoveredByInvoices.add(key));
  });

  const lines: RevenueAnalysisLine[] = [];

  recognizedSales.forEach((sale: any) => {
      lines.push(...normalizeGenericTransaction(sale, 'POS', 'Sale'));
    });

  (Array.isArray(invoices) ? invoices : []).forEach((invoice: any) => {
    const status = String(invoice?.status || '').toLowerCase();
    if (status === 'cancelled' || status === 'draft') return;

    if (isExaminationInvoice(invoice)) {
      const batchId = String(
        invoice?.batchId
        || invoice?.linkedBatchId
        || invoice?.originBatchId
        || invoice?.origin_batch_id
        || ''
      ).trim();
      const batch = batchMap.get(batchId);
      lines.push(...buildExaminationLines(invoice, batch));
      return;
    }

    if (isPosMirrorInvoice(invoice, recognizedSaleIds)) {
      // Treat POS mirror invoices as POS source for revenue analysis
      lines.push(...normalizeGenericTransaction(invoice, 'POS', 'POS Invoice'));
      return;
    }

    lines.push(...normalizeGenericTransaction(invoice, 'ORDER_FORM', 'Invoice'));
  });

  (Array.isArray(orders) ? orders : []).forEach((order: any) => {
    const status = String(order?.status || '').trim().toLowerCase();
    const orderKeys = [
      String(order?.orderNumber || '').trim().toLowerCase(),
      String(order?.id || '').trim().toLowerCase()
    ].filter(Boolean);
    const alreadyCovered = orderKeys.some((key) => orderKeysCoveredByInvoices.has(key));

    if (status !== 'completed' || alreadyCovered) return;
    lines.push(...normalizeGenericTransaction({
      ...order,
      date: order?.orderDate || order?.date
    }, 'ORDER_FORM', 'Order'));
  });

  return buildRevenueAnalysisDatasetFromLines(lines);
};

export const buildRevenueAnalysisDatasetFromLines = (
  lines: RevenueAnalysisLine[] = []
): RevenueAnalysisDataset => {
  const cleanedLines = (Array.isArray(lines) ? lines : []).filter((line) => {
    return Math.abs(line.revenue) > 0.0001
      || Math.abs(line.materialCost) > 0.0001
      || Math.abs(line.adjustmentTotal) > 0.0001
      || Math.abs(line.profitMargin) > 0.0001
      || Math.abs(line.roundingTotal) > 0.0001;
  });

  return {
    lines: cleanedLines.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    transactions: aggregateTransactions(cleanedLines),
    sourceSummaries: buildSourceSummaries(cleanedLines),
    adjustmentLedger: buildAdjustmentLedger(cleanedLines),
    itemPerformance: buildItemPerformance(cleanedLines)
  };
};

export const getRevenueSourceLabel = sourceLabel;
