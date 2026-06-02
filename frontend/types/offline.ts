export type SyncOperation = 'create' | 'update' | 'delete';
export type SyncQueueStatus = 'pending' | 'syncing' | 'failed' | 'blocked';
export type BatchSyncStatus = 'pending' | 'synced' | 'failed' | 'blocked';
export type SyncQueuePriority = 'low' | 'normal' | 'high' | 'urgent';

export interface SyncAttemptRecord {
  attemptedAt: string;
  status: SyncQueueStatus | 'synced' | 'conflict';
  error?: string;
}

export interface BatchSubjectRecord {
  id: string;
  name?: string;
  subject_name?: string;
  pages?: number;
  extra_copies?: number;
  total_pages?: number;
  total_sheets?: number;
  [key: string]: unknown;
}

export interface BatchClassRecord {
  id: string;
  name?: string;
  class_name?: string;
  number_of_learners?: number;
  expected_fee_per_learner?: number;
  final_fee_per_learner?: number;
  live_total_preview?: number;
  material_total_cost?: number;
  adjustment_total_cost?: number;
  calculated_total_cost?: number;
  subjects?: BatchSubjectRecord[];
  [key: string]: unknown;
}

export interface BatchRecord {
  id: string;
  batch_number?: string;
  batchNumber?: string;
  school_id?: string;
  customerId?: string;
  name?: string;
  academic_year?: string;
  term?: string;
  exam_type?: string;
  type?: string;
  parent_batch_id?: string;
  status?: string;
  currency?: string;
  total_amount?: number;
  material_total?: number;
  adjustment_total?: number;
  created_at?: string;
  updated_at?: string;
  classes?: BatchClassRecord[];
  subjects?: BatchSubjectRecord[];
  pricing_settings_snapshot?: Record<string, unknown>;
  pricing_lock?: Record<string, unknown>;
  _offline?: boolean;
  _syncStatus?: BatchSyncStatus;
  _lastSyncedAt?: string;
  _lastModifiedAt?: string;
  [key: string]: unknown;
}

export interface SyncRequest<TPayload = Record<string, unknown>> {
  url: string;
  method: 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  body: TPayload;
}

export interface SyncQueueItem<TPayload = Record<string, unknown>> {
  id: string;
  entityType: 'examination-batch';
  operation: SyncOperation;
  entityId: string;
  correlationId: string;
  request: SyncRequest<TPayload>;
  payload: TPayload;
  status: SyncQueueStatus;
  retries: number;
  createdAt: string;
  updatedAt: string;
  nextRetryAt: string | null;
  lastError: string | null;
  priority?: SyncQueuePriority;
  dedupeKey?: string;
  availableAt?: string | null;
  processor?: string;
  optimistic?: boolean;
  conflictKey?: string;
  lastAttemptAt?: string | null;
  attemptHistory?: SyncAttemptRecord[];
}

export interface APIResponse<T> {
  data: T;
  source: 'remote' | 'cache';
  syncedAt: string | null;
  stale: boolean;
}

export interface AuthState {
  userId: string | null;
  role: string | null;
  isSuperAdmin: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  authMode: 'supabase' | 'anonymous';
  isAuthenticated: boolean;
}

export interface OfflineState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  pendingMutations: number;
  authBlocked: boolean;
  cacheReady: boolean;
  reason?: string;
}
