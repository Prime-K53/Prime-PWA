
import { Item, CompanyConfig } from '../types';
import {
  extractConfiguredDocumentNumberValue,
  formatConfiguredDocumentNumber,
  normalizeNumberingKey,
  resolveBuiltInDocumentPrefix,
  resolveEffectiveNumberingRule,
} from './numbering';

const isInvoiceNumberingType = (type: string) => {
  const normalized = normalizeNumberingKey(type);
  return normalized === 'invoice' || normalized.startsWith('inv') || normalized.includes('invoice') || normalized.includes('examination');
};

const resolveNumberingRules = (type: string, config?: CompanyConfig) => {
  const cfg = config || getCompanyConfig();
  const rules = cfg?.transactionSettings?.numbering as any;
  const effectiveRule = resolveEffectiveNumberingRule(type, cfg);
  return { rules, effectiveRule };
};

const resolveNumberingPadding = (type: string, config?: CompanyConfig) => {
  const { effectiveRule } = resolveNumberingRules(type, config);
  const padding = effectiveRule?.padding;
  
  // Fallback for legacy examination invoice format if no rule is found
  if (padding == null && (type === 'examination_invoice' || type === 'examination')) {
    return 6;
  }
  
  if (padding == null) {
    if (isInvoiceNumberingType(type)) {
      throw new Error('Missing invoice padding configuration.');
    }
    return 4;
  }
  const parsed = Number(padding);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    if (isInvoiceNumberingType(type)) {
      throw new Error('Invalid invoice padding configuration.');
    }
    return 4;
  }
  return parsed;
};

export const assertInvoiceNumberFormat = (id: string, config?: CompanyConfig, type: string = 'invoice') => {
  // Handle legacy examination invoice format with EXM prefix if not explicitly configured otherwise
  if (String(id || '').toUpperCase().startsWith('EXM-') && type === 'examination_invoice') {
    const numericPart = String(id || '').match(/EXM-\d{4}-(\d+)/)?.[1];
    if (numericPart && numericPart.length === 6) {
       return true;
    }
  }
  
  const padding = resolveNumberingPadding(type, config);
  const { effectiveRule } = resolveNumberingRules(type, config);
  const numericValue = extractConfiguredDocumentNumberValue(String(id || ''), {
    prefix: effectiveRule?.prefix || resolveBuiltInDocumentPrefix(type),
    suffix: effectiveRule?.suffix || ''
  });

  if (numericValue === null) {
    throw new Error(`Invoice number must end with ${padding} digits.`);
  }

  const numericText = String(id || '')
    .trim()
    .match(/(\d+)(?!.*\d)/)?.[1];

  if (!numericText || numericText.length !== padding) {
    throw new Error(`Invoice number must be ${padding} digits.`);
  }
  return true;
};

