import type { ProviderName } from './services/ai/types';

export interface AppearanceConfig {
  theme: 'Light' | 'Dark' | 'System';
  density: 'Compact' | 'Comfortable' | 'Spacious';
  glassmorphism: boolean;
  borderRadius: 'Small' | 'Medium' | 'Large';
  enableAnimations: boolean;
  sidebarStyle?: 'Full' | 'Compact' | 'Minimal' | 'Classic';
}

export interface NumberingRule {
  prefix: string;
  padding: number;
  extension?: string;
  startNumber: number;
  currentNumber?: number;
  suffix?: string;
  resetInterval?: 'Never' | 'Daily' | 'Monthly' | 'Yearly';
}



export interface TransactionSettingsConfig {
  // Basic transaction controls
  allowBackdating: boolean;
  backdatingLimitDays: number;
  allowFutureDating: boolean;
  allowPartialFulfillment: boolean;
  voidingWindowHours: number;
  enforceCreditLimit: 'None' | 'Warning' | 'Strict';
  defaultPaymentTermsDays: number;
  quotationExpiryDays: number;
  autoPrintReceipt: boolean;
  showReceiptPreview?: boolean;
  quickItemEntry: boolean;
  defaultPOSWarehouse: string;
  posDefaultCustomer: string;

  // POS specific settings
  pos: {
    showItemImages: boolean;
    enableShortcuts: boolean;
    allowReturns: boolean;
    allowDiscounts: boolean;
    gridColumns: number;
    showCategoryFilters: boolean;
    photocopyPrice: number;
    photocopyCostPerPage: number;
    typePrintingPrice: number;
    typePrintingCostPerPage: number;
    staplePrice: number;
    receiptFooter: string;
    requireCustomer: boolean;
    defaultPaymentMethod: string;
    showShortcutHints: boolean;
    shortcutLabels: {
      F1: string;
      F2: string;
      F3: string;
      F10: string;
    };
    paymentDetails?: {
      bankAccounts: Array<{
        id: string;
        bankName: string;
        accountName: string;
        accountNumber: string;
        branchCode?: string;
      }>;
      mobileMoneyAccounts: Array<{
        id: string;
        network: string;
        accountName: string;
        phoneNumber: string;
      }>;
    };
  };
  
  // Company payment details for banking and documents
  paymentDetails: {
    bankAccounts: Array<{
      id: string;
      bankName: string;
      accountName: string;
      accountNumber: string;
      branchCode?: string;
    }>;
    mobileMoneyAccounts: Array<{
      id: string;
      network: string;
      accountName: string;
      phoneNumber: string;
    }>;
  };

  // Numbering rules (dynamic by transaction type)
  numbering: Record<string, NumberingRule>;

  // Approval thresholds (dynamic by transaction type)
  approvalThresholds: Record<string, number>;
}

export interface IntegrationSettingsConfig {
  externalApis: Array<{
    id?: string;
    name?: string;
    baseUrl: string;
    apiKey: string;
    enabled: boolean;
  }>;
  webhooks: Array<{
    id: string;
    url: string;
    events: string[];
    enabled: boolean;
  }>;
}

export interface InvoiceTemplatesConfig {
  engine: 'Standard' | 'Advanced' | 'Custom' | 'Classic' | 'Modern' | 'Professional' | 'Clean';
  accentColor: string;
  companyNameFontSize: number;
  bodyFontSize?: number;
  fontFamily?: 'Helvetica' | 'Courier' | 'Times-Roman' | 'Comic Sans MS';
  logoWidth?: number;
  showCompanyLogo?: boolean;
  showPaymentTerms?: boolean;
  showDueDate?: boolean;
  showOutstandingAndWalletBalances?: boolean;
  showAccountSummary?: boolean;
  [key: string]: any; // Dynamic boolean flags for template options
}

export interface GLMappingConfig {
  [key: string]: string; // Dynamic mapping of accounts
}

