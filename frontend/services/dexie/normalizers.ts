import type {
  BaseEntity, CustomerEntity, SupplierEntity, ProductEntity,
  InvoiceEntity, InvoiceLineEntity, WorkCenterEntity, ProductionResourceEntity,
  ExaminationPricingEntity, ExaminationPricingClassEntity, ExaminationPricingSubjectEntity,
  NotificationEntity, SettingEntity, AuditLogEntity, SyncOperationEntity,
  EntitySource, JsonMap, AddressValue, ContactValue
} from './types';

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};

const toStringOrUndefined = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
};

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  }
  return fallback;
};

export const toIsoString = (value?: unknown): string => {
  const parsed = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
};

const sanitizeAddress = (value: unknown): AddressValue | undefined => {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) return undefined;
  return {
    line1: toStringOrUndefined(record.line1 ?? record.addressLine1 ?? record.address),
    line2: toStringOrUndefined(record.line2 ?? record.addressLine2),
    city: toStringOrUndefined(record.city),
    state: toStringOrUndefined(record.state ?? record.region),
    postalCode: toStringOrUndefined(record.postalCode ?? record.zipCode),
    country: toStringOrUndefined(record.country),
  };
};

const sanitizeContact = (value: unknown): ContactValue | undefined => {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) return undefined;
  return {
    name: toStringOrUndefined(record.name),
    email: toStringOrUndefined(record.email),
    phone: toStringOrUndefined(record.phone),
    mobile: toStringOrUndefined(record.mobile ?? record.cell),
    role: toStringOrUndefined(record.role ?? record.title),
  };
};

const cloneSnapshot = (value: unknown): JsonMap | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  try { return JSON.parse(JSON.stringify(value)) as JsonMap; } catch { return undefined; }
};

const normalizeBase = <T extends BaseEntity>(
  input: Record<string, any>,
  source: EntitySource,
  defaults?: Partial<T>
): Partial<BaseEntity & T> => {
  const createdAt = toIsoString(input.createdAt ?? input.created_at);
  const updatedAt = toIsoString(input.updatedAt ?? input.updated_at ?? createdAt);
  return {
    entityVersion: Math.max(1, toNumber(input.entityVersion ?? input.version, 1)),
    createdAt,
    updatedAt,
    isDeleted: toBoolean(input.deleted ?? input.isDeleted, false),
    deletedAt: toStringOrUndefined(input.deletedAt ?? input.deleted_at),
    source,
    checksum: toStringOrUndefined(input.checksum ?? input.sync_checksum),
    sync: {
      status: (toStringOrUndefined(input.sync?.status ?? input._syncStatus) || 'pending') as BaseEntity['sync']['status'],
      retryCount: toNumber(input.sync?.retryCount ?? input.retryCount ?? 0, 0),
      lastSyncedAt: toStringOrUndefined(input.sync?.lastSyncedAt ?? input._lastSyncedAt),
      lastError: toStringOrUndefined(input.sync?.lastError ?? input.lastError),
      correlationId: toStringOrUndefined(input.sync?.correlationId ?? input.correlationId),
    },
    tags: Array.isArray(input.tags) ? input.tags : [],
    legacySnapshot: cloneSnapshot(input),
    extra: cloneSnapshot(input.extra) as JsonMap | undefined,
    ...defaults,
  };
};

export const normalizeLegacyCustomer = (value: unknown, source: EntitySource = 'legacy-idb'): CustomerEntity => {
  const record = asRecord(value);
  return {
    id: toStringOrUndefined(record.id) || crypto.randomUUID?.(),
    customerCode: toStringOrUndefined(record.customerCode ?? record.code ?? record.id) || `CUS-${Date.now()}`,
    name: toStringOrUndefined(record.name) || 'Unnamed Customer',
    status: (toStringOrUndefined(record.status)?.toLowerCase().replace(/\s+/g, '_') || 'active') as CustomerEntity['status'],
    category: toStringOrUndefined(record.category) || 'General',
    segment: toStringOrUndefined(record.segment) || 'B2B',
    email: toStringOrUndefined(record.email),
    phone: toStringOrUndefined(record.phone),
    taxNumber: toStringOrUndefined(record.taxNumber ?? record.tax_number),
    address: sanitizeAddress(record.address ?? record.billingAddress ?? record),
    primaryContact: sanitizeContact(record.primaryContact ?? record.contact ?? record),
    currency: toStringOrUndefined(record.currency ?? record.currencySymbol) || 'MWK',
    creditLimit: toNumber(record.creditLimit ?? record.credit_limit, 0),
    outstandingBalance: toNumber(record.outstandingBalance ?? record.outstanding_balance, 0),
    walletBalance: toNumber(record.walletBalance ?? record.wallet_balance, 0),
    balance: toNumber(record.balance, 0),
    paymentTermsDays: toNumber(record.paymentTermsDays ?? record.payment_terms_days, 30),
    ...normalizeBase<CustomerEntity>(record, source),
  } as CustomerEntity;
};