export const generateNextId = (type: string, collection: any[], config?: CompanyConfig) => {
  const { effectiveRule } = resolveNumberingRules(type, config);
  const padding = resolveNumberingPadding(type, config);
  let prefix = resolveBuiltInDocumentPrefix(type) || type;
  let startNumber = 1;
  let resetInterval = 'Never';
  let extension = '';
  let suffix = '';

  if (effectiveRule) {
    prefix = effectiveRule.prefix || prefix;
    startNumber = effectiveRule.startNumber || 1;
    resetInterval = effectiveRule.resetInterval || 'Never';
    extension = effectiveRule.extension || '';
    suffix = effectiveRule.suffix || '';
  }

  const activeRule = {
    prefix,
    padding,
    extension,
    suffix
  };

  if (!collection || collection.length === 0) {
    const nextId = formatConfiguredDocumentNumber(activeRule, startNumber);
    if (isInvoiceNumberingType(type)) {
      assertInvoiceNumberFormat(nextId, config, type);
    }
    return nextId;
  }

  // Handle Reset Intervals (Monthly, Yearly)
  let filteredCollection = collection;
  if (resetInterval !== 'Never') {
    const now = new Date();
    filteredCollection = collection.filter(item => {
      if (!item.date) return false;
      const itemDate = new Date(item.date);
      if (resetInterval === 'Daily') {
        return itemDate.getDate() === now.getDate()
          && itemDate.getMonth() === now.getMonth()
          && itemDate.getFullYear() === now.getFullYear();
      }
      if (resetInterval === 'Monthly') {
        return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
      }
      if (resetInterval === 'Yearly') {
        return itemDate.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }

  if (filteredCollection.length === 0) {
    const nextId = formatConfiguredDocumentNumber(activeRule, startNumber);
    if (isInvoiceNumberingType(type)) {
      assertInvoiceNumberFormat(nextId, config, type);
    }
    return nextId;
  }

  const maxId = filteredCollection.reduce((max, item) => {
    if (!item.id) return max;
    if (typeof item.id !== 'string') return max;

    const num = extractConfiguredDocumentNumberValue(item.id, activeRule);
    return num !== null ? Math.max(max, num) : max;
  }, 0);

  const nextNum = Math.max(maxId + 1, startNumber);
  const nextId = formatConfiguredDocumentNumber(activeRule, nextNum);
  if (isInvoiceNumberingType(type)) {
    assertInvoiceNumberFormat(nextId, config, type);
  }
  return nextId;
};

export const generateSku = (category: string, collection: any[]) => {
  if (!category) return '';
  const prefix = category.substring(0, 3).toUpperCase();
  const matchingItems = collection.filter(item =>
    item.sku && item.sku.startsWith(prefix + '-')
  );
  let maxNum = 0;
  matchingItems.forEach(item => {
    const parts = item.sku.split('-');
    const lastPart = parts[parts.length - 1];
    const num = parseInt(lastPart);
    if (!isNaN(num) && num > maxNum) {
      maxNum = num;
    }
  });
  return `${prefix}-${String(maxNum + 1).padStart(4, '0')}`;
};

export const parseTemplate = (template: string, variables: Record<string, any>): string => {
  return template.replace(/{{(\w+)}}/g, (_, key) => {
    return variables[key] !== undefined ? String(variables[key]) : `{{${key}}}`;
  });
};

export const generateAccountNumber = (): string => {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
};

/**
 * Helper to get dynamic config from CompanyConfig (mirrored from transactionService)
 */
const getCompanyConfig = (): CompanyConfig | null => {
  const saved = localStorage.getItem('nexus_company_config');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error("Failed to parse company config", e);
    }
  }
  return null;
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num || 0);
};

export const parseFormattedNumber = (value: string): number => {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

export const formatNumberCompact = (num: number): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num || 0);
};

/**
 * Standard financial rounding based on CompanyConfig rules.
 */
export const roundFinancial = (amount: number, config?: CompanyConfig): number => {
  const cfg = config || getCompanyConfig();
  const rules = cfg?.roundingRules || { method: 'Nearest', precision: 2 };

  const precision = rules.precision ?? 2;
  const factor = Math.pow(10, precision);
  let rounded: number;

  switch (rules.method) {
    case 'Up':
      rounded = Math.ceil(amount * factor) / factor;
      break;
    case 'Down':
      rounded = Math.floor(amount * factor) / factor;
      break;
    case 'Nearest':
    default:
      rounded = Math.round((amount + Number.EPSILON) * factor) / factor;
      break;
  }

  return rounded;
};

/**
 * Standard currency rounding to 2 decimal places.
 */
export const roundToCurrency = (amount: number): number => {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
};

/**
 * Calculates the total valuation of a stock collection
 */
export const calculateInventoryValuation = (items: Item[]): number => {
  return items.reduce((sum, item) => sum + ((item.stock || 0) * (item.cost || 0)), 0);
};

export const formatPaymentTerm = (term: string): string => {
  if (!term) return 'Due on Receipt';
  const days = parsePaymentTerms(term);
  if (days === 0) {
    if (term.toLowerCase().includes('receipt') || term.toLowerCase().includes('cod') || term.toLowerCase().includes('immediate')) return term;
    return 'Due on Receipt';
  }
  return `${days} days`;
};