export interface ProductionSettingsConfig {
  autoConsumeMaterials: boolean;
  requireQAApproval: boolean;
  trackMachineDownTime: boolean;
  defaultWorkCenterId: string;
  defaultExamBomId: string;
  allowOverproduction: boolean;
  showKioskSummary: boolean;
  paperId?: string;
  tonerId?: string;
  laborCostPerHour?: number;
  baseMargin?: number;
}

export interface InventorySettingsConfig {
  valuationMethod: 'FIFO' | 'LIFO' | 'WeightedAverage' | 'StandardCost' | 'AVCO';
  allowNegativeStock: boolean;
  autoBarcode: boolean;
  trackBatches: boolean;
  defaultWarehouseId: string;
  trackSerialNumbers: boolean;
  lowStockAlerts: boolean;
}

export interface CloudSyncConfig {
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  lastSyncTimestamp?: string;
}

export interface SecuritySettingsConfig {
  sessionTimeoutMinutes: number;
  forcePasswordChangeDays: number;
  requireTwoFactor: boolean;
  auditLogLevel: 'Minimal' | 'Standard' | 'Detailed' | 'Full';
  lockoutAttempts: number;
  passwordProtectionEnabled?: boolean;
  enforcePasswordComplexity?: boolean;
}

export interface VATConfig {
  enabled: boolean;
  rate: number;
  registrationNumber?: string;
  defaultTaxCategory?: string;
  outputTaxAccount?: string;
  inputTaxAccount?: string;
  marketAdjustmentAccount?: string;
  filingFrequency: 'Monthly' | 'Quarterly' | 'Annually';
  pricingMode: 'VAT' | 'MarketAdjustment';
}

export interface RoundingRulesConfig {
  method: 'Nearest' | 'Up' | 'Down' | 'Truncate';
  precision: number;
}

export interface CompanyConfig {
  // Unique identifier for multi-tenant data isolation
  companyId: string;

  // Basic company info
  companyName: string;
  tagline?: string;
  email: string;
  phone: string;
  addressLine1: string;
  city?: string;
  country?: string;
  currencySymbol: string;
  dateFormat: string;
  logo?: string;
  logoBase64?: string;
  signature?: string;
  signatureBase64?: string;
  footer?: string;
  showCompanyLogo?: boolean;

  // Configuration sections
  appearance: AppearanceConfig;
  transactionSettings: TransactionSettingsConfig;
  integrationSettings: IntegrationSettingsConfig;
  invoiceTemplates: InvoiceTemplatesConfig;
  glMapping: GLMappingConfig;
  productionSettings: ProductionSettingsConfig;
  inventorySettings: InventorySettingsConfig;
  cloudSync: CloudSyncConfig;
  securitySettings: SecuritySettingsConfig;
  security?: {
    passwordRequired?: boolean;
    enforceComplexity?: boolean;
  };
  vat: VATConfig;
  roundingRules: RoundingRulesConfig;
  notificationSettings: {
    customerActivityNotifications?: boolean;
    smsGatewayEnabled?: boolean;
    emailGatewayEnabled?: boolean;
    dailySummaryEnabled?: boolean;
    dailySummaryTime?: string;
    dailySummaryEmail?: string;
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    systemAlertsEnabled?: boolean;
    lowStockThreshold?: number;
    largeTransactionThreshold?: number;
    [key: string]: any;
  };
  lateFeePolicy: LateFeePolicy;
  registrationNumber?: string;
  defaultTaxCategory?: string;
  outputTaxAccount?: string;
  inputTaxAccount?: string;
  marketAdjustmentAccount?: string;
  monthlyRevenueTarget?: number;

  // Dynamic module enablement
  enabledModules: Record<string, boolean>;
  notificationTemplates?: Array<{
    id: string;
    enabled: boolean;
    subjectTemplate: string;
    bodyTemplate: string;
    [key: string]: any;
  }>;
  taxRate?: number;
  enableTax?: boolean;
  receiptFooter?: string;