export const denormalizeCustomer = (document: CustomerEntity): Record<string, any> => ({
  ...(document.legacySnapshot || {}),
  id: document.id, code: document.customerCode, customerCode: document.customerCode,
  name: document.name, status: document.status, category: document.category,
  segment: document.segment, email: document.email, phone: document.phone,
  currency: document.currency, creditLimit: document.creditLimit,
  outstandingBalance: document.outstandingBalance, walletBalance: document.walletBalance,
  balance: document.balance, paymentTermsDays: document.paymentTermsDays,
  address: document.address, primaryContact: document.primaryContact,
  createdAt: document.createdAt, updatedAt: document.updatedAt, deleted: document.isDeleted,
});

export const normalizeLegacyProduct = (value: unknown, source: EntitySource = 'legacy-idb'): ProductEntity => {
  const record = asRecord(value);
  const stockOnHand = toNumber(record.stock ?? record.quantity, 0);
  const reservedStock = toNumber(record.reserved, 0);
  const rawType = (toStringOrUndefined(record.type) || 'finished_good').toLowerCase();
  const productType: ProductEntity['productType'] =
    rawType === 'material' || rawType === 'raw material' ? 'raw_material'
    : rawType === 'stationery' ? 'stationery'
    : rawType === 'service' ? 'service'
    : rawType === 'exam_material' ? 'exam_material'
    : 'finished_good';
  return {
    id: toStringOrUndefined(record.id) || crypto.randomUUID?.(),
    sku: toStringOrUndefined(record.sku ?? record.serviceSku ?? record.id) || `SKU-${Date.now()}`,
    name: toStringOrUndefined(record.name) || 'Unnamed Product',
    displayName: toStringOrUndefined(record.displayName ?? record.name) || 'Unnamed Product',
    barcode: toStringOrUndefined(record.barcode) || '',
    productType, categoryId: toStringOrUndefined(record.categoryId ?? record.category) || '',
    description: toStringOrUndefined(record.description),
    unitOfMeasure: toStringOrUndefined(record.unit ?? record.usageUnit) || 'units',
    currency: toStringOrUndefined(record.currency) || 'MWK',
    cost: toNumber(record.cost ?? record.cost_price, 0),
    price: toNumber(record.price ?? record.selling_price, 0),
    stockOnHand, reservedStock, availableStock: Math.max(0, stockOnHand - reservedStock),
    reorderPoint: toNumber(record.reorderPoint ?? record.minStockLevel, 0),
    safetyStock: toNumber(record.safetyStock ?? record.minOrderQty, 0),
    preferredSupplierId: toStringOrUndefined(record.preferredSupplierId),
    pricingProfile: cloneSnapshot(record.pricingConfig ?? record.smartPricing),
    status: (toStringOrUndefined(record.status)?.toLowerCase() || 'active') as ProductEntity['status'],
    ...normalizeBase<ProductEntity>(record, source),
  } as ProductEntity;
};

export const denormalizeProduct = (document: ProductEntity): Record<string, any> => ({
  ...(document.legacySnapshot || {}), id: document.id, sku: document.sku,
  name: document.name, displayName: document.displayName, barcode: document.barcode,
  type: document.productType, category: document.categoryId,
  description: document.description, unit: document.unitOfMeasure,
  currency: document.currency, cost: document.cost, price: document.price,
  stock: document.stockOnHand, reserved: document.reservedStock,
  reorderPoint: document.reorderPoint, preferredSupplierId: document.preferredSupplierId,
  smartPricing: document.pricingProfile, status: document.status,
  createdAt: document.createdAt, updatedAt: document.updatedAt, deleted: document.isDeleted,
});

