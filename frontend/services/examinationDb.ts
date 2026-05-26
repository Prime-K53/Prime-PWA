import Dexie, { type Table } from 'dexie';

export interface DexieExaminationBatch {
  id: string;
  name?: string;
  school_id?: string;
  exam_type?: string;
  currency?: string;
  status?: string;
  total_amount?: number;
  classes?: any[];
  approvals?: any;
  invoice?: any;
  batch_number?: string;
  batchNumber?: string;
  created_at: string;
  updated_at: string;
  _syncStatus?: string;
  _lastSyncedAt?: string;
  _offline?: boolean;
  _lastModifiedAt?: string;
  [key: string]: any;
}

export interface DexieExaminationBatchNotification {
  id: string;
  batch_id: string;
  user_id?: string;
  notification_type: string;
  title?: string;
  message?: string;
  priority?: string;
  batch_details?: any;
  is_read?: boolean | number;
  read_at?: string | null;
  delivered_at?: string;
  created_at: string;
  expires_at?: string;
}

export interface DexieExaminationJob {
  id: string;
  school_id?: string;
  status?: string;
  subjects?: any[];
  invoice_group_id?: string;
  invoice_id?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface DexieExaminationJobSubject {
  id: string;
  examination_job_id: string;
  subject_name?: string;
  pages?: number;
  [key: string]: any;
}

export interface DexieExaminationInvoiceGroup {
  id: string;
  name?: string;
  status?: string;
  invoice_id?: string;
  job_ids?: string[];
  [key: string]: any;
}

export interface DexieExaminationRecurringProfile {
  id: string;
  source_type?: string;
  source_id?: string;
  status?: string;
  [key: string]: any;
}

export interface DexieExaminationInventoryDeduction {
  id: string;
  batch_id?: string;
  [key: string]: any;
}

export interface DexieNotificationAuditLog {
  id: string;
  notification_id?: string;
  user_id?: string;
  action?: string;
  details_json?: any;
  created_at?: string;
  [key: string]: any;
}

class ExaminationDexieDB extends Dexie {
  examinationBatches!: Table<DexieExaminationBatch, string>;
  examinationBatchNotifications!: Table<DexieExaminationBatchNotification, string>;
  examinationJobs!: Table<DexieExaminationJob, string>;
  examinationJobSubjects!: Table<DexieExaminationJobSubject, string>;
  examinationInvoiceGroups!: Table<DexieExaminationInvoiceGroup, string>;
  examinationRecurringProfiles!: Table<DexieExaminationRecurringProfile, string>;
  examinationInventoryDeductions!: Table<DexieExaminationInventoryDeduction, string>;
  notificationAuditLogs!: Table<DexieNotificationAuditLog, string>;

  constructor() {
    super('PrimeERP_Examination_v1');
    this.version(1).stores({
      examinationBatches: 'id, school_id, status, created_at, batch_number',
      examinationBatchNotifications: 'id, batch_id, user_id, notification_type, is_read, created_at',
      examinationJobs: 'id, school_id, status, invoice_group_id',
      examinationJobSubjects: 'id, examination_job_id',
      examinationInvoiceGroups: 'id, status',
      examinationRecurringProfiles: 'id, source_type, source_id, status',
      examinationInventoryDeductions: 'id, batch_id',
      notificationAuditLogs: 'id, notification_id, user_id, action, created_at',
    });
  }
}

let _instance: ExaminationDexieDB | null = null;

let _indexedDbAvailable: boolean | null = null;

const canUseIndexedDB = (): boolean => {
  if (_indexedDbAvailable !== null) return _indexedDbAvailable;
  if (typeof window === 'undefined') { _indexedDbAvailable = false; return false; }
  if (typeof indexedDB === 'undefined') { _indexedDbAvailable = false; return false; }
  _indexedDbAvailable = true;
  return true;
};

export const getExaminationDb = (): ExaminationDexieDB | null => {
  if (!canUseIndexedDB()) return null;
  if (!_instance) {
    _instance = new ExaminationDexieDB();
  }
  return _instance;
};

export const examinationDb = new Proxy({} as ExaminationDexieDB, {
  get(_target, prop: string | symbol) {
    const db = getExaminationDb();
    if (!db) {
      throw new Error('IndexedDB is not available. Examination Dexie database cannot be accessed.');
    }
    return (db as any)[prop];
  }
});