  // Backup configuration
  backupFrequency: 'Daily' | 'Weekly' | 'Monthly' | 'Never';
  backupSettings?: {
    autoBackupEnabled: boolean;
    backupFrequency: 'Daily' | 'Weekly' | 'Monthly';
    retentionCount: number;
    cloudBackupEnabled: boolean;
  };

  // AI configuration
  aiConfig?: {
    provider: ProviderName;
    baseUrl: string;
    apiKey: string;
    model: string;
    openrouterApiKey: string;
    openrouterModel: string;
    geminiApiKey: string;
    geminiModel: string;
    customEndpoint: string;
  };

  // Pricing settings (from Phase 0-1)
  pricingSettings?: {
    roundingMethod?: string;
    defaultMarkup?: number;
    categoryOverrides?: Array<{
      category: string;
      markup: number;
      roundingMethod?: string;
    }>;
    seasonalAdjustments?: Array<{
      startDate: string;
      endDate: string;
      adjustmentPercent: number;
      categories?: string[];
    }>;
    [key: string]: any;
  };
}

export interface SalesOrderItem {
  id: string;
  productId: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  lineTotal?: number;
}

export interface SalesOrder {
  id: string;
  quotationId?: string | null;
  customerId?: string | null;
  salesPersonId?: string | null;
  territoryId?: string | null;
  orderDate: string;
  deliveryDate?: string | null;
  status: 'Draft' | 'Confirmed' | 'Processing' | 'Cancelled' | 'Fulfilled';
  items: SalesOrderItem[];
  subtotal: number;
  discounts: number;
  tax: number;
  total: number;
  notes?: string;
}

// Examination Batch Notification Types
export type NotificationType = 'BATCH_CREATED' | 'BATCH_CALCULATED' | 'BATCH_APPROVED' | 'BATCH_INVOICED' | 'DEADLINE_REMINDER';
export type NotificationPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface ExaminationBatchNotification {
  id: string;
  batch_id: string;
  user_id: string;
  notification_type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  batch_details: {
    batchId: string;
    batchName: string;
    examinationDate: string;
    numberOfStudents: number;
    schoolName?: string;
    academicYear?: string;
    term?: string;
    examType?: string;
    totalAmount?: number;
    status?: string;
  };
  is_read: boolean;
  read_at: string | null;
  delivered_at: string;
  created_at: string;
  expires_at?: string;
}

export interface NotificationAuditLog {
  id: string;
  notification_id: string | null;
  user_id: string;
  action: 'CREATED' | 'DELIVERED' | 'READ' | 'DISMISSED' | 'EXPIRED' | 'FAILED';
  details_json: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}


// ============================================
// PRINT JOB TICKET TYPES - For Printing Services
// ============================================

export type JobTicketType = 'Photocopy' | 'Printing' | 'Binding' | 'Scan' | 'Lamination' | 'Other';
export type JobTicketPriority = 'Normal' | 'Rush' | 'Express' | 'Urgent';
export type JobTicketStatus = 'Received' | 'Processing' | 'Ready' | 'Delivered' | 'Cancelled';

export interface JobTicketFinishing {
  staple?: boolean;
  fold?: boolean;
  collate?: boolean;
  trim?: boolean;
  punch?: boolean;
  bindingType?: 'None' | 'Spiral' | 'Perfect' | 'Wire' | 'Tape';
  lamination?: boolean;
}

export interface JobTicket {
  id: string;
  ticketNumber: string;
  type: JobTicketType;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  description: string;
  quantity: number;
  priority: JobTicketPriority;
  status: JobTicketStatus;
  paperSize?: 'A4' | 'A3' | 'A5' | 'Legal' | 'Letter' | 'Custom';
  paperType?: string;
  colorMode?: 'BlackWhite' | 'Color';
  sides?: 'Single' | 'Double';
  finishing: JobTicketFinishing;
  unitPrice: number;
  rushFee: number;
  finishingCost: number;
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  dateReceived: string;
  dueDate?: string;
  dueTime?: string;
  expectedCompletionDate?: string;
  expectedCompletionTime?: string;
  completedAt?: string;
  deliveredAt?: string;
  operatorId?: string;
  operatorName?: string;
  machineId?: string;
  machineName?: string;
  progressPercent: number;
  attachments?: Array<{ id: string; name: string; url: string; fileId?: string; type: string; size: number }>;
  notes?: string;
  internalNotes?: string;
  sourceType?: 'quotation' | 'examination_batch' | 'manual';
  sourceId?: string;
  linkedWorkOrderId?: string;
  batchReference?: string;
  createdBy?: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
}