export const normalizeLegacyInvoice = (value: unknown, source: EntitySource = 'legacy-idb'): InvoiceEntity => {
  const record = asRecord(value);
  const lineItems: InvoiceLineEntity[] = Array.isArray(record.lineItems ?? record.items) 
    ? (record.lineItems ?? record.items).map((line: any, index: number) => ({
        id: toStringOrUndefined(line.id) || `line-${index + 1}`,
        productId: toStringOrUndefined(line.productId ?? line.itemId),
        description: toStringOrUndefined(line.description ?? line.name) || `Line ${index + 1}`,
        quantity: toNumber(line.quantity, 0), unitPrice: toNumber(line.unitPrice ?? line.price, 0),
        lineDiscount: toNumber(line.lineDiscount ?? line.discount, 0),
        taxRate: toNumber(line.taxRate ?? line.tax, 0), taxAmount: toNumber(line.taxAmount, 0),
        lineTotal: toNumber(line.lineTotal ?? line.total, 0),
        metadata: cloneSnapshot(line.metadata ?? line),
      }))
    : [];
  const subtotal = toNumber(record.subtotal, lineItems.reduce((s, l) => s + l.lineTotal, 0));
  const total = toNumber(record.total ?? record.totalAmount, subtotal);
  const paidAmount = toNumber(record.paidAmount ?? record.amountPaid, 0);
  return {
    id: toStringOrUndefined(record.id) || crypto.randomUUID?.(),
    invoiceNumber: toStringOrUndefined(record.invoiceNumber ?? record.invoice_number ?? record.id) || `INV-${Date.now()}`,
    customerId: toStringOrUndefined(record.customerId ?? record.customer_id) || '',
    customerName: toStringOrUndefined(record.customerName ?? record.customer_name) || 'Walk-in Customer',
    status: (toStringOrUndefined(record.status)?.toLowerCase() || 'draft') as InvoiceEntity['status'],
    issuedAt: toIsoString(record.date ?? record.issuedAt ?? record.created_at),
    dueAt: record.dueDate ? toIsoString(record.dueDate) : undefined,
    currency: toStringOrUndefined(record.currency) || 'MWK',
    subtotal, discountTotal: toNumber(record.discountTotal ?? record.discount, 0),
    taxTotal: toNumber(record.taxTotal ?? record.tax, 0), total, paidAmount,
    balanceDue: Math.max(0, total - paidAmount),
    originModule: toStringOrUndefined(record.originModule ?? record.origin_module ?? record.type) || '',
    originReference: toStringOrUndefined(record.originReference ?? record.origin_batch_id),
    paymentMethod: toStringOrUndefined(record.paymentMethod ?? record.payment_method),
    notes: toStringOrUndefined(record.notes), lineItems,
    ...normalizeBase<InvoiceEntity>(record, source),
  } as InvoiceEntity;
};

export const denormalizeInvoice = (document: InvoiceEntity): Record<string, any> => ({
  ...(document.legacySnapshot || {}), id: document.id,
  invoiceNumber: document.invoiceNumber, customerId: document.customerId,
  customerName: document.customerName, status: document.status,
  date: document.issuedAt, dueDate: document.dueAt, currency: document.currency,
  subtotal: document.subtotal, total: document.total, paidAmount: document.paidAmount,
  balanceDue: document.balanceDue, originModule: document.originModule,
  paymentMethod: document.paymentMethod, notes: document.notes,
  items: document.lineItems, createdAt: document.createdAt,
  updatedAt: document.updatedAt, deleted: document.isDeleted,
});

export const normalizeLegacySetting = (key: string, value: unknown, source: EntitySource = 'legacy-local-storage', category: SettingEntity['category'] = 'system'): SettingEntity => {
  const valueJson = JSON.stringify(value);
  const valueType: SettingEntity['valueType'] =
    value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'object' ? 'object' : typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string';
  return {
    id: key, settingKey: key, category, scope: 'global', valueType, valueJson,
    isSystem: key.startsWith('system:') || key.startsWith('offline:'),
    entityVersion: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    isDeleted: false, source, sync: { status: 'pending', retryCount: 0 }, tags: [],
  } as SettingEntity;
};