export const parsePaymentTerms = (terms: string): number => {
  if (!terms) return 0;
  // Handle "Net X" format
  const netMatch = terms.match(/Net\s*(\d+)/i);
  if (netMatch) return parseInt(netMatch[1]);

  // Handle "X days" format
  const daysMatch = terms.match(/(\d+)\s*days/i);
  if (daysMatch) return parseInt(daysMatch[1]);

  // Default common terms
  switch (terms.toLowerCase()) {
    case 'due on receipt': return 0;
    case 'cod': return 0;
    case 'end of month': {
      const d = new Date();
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return Math.max(0, Math.ceil((lastDay.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
    }
    default: return 0;
  }
};

export const calculateDueDate = (date: string | Date, terms: string): string => {
  const baseDate = new Date(date);
  const days = parsePaymentTerms(terms);
  const dueDate = new Date(baseDate);
  dueDate.setDate(baseDate.getDate() + days);
  return dueDate.toISOString().split('T')[0];
};

export const DEFAULT_PAYMENT_TERMS: Record<string, string> = {
  'Individual': 'Net 7',
  'School Account': 'Net 365',
  'Institution': 'Net 30',
  'Government': 'Net 7',
  'Examination Account': 'Net 30'
};

export type PaymentTransactionType = 'invoice' | 'order' | 'quotation' | 'recurring' | 'other';

const SUB_ACCOUNT_PAYMENT_TERMS = 'Net 30';
const QUOTATION_PAYMENT_TERMS = 'Net 7';
const FALLBACK_MAIN_ACCOUNT_PAYMENT_TERMS = 'Net 30';
const MANAGED_PAYMENT_TERMS = new Set(
  [...Object.values(DEFAULT_PAYMENT_TERMS), FALLBACK_MAIN_ACCOUNT_PAYMENT_TERMS, 'Due on Receipt']
    .map((term) => String(term || '').trim().toLowerCase())
);

export const isSubAccountSelection = (subAccountName?: string | null): boolean => {
  const normalized = String(subAccountName || '').trim().toLowerCase();
  return Boolean(normalized) && normalized !== 'main' && normalized !== 'main account';
};

export const getDefaultPaymentTermsForSegment = (segment?: string | null): string => {
  const normalizedSegment = String(segment || '').trim();
  return DEFAULT_PAYMENT_TERMS[normalizedSegment] || FALLBACK_MAIN_ACCOUNT_PAYMENT_TERMS;
};

export const hasCustomPaymentTerms = (customer?: { paymentTerms?: string } | null): boolean => {
  const raw = String(customer?.paymentTerms || '').trim();
  if (!raw) return false;
  return !MANAGED_PAYMENT_TERMS.has(raw.toLowerCase());
};

export const resolveCustomerPaymentTerms = ({
  customer,
  subAccountName,
  transactionType = 'invoice',
  preserveCustomTerms = true
}: {
  customer?: { segment?: string; paymentTerms?: string } | null;
  subAccountName?: string | null;
  transactionType?: PaymentTransactionType;
  preserveCustomTerms?: boolean;
}): string => {
  if (transactionType === 'quotation') {
    return QUOTATION_PAYMENT_TERMS;
  }

  if (isSubAccountSelection(subAccountName)) {
    return SUB_ACCOUNT_PAYMENT_TERMS;
  }

  if (preserveCustomTerms && hasCustomPaymentTerms(customer)) {
    return String(customer?.paymentTerms || '').trim();
  }

  return getDefaultPaymentTermsForSegment(customer?.segment);
};

export const resolveCustomerPaymentPolicy = ({
  customer,
  subAccountName,
  transactionType = 'invoice',
  issuedDate,
  preserveCustomTerms = true
}: {
  customer?: { segment?: string; paymentTerms?: string } | null;
  subAccountName?: string | null;
  transactionType?: PaymentTransactionType;
  issuedDate: string | Date;
  preserveCustomTerms?: boolean;
}): { paymentTerms: string; dueDate: string } => {
  const paymentTerms = resolveCustomerPaymentTerms({
    customer,
    subAccountName,
    transactionType,
    preserveCustomTerms
  });

  return {
    paymentTerms,
    dueDate: calculateDueDate(issuedDate, paymentTerms)
  };
};

export const getPaymentTermsForCustomer = (
  customer: { segment?: string; paymentTerms?: string },
  subAccountName?: string
): string => resolveCustomerPaymentTerms({
  customer,
  subAccountName,
  transactionType: 'invoice',
  preserveCustomTerms: true
});

export const getFontStack = (font?: string) => {
  switch (font) {
    case 'Roboto': return '"Roboto", "Helvetica Neue", Helvetica, Arial, sans-serif';
    case 'Playfair Display': return '"Playfair Display", Georgia, serif';
    case 'JetBrains Mono': return '"JetBrains Mono", "Courier New", monospace';
    case 'Montserrat': return '"Montserrat", sans-serif';
    case 'Comic Sans MS': return '"Comic Sans MS", "Comic Sans", cursive';
    case 'Century Gothic': return '"Century Gothic", CenturyGothic, AppleGothic, sans-serif';
    case 'Courier New': return 'Courier, monospace';
    case 'Georgia': return 'Georgia, serif';
    case 'Helvetica': return '"Helvetica Neue", Helvetica, Arial, sans-serif';
    default: return '"Inter", sans-serif';
  }
};

/**
 * Utility to download a blob and revoke its URL after a delay
 */
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Revoke after a delay to ensure the browser has started the download
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000); // 1 second is safe for most browsers
};

/**
 * Utility to export data to CSV and trigger download
 */
export const exportToCSV = (filename: string, data: any[]) => {
  if (!data || !data.length) return;

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(fieldName => {
        const value = row[fieldName];
        const strValue = value === null || value === undefined ? '' : String(value);
        // Escape quotes and wrap in quotes if contains comma
        const escaped = strValue.replace(/"/g, '""');
        return escaped.includes(',') ? `"${escaped}"` : escaped;
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
};

export interface ClassPricingInputs {
  bom: number;
  adjustmentAmount?: number;
  marginAmount?: number;
  learners: number;
  adjustmentRate?: number;
  profitMargin?: number;
  roundingDirection?: 'nearest' | 'up' | 'down';
}

export interface ClassPricingResult {
  finalClassTotal: number;
  roundedFeePerLearner: number;
  rawFeePerLearner: number;
  rawClassTotal: number;
  adjustedCost: number;
  roundingDifference: number;
  roundingDirection: 'nearest' | 'up' | 'down';
}

export const calculateClassPricing = (inputs: ClassPricingInputs): ClassPricingResult => {
  const { bom, learners, adjustmentAmount, marginAmount, adjustmentRate = 0, profitMargin = 0, roundingDirection = 'up' } = inputs;
  
  const safeLearners = Math.max(1, Math.floor(learners || 0));
  
  const adjustedCost = adjustmentAmount !== undefined
    ? Number((bom + adjustmentAmount).toFixed(2))
    : Number((bom * (1 + adjustmentRate)).toFixed(2));
  
  const rawTotal = marginAmount !== undefined
    ? Number((adjustedCost + marginAmount).toFixed(2))
    : Number((adjustedCost * (1 + profitMargin)).toFixed(2));
  
  const rawFeePerLearner = Number((rawTotal / safeLearners).toFixed(2));
  
  let roundedFeePerLearner: number;
  
  if (roundingDirection === 'up') {
    roundedFeePerLearner = Math.ceil(rawFeePerLearner / 50) * 50;
  } else if (roundingDirection === 'down') {
    roundedFeePerLearner = Math.floor(rawFeePerLearner / 50) * 50;
  } else {
    const rawFeeRoundedDown = Math.floor(rawFeePerLearner / 50) * 50;
    const rawFeeRoundedUp = Math.ceil(rawFeePerLearner / 50) * 50;
    const diffDown = Math.abs(rawFeePerLearner - rawFeeRoundedDown);
    const diffUp = Math.abs(rawFeePerLearner - rawFeeRoundedUp);
    roundedFeePerLearner = diffUp <= diffDown ? rawFeeRoundedUp : rawFeeRoundedDown;
  }
  
  const finalClassTotal = Number((roundedFeePerLearner * safeLearners).toFixed(2));
  
  const roundingDifference = Number((finalClassTotal - rawTotal).toFixed(2));
  
  return {
    finalClassTotal,
    roundedFeePerLearner,
    rawFeePerLearner,
    rawClassTotal: rawTotal,
    adjustedCost,
    roundingDifference,
    roundingDirection: roundingDirection as 'nearest' | 'up' | 'down'
  };
};
