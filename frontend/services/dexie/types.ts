export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonMap | JsonValue[];
export interface JsonMap { [key: string]: JsonValue | undefined; }

export type SyncOperationType = 'create' | 'update' | 'delete';
export type SyncOperationStatus = 'pending' | 'syncing' | 'failed' | 'blocked' | 'synced' | 'conflict';
export type EntitySource =
  | 'legacy-idb'
  | 'legacy-dexie'
  | 'legacy-local-storage'
  | 'rxdb'
  | 'remote-api'
  | 'migration'
  | 'user-action';

export interface EntitySyncState {
  status: SyncOperationStatus;
  retryCount: number;
  lastSyncedAt?: string;
  lastError?: string;
  correlationId?: string;
}

export interface BaseEntity {
  id: string;
  entityVersion: number;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt?: string;
  source: EntitySource;
  checksum?: string;
  sync: EntitySyncState;
  tags: string[];
  legacySnapshot?: JsonMap;
  extra?: JsonMap;
}

export interface AddressValue {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface ContactValue {
  name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  role?: string;
}

export interface CustomerEntity extends BaseEntity {
  customerCode: string;
  name: string;
  status: 'active' | 'inactive' | 'credit_hold' | 'archived';
  category: string;
  segment: string;
  email?: string;
  phone?: string;
  taxNumber?: string;
  address?: AddressValue;
  primaryContact?: ContactValue;
  currency: string;
  creditLimit: number;
  outstandingBalance: number;
  walletBalance: number;
  balance: number;
  paymentTermsDays: number;
}

export interface SupplierEntity extends BaseEntity {
  supplierCode: string;
  name: string;
  status: 'active' | 'inactive' | 'on_hold' | 'archived';
  category: string;
  email?: string;
  phone?: string;
  taxNumber?: string;
  address?: AddressValue;
  primaryContact?: ContactValue;
  currency: string;
  paymentTermsDays: number;
  outstandingBalance: number;
}

export interface ProductEntity extends BaseEntity {
  sku: string;
  name: string;
  displayName: string;
  barcode: string;
  productType: 'raw_material' | 'service' | 'finished_good' | 'stationery' | 'exam_material';
  categoryId: string;
  description?: string;
  unitOfMeasure: string;
  currency: string;
  cost: number;
  price: number;
  stockOnHand: number;
  reservedStock: number;
  availableStock: number;
  reorderPoint: number;
  safetyStock: number;
  preferredSupplierId?: string;
  pricingProfile?: JsonMap;
  status: 'active' | 'inactive' | 'archived';
}

export interface InventoryBalanceEntity extends BaseEntity {
  productId: string;
  warehouseId: string;
  warehouseCode: string;
  batchNumber?: string;
  serialNumber?: string;
  onHand: number;
  reserved: number;
  available: number;
  averageCost: number;
  lastCountedAt?: string;
  status: 'active' | 'quarantined' | 'archived';
}

export interface InvoiceLineEntity {
  id: string;
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  metadata?: JsonMap;
}

export interface InvoiceEntity extends BaseEntity {
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  status: 'draft' | 'unpaid' | 'partial' | 'paid' | 'voided';
  issuedAt: string;
  dueAt?: string;
  currency: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  paidAmount: number;
  balanceDue: number;
  originModule: string;
  originReference?: string;
  paymentMethod?: string;
  notes?: string;
  lineItems: InvoiceLineEntity[];
}

export interface WorkCenterEntity extends BaseEntity {
  centerCode: string;
  name: string;
  status: 'active' | 'inactive' | 'maintenance' | 'archived';
  description?: string;
  location?: string;
  hourlyRate: number;
  capacityPerDay: number;
}

export interface ProductionResourceEntity extends BaseEntity {
  resourceCode: string;
  name: string;
  workCenterId: string;
  status: 'active' | 'inactive' | 'maintenance' | 'retired';
  resourceType?: string;
  description?: string;
  capacityHoursPerDay: number;
  hourlyCost: number;
}

export interface ManufacturingJobEntity extends BaseEntity {
  jobNumber: string;
  module: 'production' | 'printing' | 'examination' | 'service';
  sourceType: 'work_order' | 'batch' | 'job_ticket' | 'manual';
  status: 'draft' | 'scheduled' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  customerId?: string;
  customerName?: string;
  productId?: string;
  batchId?: string;
  workCenterId: string;
  resourceIds: string[];
  scheduledStart: string;
  scheduledEnd?: string;
  quantityPlanned: number;
  quantityCompleted: number;
  quantityScrapped: number;
  estimatedCost: number;
  actualCost: number;
  stateSnapshot?: JsonMap;
}

export interface ExaminationPricingSubjectEntity {
  id: string;
  subjectName: string;
  pages: number;
  extraCopies: number;
  totalPages: number;
  totalSheets: number;
}

export interface ExaminationPricingClassEntity {
  id: string;
  className: string;
  learners: number;
  suggestedCostPerLearner: number;
  finalCostPerLearner: number;
  calculatedTotalCost: number;
  totalPrice: number;
  subjects: ExaminationPricingSubjectEntity[];
}

export interface ExaminationPricingEntity extends BaseEntity {
  batchNumber: string;
  schoolId: string;
  customerId: string;
  name: string;
  academicYear?: string;
  term?: string;
  examType?: string;
  status: 'draft' | 'calculated' | 'approved' | 'invoiced' | 'archived';
  currency: string;
  expectedCandidature: number;
  totalAmount: number;
  materialTotal: number;
  adjustmentTotal: number;
  roundingTotal: number;
  pricingLock?: JsonMap;
  pricingSnapshot?: JsonMap;
  invoiceId?: string;
  classes: ExaminationPricingClassEntity[];
}

export interface NotificationEntity extends BaseEntity {
  notificationType: string;
  category: 'system' | 'workflow' | 'inventory' | 'finance' | 'examination';
  userId: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  entityType?: string;
  entityId: string;
  isRead: boolean;
  deliveredAt?: string;
  readAt?: string;
  expiresAt?: string;
  metadata?: JsonMap;
}

export interface SettingEntity extends BaseEntity {
  settingKey: string;
  category: 'system' | 'company' | 'finance' | 'inventory' | 'security' | 'offline';
  scope: 'global' | 'user' | 'module';
  valueType: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  valueJson: string;
  checksumValue?: string;
  isSystem: boolean;
}

export interface AuditLogEntity extends BaseEntity {
  timestamp: string;
  correlationId: string;
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  beforeJson?: string;
  afterJson?: string;
  deltaJson?: string;
  integrityHash?: string;
}

export interface SyncOperationRequestEntity {
  url: string;
  method: 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  bodyJson: string;
}

export interface SyncOperationEntity extends BaseEntity {
  entityType: string;
  operation: SyncOperationType;
  entityId: string;
  correlationId: string;
  queueStatus: SyncOperationStatus;
  retries: number;
  nextRetryAt: string;
  lastError?: string;
  request: SyncOperationRequestEntity;
}

export interface PaymentEntity extends BaseEntity {
  paymentNumber: string;
  invoiceId: string;
  customerId: string;
  amount: number;
  currency: string;
  method: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  processedAt: string;
  reference?: string;
  notes?: string;
}

export interface ExpenseEntity extends BaseEntity {
  expenseNumber: string;
  supplierId: string;
  category: string;
  amount: number;
  currency: string;
  status: 'draft' | 'approved' | 'paid' | 'cancelled';
  incurredAt: string;
  paidAt?: string;
  description?: string;
  notes?: string;
}

export interface WarehouseEntity extends BaseEntity {
  warehouseCode: string;
  name: string;
  location?: string;
  status: 'active' | 'inactive' | 'archived';
  capacity?: number;
}

export interface StockMovementEntity extends BaseEntity {
  productId: string;
  warehouseId: string;
  type: 'inbound' | 'outbound' | 'transfer' | 'adjustment';
  quantity: number;
  unitCost: number;
  totalCost: number;
  reference: string;
  referenceType: string;
  movedAt: string;
  notes?: string;
}

export interface UserEntity extends BaseEntity {
  username: string;
  email: string;
  role: string;
  permissions: string[];
  status: 'active' | 'inactive' | 'suspended';
  lastLoginAt?: string;
  preferences?: JsonMap;
}

export type DomainEntity =
  | CustomerEntity
  | SupplierEntity
  | ProductEntity
  | InventoryBalanceEntity
  | InvoiceEntity
  | PaymentEntity
  | ExpenseEntity
  | WorkCenterEntity
  | ProductionResourceEntity
  | ManufacturingJobEntity
  | ExaminationPricingEntity
  | NotificationEntity
  | SettingEntity
  | AuditLogEntity
  | SyncOperationEntity
  | UserEntity
  | WarehouseEntity
  | StockMovementEntity;