export const parseSettingValue = <T = unknown>(document?: SettingEntity): T | undefined => {
  if (!document) return undefined;
  try { return JSON.parse(document.valueJson) as T; } catch { return undefined; }
};

export const normalizeLegacyExaminationBatch = (value: unknown, source: EntitySource = 'legacy-idb'): ExaminationPricingEntity => {
  const record = asRecord(value);
  const batchNumber = toStringOrUndefined(record.batchNumber ?? record.batch_number ?? record.id) || `BATCH-${Date.now()}`;
  const normalizeClasses = (classes: unknown): ExaminationPricingClassEntity[] => {
    if (!Array.isArray(classes)) return [];
    return classes.map((cls: any, idx: number) => ({
      id: toStringOrUndefined(cls.id) || `class-${idx + 1}`,
      className: toStringOrUndefined(cls.className ?? cls.class_name ?? cls.name) || `Class ${idx + 1}`,
      learners: toNumber(cls.learners ?? cls.number_of_learners, 0),
      suggestedCostPerLearner: toNumber(cls.suggestedCostPerLearner ?? cls.suggested_cost_per_learner, 0),
      finalCostPerLearner: toNumber(cls.finalCostPerLearner ?? cls.final_fee_per_learner ?? cls.price_per_learner, 0),
      calculatedTotalCost: toNumber(cls.calculatedTotalCost ?? cls.calculated_total_cost, 0),
      totalPrice: toNumber(cls.totalPrice ?? cls.total_price ?? cls.live_total_preview, 0),
      subjects: Array.isArray(cls.subjects) ? cls.subjects.map((subj: any, si: number) => ({
        id: toStringOrUndefined(subj.id) || `subject-${si + 1}`,
        subjectName: toStringOrUndefined(subj.subjectName ?? subj.subject_name ?? subj.name) || `Subject ${si + 1}`,
        pages: toNumber(subj.pages, 0), extraCopies: toNumber(subj.extraCopies ?? subj.extra_copies, 0),
        totalPages: toNumber(subj.totalPages ?? subj.total_pages, 0),
        totalSheets: toNumber(subj.totalSheets ?? subj.total_sheets, 0),
      })) : [],
    }));
  };
  return {
    id: toStringOrUndefined(record.id) || batchNumber, batchNumber,
    schoolId: toStringOrUndefined(record.schoolId ?? record.school_id) || '',
    customerId: toStringOrUndefined(record.customerId ?? record.customer_id) || '',
    name: toStringOrUndefined(record.name) || batchNumber,
    academicYear: toStringOrUndefined(record.academicYear ?? record.academic_year),
    term: toStringOrUndefined(record.term), examType: toStringOrUndefined(record.examType ?? record.exam_type),
    status: (toStringOrUndefined(record.status)?.toLowerCase() || 'draft') as ExaminationPricingEntity['status'],
    currency: toStringOrUndefined(record.currency) || 'MWK',
    expectedCandidature: toNumber(record.expectedCandidature ?? record.expected_candidature, 0),
    totalAmount: toNumber(record.totalAmount ?? record.total_amount, 0),
    materialTotal: toNumber(record.materialTotal ?? record.material_total ?? record.calculated_material_total, 0),
    adjustmentTotal: toNumber(record.adjustmentTotal ?? record.adjustment_total ?? record.calculated_adjustment_total, 0),
    roundingTotal: toNumber(record.roundingTotal ?? record.rounding_adjustment_total, 0),
    pricingLock: cloneSnapshot(record.pricingLock ?? record.pricing_lock),
    pricingSnapshot: cloneSnapshot(record.pricingSettingsSnapshot ?? record.pricing_settings_snapshot),
    invoiceId: toStringOrUndefined(record.invoiceId ?? record.invoice_id),
    classes: normalizeClasses(record.classes),
    ...normalizeBase<ExaminationPricingEntity>(record, source),
  } as ExaminationPricingEntity;
};