export interface JobTicketSettings {
  defaultRushFeePercent: number;
  expressFeePercent: number;
  urgentFeePercent: number;
  enableNotifications: boolean;
  notifyOnReceived: boolean;
  notifyOnReady: boolean;
  notifyOnDelivered: boolean;
}

export interface AuditLogEntry {
  id: string;
  date: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  userId: string;
  userRole: string;
  oldValue?: unknown;
  newValue?: Record<string, unknown>;
  reason?: string;
  correlationId?: string;
}
export type ExamInvoiceClassSummary = any; // TIER 2: Added as any due to missing definitions
export type ItemType = 'Raw Material' | 'Service' | 'Product' | 'Stationery' | 'Material';

export interface Item {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  type: ItemType;
  category?: string;
  description?: string;
  unit?: string;
  cost: number;
  cost_price?: number;
  marginPercent?: number;
  price: number;
  selling_price?: number;
  calculated_price?: number;
  rounding_adjustment?: number;
  stock: number;
  minStockLevel?: number;
  reorderPoint?: number;
  minOrderQty?: number;
  leadTimeDays?: number;
  binLocation?: string;
  preferredSupplierId?: string;
  isLargeFormat?: boolean;
  rollWidth?: number;
  rollLength?: number;
  pages?: number;
  conversionRate?: number;
  purchaseUnit?: string;
  usageUnit?: string;
  pricingConfig?: PricingConfig;
  variants?: ProductVariant[];
  adjustmentSnapshots?: any[];
  rounding_method?: string;
  rounding_difference?: number;
  reserved?: number;
  locationStock?: { warehouseId: string; quantity: number }[];
  smartPricing?: SmartPricingConfig;
  isStationeryPack?: boolean;
  costPerPack?: number;
  unitsPerPack?: number;
  sellingPricePerPiece?: number;
  costPerPiece?: number;
  profitPerPiece?: number;
  markup_percent?: number;
  manual_override?: boolean;
  // Service-specific fields
  serviceSku?: string;
  priceType?: string;
  size?: string;
  color?: string;
  status?: 'Active' | 'Inactive' | 'Pending';
  [key: string]: any;
}
export interface User {
  id: string;
  username: string;
  role: string;
  email?: string;
  password?: string;
  isSuperAdmin?: boolean;
  groupIds?: string[];
  authMode?: string;
  tokenExpiry?: number;
  fullName?: string;
  name?: string;
  status?: string;
  active?: boolean;
  mfaEnabled?: boolean;
  mfaSecret?: string;
  securityLevel?: string;
  avatar?: string;
}
export type Account = any; // TIER 2: Added as any due to missing definitions
export type Warehouse = any; // TIER 2: Added as any due to missing definitions
export type WorkCenter = any; // TIER 2: Added as any due to missing definitions
export type ProductionResource = any; // TIER 2: Added as any due to missing definitions
export type PermissionNode = any; // TIER 2: Added as any due to missing definitions
export interface UserGroup {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
}
export type UserRole = string;
export interface PasswordPolicy {
  minLength: number;
  requireNumber: boolean;
  requireSpecialChar: boolean;
  expiryDays?: number;
}
export type PasswordPolicy = any; // TIER 2: Added as any due to missing definitions
export type SystemAlert = any; // TIER 2: Added as any due to missing definitions
export type Reminder = any; // TIER 2: Added as any due to missing definitions
export type ExaminationJob = any; // TIER 2: Added as any due to missing definitions
export type ExaminationJobSubject = any; // TIER 2: Added as any due to missing definitions
export type ExaminationInvoiceGroup = any; // TIER 2: Added as any due to missing definitions
export type ExaminationRecurringProfile = any; // TIER 2: Added as any due to missing definitions
export type ExaminationJobPayload = any; // TIER 2: Added as any due to missing definitions
export type ExaminationGroupPayload = any; // TIER 2: Added as any due to missing definitions
export type ExaminationRecurringPayload = any; // TIER 2: Added as any due to missing definitions
export type ExaminationRecurringFrequency = 'weekly' | 'monthly' | 'termly';
export interface ExaminationInvoiceGroupJobLine {
  examination_job_id: string;
  class_name: string;
  learners: number;
  price_per_learner: number;
  amount: number;
}
export type School = any; // TIER 2: Added as any due to missing definitions
export type Customer = any; // TIER 2: Added as any due to missing definitions
export type MarketAdjustment = any; // TIER 2: Added as any due to missing definitions
export type ExaminationBatch = any; // TIER 2: Added as any due to missing definitions
export type ExaminationClass = any; // TIER 2: Added as any due to missing definitions
export type ExaminationSubject = any; // TIER 2: Added as any due to missing definitions
export type LedgerEntry = any; // TIER 2: Added as any due to missing definitions
export type Invoice = any; // TIER 2: Added as any due to missing definitions
export type Expense = any; // TIER 2: Added as any due to missing definitions
export type RecurringInvoice = any; // TIER 2: Added as any due to missing definitions
export type ScheduledPayment = any; // TIER 2: Added as any due to missing definitions
export type WalletTransaction = any; // TIER 2: Added as any due to missing definitions
export type DeliveryNote = any; // TIER 2: Added as any due to missing definitions
export type Budget = any; // TIER 2: Added as any due to missing definitions
export type Transfer = any; // TIER 2: Added as any due to missing definitions
export type Employee = any; // TIER 2: Added as any due to missing definitions
export type PayrollRun = any; // TIER 2: Added as any due to missing definitions
export type Payslip = any; // TIER 2: Added as any due to missing definitions
export type Income = any; // TIER 2: Added as any due to missing definitions
export type Cheque = any; // TIER 2: Added as any due to missing definitions
export type ZReport = any; // TIER 2: Added as any due to missing definitions
export type SupplierPayment = any; // TIER 2: Added as any due to missing definitions
export type CustomerPayment = any; // TIER 2: Added as any due to missing definitions
export type Purchase = any; // TIER 2: Added as any due to missing definitions
export type GoodsReceipt = any; // TIER 2: Added as any due to missing definitions
export type BillOfMaterial = any; // TIER 2: Added as any due to missing definitions
export type Order = any; // TIER 2: Added as any due to missing definitions
export type OrderPayment = any; // TIER 2: Added as any due to missing definitions
export type OrderItem = any; // TIER 2: Added as any due to missing definitions
export type Quotation = any; // TIER 2: Added as any due to missing definitions
export type BOMTemplate = any; // TIER 2: Added as any due to missing definitions
export interface FinishingItemConfig {
  itemId: string;
  quantity: number;
}