export const denormalizeExaminationBatch = (document: ExaminationPricingEntity): Record<string, any> => ({
  ...(document.legacySnapshot || {}), id: document.id,
  batchNumber: document.batchNumber, schoolId: document.schoolId,
  customerId: document.customerId, name: document.name,
  academicYear: document.academicYear, term: document.term,
  examType: document.examType, status: document.status,
  currency: document.currency, expectedCandidature: document.expectedCandidature,
  totalAmount: document.totalAmount, materialTotal: document.materialTotal,
  adjustmentTotal: document.adjustmentTotal, roundingTotal: document.roundingTotal,
  pricingLock: document.pricingLock, pricingSnapshot: document.pricingSnapshot,
  invoiceId: document.invoiceId, classes: document.classes,
  createdAt: document.createdAt, updatedAt: document.updatedAt, deleted: document.isDeleted,
});

export const normalizeLegacyNotification = (value: unknown, source: EntitySource = 'legacy-idb'): NotificationEntity => {
  const record = asRecord(value);
  const statusCategory = (toStringOrUndefined(record.category ?? record.type) || 'system').toLowerCase();
  return {
    id: toStringOrUndefined(record.id) || crypto.randomUUID?.(),
    notificationType: toStringOrUndefined(record.notificationType ?? record.notification_type ?? record.type) || 'SYSTEM',
    category: (statusCategory.includes('exam') ? 'examination' : statusCategory.includes('inventory') ? 'inventory' : statusCategory.includes('finance') ? 'finance' : statusCategory.includes('workflow') ? 'workflow' : 'system') as NotificationEntity['category'],
    userId: toStringOrUndefined(record.userId ?? record.user_id) || '',
    title: toStringOrUndefined(record.title ?? record.message) || 'Notification',
    message: toStringOrUndefined(record.message) || 'Notification',
    priority: (toStringOrUndefined(record.priority)?.toLowerCase() || 'medium') as NotificationEntity['priority'],
    entityType: toStringOrUndefined(record.entityType ?? record.entity_type ?? (record.batch_id ? 'examination_batch' : undefined)),
    entityId: toStringOrUndefined(record.entityId ?? record.entity_id ?? record.batch_id) || '',
    isRead: toBoolean(record.isRead ?? record.is_read, false),
    deliveredAt: record.deliveredAt ? toIsoString(record.deliveredAt) : undefined,
    readAt: record.readAt ? toIsoString(record.readAt) : undefined,
    expiresAt: record.expiresAt ? toIsoString(record.expiresAt) : undefined,
    metadata: cloneSnapshot(record.metadata ?? record.batch_details),
    ...normalizeBase<NotificationEntity>(record, source),
  } as NotificationEntity;
};

export const normalizeLegacyWorkCenter = (value: unknown, source: EntitySource = 'legacy-idb'): WorkCenterEntity => {
  const record = asRecord(value);
  return {
    id: toStringOrUndefined(record.id) || crypto.randomUUID?.(),
    centerCode: toStringOrUndefined(record.centerCode ?? record.code ?? record.id) || `WC-${Date.now()}`,
    name: toStringOrUndefined(record.name) || 'Unnamed Work Center',
    status: (toStringOrUndefined(record.status)?.toLowerCase() || 'active') as WorkCenterEntity['status'],
    description: toStringOrUndefined(record.description),
    location: toStringOrUndefined(record.location),
    hourlyRate: toNumber(record.hourlyRate ?? record.hourly_rate, 0),
    capacityPerDay: toNumber(record.capacityPerDay ?? record.capacity_per_day, 0),
    ...normalizeBase<WorkCenterEntity>(record, source),
  } as WorkCenterEntity;
};

export const normalizeLegacyProductionResource = (value: unknown, source: EntitySource = 'legacy-idb'): ProductionResourceEntity => {
  const record = asRecord(value);
  return {
    id: toStringOrUndefined(record.id) || crypto.randomUUID?.(),
    resourceCode: toStringOrUndefined(record.resourceCode ?? record.code ?? record.id) || `RES-${Date.now()}`,
    name: toStringOrUndefined(record.name) || 'Unnamed Resource',
    workCenterId: toStringOrUndefined(record.workCenterId ?? record.work_center_id) || 'UNASSIGNED',
    status: (toStringOrUndefined(record.status)?.toLowerCase() || 'active') as ProductionResourceEntity['status'],
    resourceType: toStringOrUndefined(record.resourceType ?? record.resource_type),
    description: toStringOrUndefined(record.description),
    capacityHoursPerDay: toNumber(record.capacityHoursPerDay ?? record.capacity_per_day ?? 8, 8),
    hourlyCost: toNumber(record.hourlyCost ?? record.hourly_rate, 0),
    ...normalizeBase<ProductionResourceEntity>(record, source),
  } as ProductionResourceEntity;
};