export interface FinishingOption {
  id: string;
  name: string;
  enabled: boolean;
  price: number;
  description?: string;
  quantity?: number;
  items: FinishingItemConfig[];
}

export interface ProductionSettingsConfig {
  autoConsumeMaterials: boolean;
  requireQAApproval: boolean;
  trackMachineDownTime: boolean;
  defaultWorkCenterId: string;
  defaultExamBomId: string;
  allowOverproduction: boolean;
  showKioskSummary: boolean;
  finishingOptions: FinishingOption[];
}
export type SubcontractOrder = any; // TIER 2: Added as any due to missing definitions
export type Supplier = any; // TIER 2: Added as any due to missing definitions
export type ProductionBatch = any; // TIER 2: Added as any due to missing definitions
export type WorkOrder = any; // TIER 2: Added as any due to missing definitions
export type ProductionLog = any; // TIER 2: Added as any due to missing definitions
export type ResourceAllocation = any; // TIER 2: Added as any due to missing definitions
export type MaterialReservation = any; // TIER 2: Added as any due to missing definitions
export type QACheck = any; // TIER 2: Added as any due to missing definitions
export type Sale = any; // TIER 2: Added as any due to missing definitions
export type JobOrder = any; // TIER 2: Added as any due to missing definitions
export type HeldOrder = any; // TIER 2: Added as any due to missing definitions
export type CartItem = any; // TIER 2: Added as any due to missing definitions
export type SalesExchange = any; // TIER 2: Added as any due to missing definitions
export type ReprintJob = any; // TIER 2: Added as any due to missing definitions
export type SMSCampaign = any; // TIER 2: Added as any due to missing definitions
export type Subscriber = any; // TIER 2: Added as any due to missing definitions
export type SMSTemplate = any; // TIER 2: Added as any due to missing definitions
export type Shipment = any; // TIER 2: Added as any due to missing definitions
export type MaintenanceLog = any; // TIER 2: Added as any due to missing definitions
export type ExamPaper = any; // TIER 2: Added as any due to missing definitions
export type ExamPrintingBatch = any; // TIER 2: Added as any due to missing definitions
export type ExamJob = any; // TIER 2: Added as any due to missing definitions
export type SalesReturn = any; // TIER 2: Added as any due to missing definitions
export type PurchaseAllocation = any; // TIER 2: Added as any due to missing definitions
export type VatTransaction = any; // TIER 2: Added as any due to missing definitions
export type VatReturn = any; // TIER 2: Added as any due to missing definitions
export type MarketAdjustmentTransaction = any; // TIER 2: Added as any due to missing definitions
export type MaterialCategory = any; // TIER 2: Added as any due to missing definitions
export type WarehouseInventory = any; // TIER 2: Added as any due to missing definitions
export type MaterialBatch = any; // TIER 2: Added as any due to missing definitions
export type InventoryTransaction = any; // TIER 2: Added as any due to missing definitions
export type RoundingLog = any; // TIER 2: Added as any due to missing definitions
export type ExaminationInventoryDeduction = any; // TIER 2: Added as any due to missing definitions
export type CustomerReceiptSnapshot = any; // TIER 2: Added as any due to missing definitions
export type ProductionCostSnapshot = any; // TIER 2: Added as any due to missing definitions
export type ExaminationPricingSettings = any; // TIER 2: Added as any due to missing definitions
export type AdjustmentSnapshot = any; // TIER 2: Added as any due to missing definitions
export type ExaminationAdjustmentType = any; // TIER 2: Added as any due to missing definitions
export type ExaminationRoundingRuleType = any; // TIER 2: Added as any due to missing definitions
export type PricingRoundingMethod = 'ALWAYS_UP_50' | 'ALWAYS_UP_100' | 'ALWAYS_UP_500' | 'ALWAYS_UP_10' | 'ALWAYS_UP_CUSTOM' | 'NEAREST_10' | 'NEAREST_50' | 'NEAREST_100' | 'PSYCHOLOGICAL' | 'Nearest' | 'AlwaysUp' | 'AlwaysDown';
export type PricingMode = 'VAT' | 'MarketAdjustment';
export type PricingSyncPayload = any; // TIER 2: Added as any due to missing definitions
export type PricingSyncResult = any; // TIER 2: Added as any due to missing definitions
export type OverrideCascadeResult = any; // TIER 2: Added as any due to missing definitions
export type ExamClass = any; // TIER 2: Added as any due to missing definitions
export type ExamBOMConfig = any; // TIER 2: Added as any due to missing definitions
export type ExamSubject = any; // TIER 2: Added as any due to missing definitions
export type ExamMaterialDeduction = any; // TIER 2: Added as any due to missing definitions
export type InvoiceGenerationClassLine = any; // TIER 2: Added as any due to missing definitions
export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  sku: string;
  cost: number;
  marginPercent?: number;
  adjustmentPercent?: number;
  price: number;
  stock: number;
  pages?: number;
  inheritsParentBOM?: boolean;
  pricingSource?: 'dynamic' | 'static';
  priceLocked?: boolean;
  priceLockKey?: string;
  [key: string]: any;
}
export interface PricingThresholdRule {
  minPrice: number;
  maxPrice?: number;
  step: number;
  method?: PricingRoundingMethod;
}