export const normalizeLegacyAuditLog = (value: unknown, source: EntitySource = 'legacy-idb'): AuditLogEntity => {
  const record = asRecord(value);
  return {
    id: toStringOrUndefined(record.id) || crypto.randomUUID?.(),
    timestamp: toIsoString(record.timestamp ?? record.createdAt ?? record.created_at),
    correlationId: toStringOrUndefined(record.correlationId ?? record.correlation_id) || crypto.randomUUID?.(),
    actorId: toStringOrUndefined(record.actorId ?? record.user_id ?? record.userId) || 'system',
    actorRole: toStringOrUndefined(record.actorRole ?? record.user_role ?? record.role) || 'system',
    action: toStringOrUndefined(record.action) || 'UNKNOWN',
    entityType: toStringOrUndefined(record.entityType ?? record.entity_type) || 'unknown',
    entityId: toStringOrUndefined(record.entityId ?? record.entity_id) || 'unknown',
    reason: toStringOrUndefined(record.reason),
    ipAddress: toStringOrUndefined(record.ipAddress ?? record.ip_address),
    userAgent: toStringOrUndefined(record.userAgent ?? record.user_agent),
    beforeJson: toStringOrUndefined(record.beforeJson ?? record.old_value ?? record.before),
    afterJson: toStringOrUndefined(record.afterJson ?? record.new_value ?? record.after),
    deltaJson: toStringOrUndefined(record.deltaJson ?? record.delta),
    integrityHash: toStringOrUndefined(record.integrityHash ?? record.integrity_hash),
    ...normalizeBase<AuditLogEntity>(record, source),
  } as AuditLogEntity;
};

export const normalizeLegacySyncOperation = (value: unknown, source: EntitySource = 'legacy-idb'): SyncOperationEntity => {
  const record = asRecord(value);
  const safeJsonStringify = (v: unknown): string | undefined => {
    if (v === undefined) return undefined;
    try { return JSON.stringify(v); } catch { return undefined; }
  };
  return {
    id: toStringOrUndefined(record.id) || crypto.randomUUID?.(),
    entityType: toStringOrUndefined(record.entityType ?? record.entity_type) || 'unknown',
    operation: (toStringOrUndefined(record.operation) || 'create') as SyncOperationEntity['operation'],
    entityId: toStringOrUndefined(record.entityId ?? record.entity_id) || crypto.randomUUID?.(),
    correlationId: toStringOrUndefined(record.correlationId ?? record.correlation_id) || crypto.randomUUID?.(),
    queueStatus: (toStringOrUndefined(record.status ?? record.queueStatus) || 'pending') as SyncOperationEntity['queueStatus'],
    retries: toNumber(record.retries, 0),
    nextRetryAt: record.nextRetryAt ? toIsoString(record.nextRetryAt) : new Date(Date.now() + 60000).toISOString(),
    lastError: toStringOrUndefined(record.lastError ?? record.last_error),
    request: {
      url: toStringOrUndefined(record.request?.url) || '',
      method: (toStringOrUndefined(record.request?.method) || 'POST') as SyncOperationEntity['request']['method'],
      headers: asRecord(record.request?.headers) as Record<string, string>,
      bodyJson: safeJsonStringify(record.request?.body) || 'null',
    },
    ...normalizeBase<SyncOperationEntity>(record, source, {
      extra: cloneSnapshot({
        queuePriority: toStringOrUndefined(record.priority),
        dedupeKey: toStringOrUndefined(record.dedupeKey),
        processor: toStringOrUndefined(record.processor),
        availableAt: toStringOrUndefined(record.availableAt ?? record.nextRetryAt),
        optimistic: toBoolean(record.optimistic, true),
        conflictKey: toStringOrUndefined(record.conflictKey),
        lastAttemptAt: toStringOrUndefined(record.lastAttemptAt),
        payloadJson: safeJsonStringify(record.payload),
        attemptHistoryJson: safeJsonStringify(record.attemptHistory),
      }),
    } as any),
  } as SyncOperationEntity;
};