export interface RoundingAnalytics {
  totalExtraProfit: number;
  roundedTransactions: number;
  lastUpdatedAt?: string;
  byMethod: Record<string, number>;
}

export interface PricingSettings {
  enableRounding: boolean;
  defaultMethod: PricingRoundingMethod;
  customStep: number;
  applyToPOS: boolean;
  applyToInvoices: boolean;
  applyToQuotations: boolean;
  allowManualOverride: boolean;
  showOriginalPrice: boolean;
  profitProtectionMode: boolean;
  enableSmartThresholds: boolean;
  thresholdRules: PricingThresholdRule[];
  analytics: RoundingAnalytics;
}

export interface ConsumptionSnapshot {
  id?: string;
  saleId?: string;
  itemId: string;
  variantId?: string;
  pages?: number;
  quantity: number;
  cost: number;
  totalCost: number;
  name?: string;
  paperConsumed?: number;
  tonerConsumed?: number;
  costPerUnit?: number;
  bomBreakdown?: Array<{ materialId: string; materialName: string; quantity: number; unit: string; cost: number }>;
  timestamp?: string;
}

export interface TransactionAdjustmentSnapshot {
  id: string;
  saleId?: string;
  itemId?: string;
  itemName?: string;
  variantId?: string;
  adjustmentId?: string;
  name: string;
  amount: number;
  type: string;
  value?: number;
  baseCost?: number;
  quantity?: number;
  unitAdjustmentAmount?: number;
  totalAdjustmentAmount?: number;
  calculatedAmount?: number;
  category?: string;
  isActive?: boolean;
  timestamp?: string;
}

export interface DynamicServiceDetails {
  materials: ConsumptionSnapshot[];
  adjustments: TransactionAdjustmentSnapshot[];
  pages?: number;
  copies?: number;
  totalPages?: number;
  unitCostPerPage?: number;
  unitPricePerPage?: number;
  unitCostPerCopy?: number;
  unitPricePerCopy?: number;
  totalCost?: number;
  totalPrice?: number;
  calculatedTotalPrice?: number;
}

export type ReceiptPaymentStatus = 'Paid' | 'Partial' | 'Unpaid' | 'Voided' | 'Overpaid';

export interface FinancialIntegrityIssue {
  id: string;
  severity: 'high' | 'medium' | 'low';
  type: string;
  entityType: string;
  entityId?: string;
  message: string;
  recommendedAction: string;
  relatedIds?: string[];
}

export interface FinancialIntegrityAuditResult {
  healthy: boolean;
  issues: FinancialIntegrityIssue[];
  summary: {
    totalIssues: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
    checkedAt: string;
  };
}

export interface VerifiedMonthlyMetrics {
  revenue: number;
  expenses: number;
  netProfit: number;
}

export interface VerifiedDashboardMetrics {
  currentMonth: VerifiedMonthlyMetrics;
  previousMonth: VerifiedMonthlyMetrics;
  todayCollection: number;
  receivables: number;
  payables: number;
  cashPosition: number;
  cashForecast: number;
}

export interface Discrepancy {
  type: string;
  entityId: string;
  entityName: string;
  expectedValue: number;
  actualValue: number;
  difference: number;
  suggestedAction: string;
  severity: 'high' | 'medium' | 'low';
}

export interface ReconciliationResult {
  success: boolean;
  discrepancies: Discrepancy[];
  summary: {
    totalChecked: number;
    totalDiscrepancies: number;
  };
}

export type RoundingDashboardData = any; 
export type RoundingInsight = any;
export type RoundingMethodPerformanceRow = any;
export type RoundingPeriodReportRow = any;
export type RoundingPriceHistoryEntry = any;
export type RoundingProductPerformanceRow = any;
export type RoundingProfitProjection = any;
export type RoundingProfitSummary = any;
export type RoundingRealizedProfitResult = any;
export type RoundingRealizedProfitRow = any;
export type RoundingTopProductRow = any;
export type SalesExchangeItem = any;
export type SalesExchangeApproval = any;
export type ProofOfDeliveryRecord = any;
export type AccountType = any;
export interface PricingConfig {
  paperId?: string;
  tonerId?: string;
  finishingOptions: FinishingOption[];
  manualOverride: boolean;
  marketAdjustment: number;
  totalCost?: number;
  selectedAdjustmentIds?: string[];
  selectedRoundingMethod?: PricingRoundingMethod;
  customRoundingStep?: number;
  [key: string]: any;
}
export type SignatureInputMode = any; // TIER 2: Added as any due to missing definitions
export type PaymentDetail = any; // TIER 2: Added as any due to missing definitions
export type InkCoverage = any; // TIER 2: Added as any due to missing definitions
export type ProductionOperation = any; // TIER 2: Added as any due to missing definitions
export type BOMComponent = any; // TIER 2: Added as any due to missing definitions
export type VDPConfig = any; // TIER 2: Added as any due to missing definitions
export type ExamPricingResult = any; // TIER 2: Added as any due to missing definitions
export type SubjectJob = any; // TIER 2: Added as any due to missing definitions
export type ExamSchoolLocal = any; // TIER 2: Added as any due to missing definitions
export type ExamClassLocal = any; // TIER 2: Added as any due to missing definitions
export type ExamSubjectLocal = any; // TIER 2: Added as any due to missing definitions
export type LandingCostItem = any; // TIER 2: Added as any due to missing definitions
export type InvoiceAllocation = any; // TIER 2: Added as any due to missing definitions
export type Attachment = any; // TIER 2: Added as any due to missing definitions
export type CRMTask = any; // TIER 2: Added as any due to missing definitions
export interface SmartPricingConfig {
  hiddenBOMId?: string;
  bomTemplateId?: string;
  adjustmentPercentage?: number;
  pages?: number;
  copies?: number;
  paperItemId?: string;
  tonerItemId?: string;
  finishingEnabled?: string[];
  roundingMethod?: string;
  roundedPrice?: number;
  originalPrice?: number;
  // Full price breakdown fields (set by SmartPricing engine)
  paperCost?: number;
  tonerCost?: number;
  finishingCost?: number;
  baseCost?: number;
  marketAdjustments?: Array<{ id: string; name: string; type: string; value: number; rawValue: number }>;
  marketAdjustmentTotal?: number;
  profitMarginAmount?: number;
  marginType?: 'percentage' | 'fixed_amount';
  marginValue?: number;
  roundingDifference?: number;
  wasRounded?: boolean;
  [key: string]: any;
}

/**
 * Snapshot of the full SmartPricing breakdown captured at point-of-sale.
 * Stored on each SaleItem so Revenue Analysis can report on each component.
 */
export interface PricingBreakdownSnapshot {
  // Material costs
  paperCost: number;
  tonerCost: number;
  finishingCost: number;
  baseMaterialCost: number;
  // Market adjustments
  adjustmentTotal: number;
  adjustmentLines: Array<{ name: string; type: string; value: number }>;
  // Profit margin
  profitMarginAmount: number;
  marginType?: 'percentage' | 'fixed_amount';
  marginValue?: number;
  // Rounding
  roundingDifference: number;
  wasRounded: boolean;
  roundingMethod?: string;
  // Totals
  sellingPrice: number;
  pages?: number;
  copies?: number;
}
export type SidebarStyle = any;
export type AVCOValuationMethod = any;
export type RequireCustomerToPOS = any;
export type LateFeePolicy = any;
