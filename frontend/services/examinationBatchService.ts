import { ExaminationBatch, ExaminationClass, ExaminationPricingSettings, ExaminationSubject, Item, MarketAdjustment } from '../types';
import { getUrl, API_BASE_URL } from '../config/api.js';
import { dbService } from './db';
import { generateNextExaminationBatchNumber } from './documentNumberService';
import { getHeaders, joinPath, safeJson, toServiceError, isLikelyNetworkError } from './examinationServiceUtils';
import { ensureBackendInProd } from './api';

export interface ExaminationInvoiceLineItem {
  id: string;
  itemId: string;
  name: string;
  sku: string;
  description?: string;
  category: string;
  type: 'Service' | 'Product' | 'Material' | 'Stationery';
  unit: string;
  minStockLevel: number;
  stock: number;
  reserved?: number;
  price: number;
  cost: number;
  quantity: number;
  total: number;
}

export interface ExaminationGeneratedInvoicePayload {
  id: string;
  backendInvoiceId: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  customerId: string;
  customerName: string;
  subtotal?: number;
  totalAmount: number;
  paidAmount: number;
  status: 'Draft' | 'Unpaid' | 'Partial' | 'Paid' | 'Overdue' | 'Cancelled';
  items: ExaminationInvoiceLineItem[];
  batchId?: string;
  schoolName?: string;
  academicYear?: string;
  term?: string;
  examType?: string;
  classBreakdown?: Array<{
    className: string;
    subjects: string[];
    totalCandidates: number;
    chargePerLearner: number;
    classTotal: number;
  }>;
  materialTotal?: number;
  adjustmentTotal?: number;
  adjustmentSnapshots?: Array<{
    name: string;
    type: 'PERCENTAGE' | 'FIXED' | 'PERCENT';
    value: number;
    calculatedAmount: number;
  }>;
  preRoundingTotalAmount?: number;
  roundingDifference?: number;
  roundingMethod?: string;
  applyRounding?: boolean;
  documentTitle?: string;
  subAccountName?: string;
  notes?: string;
  reference?: string;
  currency?: string;
  origin_module?: string;
  origin_batch_id?: string;
}

const toTimeoutMs = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const REQUEST_TIMEOUT_MS = toTimeoutMs((import.meta as any)?.env?.VITE_EXAM_REQUEST_TIMEOUT_MS, 30000);
const HEAVY_REQUEST_TIMEOUT_MS = toTimeoutMs((import.meta as any)?.env?.VITE_EXAM_HEAVY_REQUEST_TIMEOUT_MS, 180000);
const MEDIUM_REQUEST_TIMEOUT_MS = toTimeoutMs((import.meta as any)?.env?.VITE_EXAM_MEDIUM_REQUEST_TIMEOUT_MS, 60000);
const FALLBACK_CANDIDATE_TIMEOUT_MS = toTimeoutMs((import.meta as any)?.env?.VITE_EXAM_FALLBACK_CANDIDATE_TIMEOUT_MS, 12000);
const LIST_REQUEST_TIMEOUT_MS = toTimeoutMs((import.meta as any)?.env?.VITE_EXAM_LIST_REQUEST_TIMEOUT_MS, 5000);
const LIST_SYNC_BUDGET_MS = toTimeoutMs((import.meta as any)?.env?.VITE_EXAM_LIST_SYNC_BUDGET_MS, 2000);
const CREATE_REQUEST_TIMEOUT_MS = toTimeoutMs((import.meta as any)?.env?.VITE_EXAM_CREATE_REQUEST_TIMEOUT_MS, 25000);
const LOCAL_BATCH_STORE = 'examinationBatches';
const OUTBOX_STORE = 'syncOutbox';
const FALLBACK_BATCHES_KEY = 'nexus_examination_batches_fallback';
const FALLBACK_OUTBOX_KEY = 'nexus_examination_batches_outbox_fallback';

const API_BASE_CANDIDATES = () => {
  const base = API_BASE_URL;
  return base ? [`${base}/examination`] : ['api/examination'];
};

const isProd = Boolean((import.meta as any)?.env?.PROD);

const joinPath = (base: string, endpoint: string) => {
  const trimmedBase = String(base || '').replace(/^\/+|\/+$/g, '');
  const trimmedEndpoint = String(endpoint || '').replace(/^\/+/, '');
  if (!trimmedBase) return trimmedEndpoint;
  if (!trimmedEndpoint) return trimmedBase;
  return `${trimmedBase}/${trimmedEndpoint}`;
};

const isTimeoutError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.toLowerCase().includes('timeout');
};

const isOfflineError = (error: unknown) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();
  return normalized.includes('failed to fetch')
    || normalized.includes('networkerror')
    || normalized.includes('network request failed')
    || normalized.includes('load failed')
    || normalized.includes('timeout')
    || normalized.includes('aborted');
};

const isQuotaError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.toLowerCase().includes('quota')
    || message.toLowerCase().includes('exceeded')
    || message.toLowerCase().includes('storage');
};

const generateLocalId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `local-${crypto.randomUUID()}`;
  }
  return `local-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
};

const toIso = () => new Date().toISOString();
const isLocalBatchId = (id: string) => String(id || '').startsWith('local-');
const isUuidFormat = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const resolveBatchId = async (id: string): Promise<string> => {
  if (isLocalBatchId(id)) return id;
  if (isUuidFormat(id)) return id;
  const byNumber = await examinationBatchService.getBatchByNumber(id);
  if (!byNumber) throw new Error(`Batch not found: ${id}`);
  return byNumber.id;
};

const normalizeBatchForStorage = (
  batch: Partial<ExaminationBatch> & Record<string, any>,
  overrides: Record<string, any> = {}
) => {
  const id = String(batch.id || batch.batch_id || generateLocalId());
  const createdAt = String(batch.created_at || batch.createdAt || toIso());
  const updatedAt = String(batch.updated_at || batch.updatedAt || createdAt);
  const batchNumber = String(batch.batch_number || batch.batchNumber || '').trim();
  return {
    ...batch,
    id,
    ...(batchNumber ? { batch_number: batchNumber, batchNumber } : {}),
    created_at: createdAt,
    updated_at: updatedAt,
    ...overrides,
    _lastModifiedAt: overrides._lastModifiedAt || updatedAt
  };
};

const writeFallbackBatches = (batches: Array<Record<string, any>>) => {
  const trimmed = batches.map((batch) => ({
    id: String(batch.id),
    batch_number: batch.batch_number || batch.batchNumber || '',
    batchNumber: batch.batchNumber || batch.batch_number || '',
    school_id: batch.school_id,
    name: batch.name,
    academic_year: batch.academic_year,
    term: batch.term,
    exam_type: batch.exam_type,
    status: batch.status,
    currency: batch.currency,
    total_amount: batch.total_amount,
    created_at: batch.created_at,
    updated_at: batch.updated_at,
    classes: batch.classes,
    subjects: batch.subjects,
    _offline: batch._offline,
    _syncStatus: batch._syncStatus,
    _lastSyncedAt: batch._lastSyncedAt,
    _lastModifiedAt: batch._lastModifiedAt
  }));
  try {
    localStorage.setItem(FALLBACK_BATCHES_KEY, JSON.stringify(trimmed));
  } catch {
    try {
      sessionStorage.setItem(FALLBACK_BATCHES_KEY, JSON.stringify(trimmed));
    } catch {
      return;
    }
  }
};

const readFallbackBatches = () => {
  const raw = localStorage.getItem(FALLBACK_BATCHES_KEY) || sessionStorage.getItem(FALLBACK_BATCHES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readFallbackOutbox = () => {
  const raw = localStorage.getItem(FALLBACK_OUTBOX_KEY) || sessionStorage.getItem(FALLBACK_OUTBOX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeFallbackOutbox = (entries: Array<Record<string, any>>) => {
  try {
    localStorage.setItem(FALLBACK_OUTBOX_KEY, JSON.stringify(entries));
  } catch {
    try {
      sessionStorage.setItem(FALLBACK_OUTBOX_KEY, JSON.stringify(entries));
    } catch {
      return;
    }
  }
};

const getLocalBatches = async () => {
  try {
    const data = await dbService.getAll<Record<string, any>>(LOCAL_BATCH_STORE as any);
    if (Array.isArray(data) && data.length > 0) return data;
  } catch (error) {
    if (!isQuotaError(error)) {
      return readFallbackBatches();
    }
  }
  return readFallbackBatches();
};

const storeLocalBatches = async (batches: Array<Record<string, any>>) => {
  const entries = batches.map((batch) => normalizeBatchForStorage(batch));
  try {
    await Promise.all(entries.map((entry) => dbService.put(LOCAL_BATCH_STORE as any, entry)));
  } catch (error) {
    if (isQuotaError(error)) {
      writeFallbackBatches(entries);
      return;
    }
    throw error;
  }
  writeFallbackBatches(entries);
};

const storeLocalBatch = async (batch: Record<string, any>) => {
  const entry = normalizeBatchForStorage(batch);
  try {
    await dbService.put(LOCAL_BATCH_STORE as any, entry);
  } catch (error) {
    if (isQuotaError(error)) {
      const fallback = readFallbackBatches();
      const updated = [...fallback.filter(item => item.id !== entry.id), entry];
      writeFallbackBatches(updated);
      return entry;
    }
    throw error;
  }
  writeFallbackBatches([...(readFallbackBatches().filter(item => item.id !== entry.id)), entry]);
  return entry;
};

const removeLocalBatch = async (id: string) => {
  try {
    await dbService.delete(LOCAL_BATCH_STORE as any, id);
  } catch (error) {
    if (!isQuotaError(error)) {
      const fallback = readFallbackBatches().filter(item => String(item.id) !== String(id));
      writeFallbackBatches(fallback);
      return;
    }
  }
  const fallback = readFallbackBatches().filter(item => String(item.id) !== String(id));
  writeFallbackBatches(fallback);
};

const enqueueOutbox = async (type: string, entityId: string, payload: Record<string, any>) => {
  const entry = {
    id: `${type}-${entityId}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
    entityId,
    type,
    payload,
    date: toIso()
  };
  try {
    await dbService.put(OUTBOX_STORE as any, entry);
  } catch (error) {
    if (isQuotaError(error)) {
      const fallback = readFallbackOutbox();
      writeFallbackOutbox([...fallback, entry]);
      return entry;
    }
    throw error;
  }
  const fallback = readFallbackOutbox();
  writeFallbackOutbox([...fallback, entry]);
  return entry;
};

const loadOutbox = async () => {
  try {
    const entries = await dbService.getAll<Record<string, any>>(OUTBOX_STORE as any);
    if (Array.isArray(entries)) return entries;
  } catch (error) {
    if (!isQuotaError(error)) {
      return readFallbackOutbox();
    }
  }
  return readFallbackOutbox();
};

const removeOutboxEntries = async (ids: string[]) => {
  try {
    await Promise.all(ids.map((id) => dbService.delete(OUTBOX_STORE as any, id)));
  } catch (error) {
    if (!isQuotaError(error)) {
      return;
    }
  }
  const fallback = readFallbackOutbox().filter(item => !ids.includes(item.id));
  writeFallbackOutbox(fallback);
};

const fetchWithTimeout = async (
  endpoint: string,
  options: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS
) => {
  let lastError: Error | null = null;
  const baseCandidates = API_BASE_CANDIDATES();

  for (let index = 0; index < baseCandidates.length; index += 1) {
    const base = baseCandidates[index];
    const isLastAttempt = index === baseCandidates.length - 1;
    const controller = new AbortController();
    const timeoutForAttempt = !isLastAttempt
      ? Math.min(timeoutMs, FALLBACK_CANDIDATE_TIMEOUT_MS)
      : timeoutMs;

    let didTimeout = false;
    const id = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutForAttempt);

    try {
      const url = getUrl(joinPath(base, endpoint));
      console.debug(`[examinationBatchService] fetch attempt ${index + 1}/${baseCandidates.length} -> ${url} (timeout ${timeoutForAttempt}ms)`);
      const start = Date.now();
      const response = await fetch(url, {
        ...options,
        headers: { ...getHeaders(), ...options.headers },
        signal: controller.signal
      });
      const duration = Date.now() - start;
      const contentType = response.headers.get('content-type') || '';
      console.debug(`[API Response] ${response.status} ${url} in ${duration}ms (Content-Type: ${contentType})`);

      const shouldTryNext = !isLastAttempt
        && base.startsWith('/')
        && (response.status === 404 || response.status === 405 || response.status === 501);

      if (!response.ok && (shouldTryNext || response.status >= 500)) {
        lastError = new Error(`HTTP error! status: ${response.status}`);
        console.warn(`[examinationBatchService] non-ok response (${response.status}) from ${url}, will try next candidate`);
        continue;
      }

      if (contentType.includes('text/html')) {
        const err = new Error('Wrong API URL or backend route missing: Received HTML instead of JSON');
        console.error(`[API Error] HTML response detected for ${url}`, { status: response.status, contentType });
        if (shouldTryNext) {
          lastError = err;
          continue;
        }
        throw err;
      }

      return response;
    } catch (err: any) {
      const normalizedError = err instanceof Error ? err : new Error(String(err || 'Unknown request error'));
      if (didTimeout) {
        lastError = new Error(`Request timeout after ${timeoutMs}ms`);
      } else {
        lastError = normalizedError;
      }

      const canTryNextCandidate = !isLastAttempt && (
        didTimeout
        || normalizedError.name === 'AbortError'
        || isLikelyNetworkError(normalizedError)
      );

      if (!canTryNextCandidate) {
        throw lastError;
      }
    } finally {
      clearTimeout(id);
    }
  }

  throw lastError || new Error('All API candidates failed');
};

const requestWithFallback = async (
  path: string,
  options: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS
) => {
  return fetchWithTimeout(path, options, timeoutMs);
};

const createBatchRemote = async (payload: Partial<ExaminationBatch>) => {
  const mappedPayload = {
    ...payload,
    customerId: payload.school_id,
    name: payload.batch_number || payload.batchNumber,
  };
  console.log('[DEBUG] createBatchRemote - mapped payload:', JSON.stringify(mappedPayload, null, 2));
  const response = await fetchWithTimeout('/batches', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(mappedPayload),
  }, CREATE_REQUEST_TIMEOUT_MS);
  if (!response.ok) throw new Error(await toServiceError(response, 'Failed to create batch'));
  const result = await safeJson(response, 'createBatch');
  return {
    ...result,
    school_id: result.customerId,
    batch_number: result.name,
    batchNumber: result.name,
  };
};

const updateBatchRemote = async (id: string, payload: Partial<ExaminationBatch>) => {
  const resolvedId = await resolveBatchId(id);
  const response = await fetchWithTimeout(`/batches/${resolvedId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  }, REQUEST_TIMEOUT_MS);
  if (!response.ok) throw new Error(await toServiceError(response, 'Failed to update batch'));
  return safeJson(response, 'updateBatch');
};

const deleteBatchRemote = async (id: string) => {
  const resolvedId = await resolveBatchId(id);
  const response = await fetchWithTimeout(`/batches/${resolvedId}`, {
    method: 'DELETE',
    headers: getHeaders()
  }, REQUEST_TIMEOUT_MS);
  if (!response.ok) throw new Error(await toServiceError(response, 'Failed to delete batch'));
};

export const examinationBatchService = {
  _syncInProgress: false,

  async listBatches(): Promise<ExaminationBatch[]> {
    const localBatches = isProd ? [] : await getLocalBatches();
    const headers = getHeaders();
    const toBatchArray = (value: any): ExaminationBatch[] => {
      if (!Array.isArray(value)) return [];
      return value.filter((batch) => batch && typeof batch === 'object' && batch.id);
    };
    const mergeById = (remoteRows: ExaminationBatch[]) => {
      if (isProd) return remoteRows;
      const mergedMap = new Map<string, any>();
      remoteRows.forEach((batch) => {
        mergedMap.set(String(batch.id), batch);
      });
      localBatches.forEach((batch) => {
        const id = String((batch as any).id || '');
        if (!id || mergedMap.has(id)) {
          return;
        }
        mergedMap.set(id, batch);
      });
      return Array.from(mergedMap.values());
    };
    const attemptList = async (path: string) => {
      const response = await fetchWithTimeout(path, {
        method: 'GET',
        headers
      }, LIST_REQUEST_TIMEOUT_MS);
      if (!response.ok) {
        const error = new Error(await toServiceError(response, 'Failed to fetch batches'));
        (error as any).status = response.status;
        throw error;
      }
      return safeJson(response, 'listBatches');
    };

    try {
      await Promise.race([
        this.syncPendingBatches(),
        new Promise<void>((resolve) => setTimeout(resolve, LIST_SYNC_BUDGET_MS))
      ]);
    } catch (error) {
      console.warn('[examinationBatchService] syncPendingBatches skipped for list path:', error);
    }

    try {
      const primary = toBatchArray(await attemptList('/batches?mode=summary&include_subjects=1&include_class_stats=1'));
      const merged = mergeById(primary);
      await storeLocalBatches(merged.map(batch => ({
        ...batch,
        _syncStatus: (batch as any)._syncStatus || 'synced',
        _lastSyncedAt: toIso()
      })));
      return merged;
    } catch (error) {
      ensureBackendInProd('examinationBatchService.listBatches', error);
      const status = (error as any)?.status;
      if (status && status < 500 && !isTimeoutError(error)) {
        throw error;
      }
      if (localBatches.length > 0 && (isTimeoutError(error) || isOfflineError(error))) {
        return localBatches as ExaminationBatch[];
      }
    }

    try {
      const lite = toBatchArray(await attemptList('/batches?mode=lite&include_subjects=0&include_class_stats=0'));
      const merged = mergeById(lite);
      await storeLocalBatches(merged.map(batch => ({
        ...batch,
        _syncStatus: (batch as any)._syncStatus || 'synced',
        _lastSyncedAt: toIso()
      })));
      return merged;
    } catch (error) {
      ensureBackendInProd('examinationBatchService.listBatches', error);
      const fallbackLocal = localBatches.length > 0 ? localBatches : await getLocalBatches();
      if (fallbackLocal.length > 0) return fallbackLocal as ExaminationBatch[];
      const pendingOutbox = (await loadOutbox())
        .filter((entry) => entry?.type === 'examinationBatch:create')
        .map((entry) => normalizeBatchForStorage(
          {
            ...(entry.payload || {}),
            id: entry.entityId || entry.id,
            status: (entry.payload || {}).status || 'Draft'
          },
          {
            _offline: true,
            _syncStatus: 'pending'
          }
        ));
      if (pendingOutbox.length > 0) {
        return pendingOutbox as ExaminationBatch[];
      }
      return readFallbackBatches() as ExaminationBatch[];
    }
  },

  async getBatch(id: string): Promise<ExaminationBatch> {
    console.log('[DEBUG] examinationBatchService.getBatch - Fetching batch:', { id, isLocal: isLocalBatchId(id) });

    if (isLocalBatchId(id)) {
      const local = await getLocalBatches();
      const fallback = local.find(batch => String(batch.id) === String(id));
      if (fallback) return fallback as ExaminationBatch;
      throw new Error('Local batch not found');
    }

    if (!isUuidFormat(id)) {
      console.log('[DEBUG] examinationBatchService.getBatch - ID appears to be batch number, using lookup:', { id });
      const byNumber = await this.getBatchByNumber(id);
      if (byNumber) return byNumber;
      throw new Error(`Batch not found: ${id}`);
    }

    try {
      const response = await fetchWithTimeout(`/batches/${id}`, {
        headers: getHeaders()
      }, REQUEST_TIMEOUT_MS);
      if (!response.ok) {
        // Try batch number lookup if batch not found
        if (response.status === 404) {
          const local = await getLocalBatches();
          const localBatch = local.find(batch => String(batch.id) === String(id));
          if (localBatch?.batch_number) {
            console.log('[DEBUG] examinationBatchService.getBatch - Batch ID not found, trying batch number lookup:', { id, batchNumber: localBatch.batch_number });
            const foundByNumber = await this.getBatchByNumber(localBatch.batch_number);
            if (foundByNumber?.id) {
              console.log('[DEBUG] examinationBatchService.getBatch - Found batch by number:', { oldId: id, newId: foundByNumber.id });
              return this.getBatch(foundByNumber.id);
            }
          }
        }
        const errorMsg = await toServiceError(response, 'Failed to fetch batch');
        console.error('[DEBUG] examinationBatchService.getBatch - API Error:', {
          id,
          status: response.status,
          error: errorMsg
        });
        throw new Error(errorMsg);
      }
      const data = await safeJson(response, 'getBatch');
      await storeLocalBatch({
        ...data,
        _syncStatus: 'synced',
        _lastSyncedAt: toIso()
      });
      console.log('[DEBUG] examinationBatchService.getBatch - Success:', { id, batchNumber: data.batch_number });
      return data;
    } catch (error) {
      if (isOfflineError(error)) {
        ensureBackendInProd('examinationBatchService.getBatch', error);
        const local = await getLocalBatches();
        const fallback = local.find(batch => String(batch.id) === String(id));
        if (fallback) return fallback as ExaminationBatch;
      }
      console.error('[DEBUG] examinationBatchService.getBatch - Error:', { id, error });
      throw error;
    }
  },

  async createBatch(payload: Partial<ExaminationBatch>): Promise<ExaminationBatch> {
    const incomingBatchNumber = String((payload as any)?.batch_number || (payload as any)?.batchNumber || '').trim();
    const reservedBatchNumber = incomingBatchNumber || await generateNextExaminationBatchNumber();
    const payloadWithBatchNumber = {
      ...payload,
      batch_number: reservedBatchNumber,
      batchNumber: reservedBatchNumber
    };

    console.log('[DEBUG] examinationBatchService.createBatch - Starting request with payload:', payloadWithBatchNumber);
    const headers = getHeaders();
    console.log('[DEBUG] examinationBatchService.createBatch - Headers:', headers);

    try {
      const result = await createBatchRemote(payloadWithBatchNumber);
      console.log('[DEBUG] examinationBatchService.createBatch - Success result:', result);
      
      // Verify batch was actually created
      const batchId = result?.id || result?.batchId;
      if (batchId) {
        try {
          const verifyResponse = await fetchWithTimeout(`/batches/${batchId}`, { headers: getHeaders() }, REQUEST_TIMEOUT_MS);
          if (!verifyResponse.ok) {
            console.error('[DEBUG] examinationBatchService.createBatch - Verification failed! Batch not found after creation:', { batchId, status: verifyResponse.status });
          } else {
            console.log('[DEBUG] examinationBatchService.createBatch - Verified batch exists:', { batchId });
          }
        } catch (verifyError) {
          console.error('[DEBUG] examinationBatchService.createBatch - Verification error:', verifyError);
        }
      }
      
      await storeLocalBatch({
        ...result,
        _syncStatus: 'synced',
        _lastSyncedAt: toIso()
      });
      return result;
    } catch (error) {
      if (!isOfflineError(error)) {
        console.error('[DEBUG] examinationBatchService.createBatch - Error response:', error);
        throw error;
      }
      ensureBackendInProd('examinationBatchService.createBatch', error);
      const now = toIso();
      const offlineBatch = normalizeBatchForStorage(
        {
          ...payloadWithBatchNumber,
          status: payload.status || 'Draft'
        },
        {
          _offline: true,
          _syncStatus: 'pending',
          _lastModifiedAt: now,
          created_at: now,
          updated_at: now
        }
      );
      await storeLocalBatch(offlineBatch);
      await enqueueOutbox('examinationBatch:create', String(offlineBatch.id), payloadWithBatchNumber as any);
      return offlineBatch as ExaminationBatch;
    }
  },

  async updateBatch(id: string, payload: Partial<ExaminationBatch>): Promise<ExaminationBatch> {
    if (isLocalBatchId(id)) {
      const local = await getLocalBatches();
      const existing = local.find(batch => String(batch.id) === String(id)) || {};
      const updated = normalizeBatchForStorage({
        ...existing,
        ...payload,
        id
      }, {
        _offline: true,
        _syncStatus: 'pending',
        _lastModifiedAt: toIso()
      });
      await storeLocalBatch(updated);
      await enqueueOutbox('examinationBatch:create', String(id), {
        ...(existing as any),
        ...payload
      } as any);
      return updated as ExaminationBatch;
    }

    try {
      const result = await updateBatchRemote(id, payload);
      await storeLocalBatch({
        ...result,
        _syncStatus: 'synced',
        _lastSyncedAt: toIso()
      });
      return result;
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      ensureBackendInProd('examinationBatchService.updateBatch', error);
      const local = await getLocalBatches();
      const existing = local.find(batch => String(batch.id) === String(id)) || {};
      const updated = normalizeBatchForStorage({
        ...existing,
        ...payload,
        id
      }, {
        _offline: true,
        _syncStatus: 'pending',
        _lastModifiedAt: toIso()
      });
      await storeLocalBatch(updated);
      await enqueueOutbox('examinationBatch:update', String(id), payload as any);
      return updated as ExaminationBatch;
    }
  },

  async deleteBatch(id: string): Promise<void> {
    try {
      await deleteBatchRemote(id);
      await removeLocalBatch(id);
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      ensureBackendInProd('examinationBatchService.deleteBatch', error);
      await removeLocalBatch(id);
      await enqueueOutbox('examinationBatch:delete', String(id), { id });
    }
  },

  async deleteBatches(ids: string[]): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
    const results = { success: [] as string[], failed: [] as { id: string; error: string }[] };

    for (const id of ids) {
      try {
        await this.deleteBatch(id);
        results.success.push(id);
      } catch (error) {
        results.failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  },

  async syncPendingBatches(): Promise<{ synced: number; failed: number; pending: number }> {
    if (this._syncInProgress) {
      const outboxCount = (await loadOutbox()).filter(entry => String(entry.type || '').startsWith('examinationBatch:')).length;
      return { synced: 0, failed: 0, pending: outboxCount };
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const pending = (await loadOutbox()).filter(entry => String(entry.type || '').startsWith('examinationBatch:')).length;
      return { synced: 0, failed: 0, pending };
    }

    const outbox = (await loadOutbox()).filter(entry => String(entry.type || '').startsWith('examinationBatch:'));
    if (outbox.length === 0) {
      return { synced: 0, failed: 0, pending: 0 };
    }

    this._syncInProgress = true;
    try {
      const ordered = [...outbox].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const grouped: Record<string, { create?: any; update?: any; delete?: boolean; entries: string[] }> = {};

      for (const entry of ordered) {
        const entityId = String(entry.entityId || '');
        if (!entityId) continue;
        if (!grouped[entityId]) {
          grouped[entityId] = { entries: [] };
        }
        grouped[entityId].entries.push(entry.id);
        if (entry.type === 'examinationBatch:create') {
          grouped[entityId].create = { ...(grouped[entityId].create || {}), ...(entry.payload || {}) };
        }
        if (entry.type === 'examinationBatch:update') {
          grouped[entityId].update = { ...(grouped[entityId].update || {}), ...(entry.payload || {}) };
        }
        if (entry.type === 'examinationBatch:delete') {
          grouped[entityId].delete = true;
        }
      }

      let synced = 0;
      let failed = 0;

      for (const [entityId, entry] of Object.entries(grouped)) {
        if (entry.delete && entry.create) {
          await removeLocalBatch(entityId);
          await removeOutboxEntries(entry.entries);
          synced += entry.entries.length;
          continue;
        }

        if (entry.create) {
          const payload = { ...(entry.create || {}), ...(entry.update || {}) };
          try {
            const remote = await createBatchRemote(payload);
            await removeLocalBatch(entityId);
            await storeLocalBatch({
              ...remote,
              _syncStatus: 'synced',
              _lastSyncedAt: toIso()
            });
            await removeOutboxEntries(entry.entries);
            synced += entry.entries.length;
          } catch (error) {
            failed += entry.entries.length;
          }
          continue;
        }

        if (entry.delete) {
          try {
            await deleteBatchRemote(entityId);
            await removeLocalBatch(entityId);
            await removeOutboxEntries(entry.entries);
            synced += entry.entries.length;
          } catch (error) {
            failed += entry.entries.length;
          }
          continue;
        }

        if (entry.update) {
          try {
            const remote = await updateBatchRemote(entityId, entry.update || {});
            await storeLocalBatch({
              ...remote,
              _syncStatus: 'synced',
              _lastSyncedAt: toIso()
            });
            await removeOutboxEntries(entry.entries);
            synced += entry.entries.length;
          } catch (error) {
            failed += entry.entries.length;
          }
        }
      }

      return { synced, failed, pending: outbox.length - synced };
    } finally {
      this._syncInProgress = false;
    }
  },

  async calculateBatch(
    id: string,
    options?: {
      trigger?: string;
      paperId?: string;
      tonerId?: string;
      paperUnitCost?: number;
      tonerUnitCost?: number;
      paperConversionRate?: number;
      roundingMethod?: string;
      roundingValue?: number;
      adjustments?: MarketAdjustment[];
    }
  ): Promise<ExaminationBatch> {
    const resolvedId = await resolveBatchId(id);
    const response = await fetchWithTimeout(`/batches/${resolvedId}/calculate`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(options || {})
    }, HEAVY_REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to calculate batch'));
    return safeJson(response, 'calculateBatch');
  },

  async approveBatch(id: string): Promise<ExaminationBatch> {
    const resolvedId = await resolveBatchId(id);
    const response = await fetchWithTimeout(`/batches/${resolvedId}/approve`, {
      method: 'POST',
      headers: getHeaders()
    }, HEAVY_REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to approve batch'));
    return safeJson(response, 'approveBatch');
  },

  async getCostBreakdown(id: string): Promise<any[]> {
    const resolvedId = await resolveBatchId(id);
    const response = await fetchWithTimeout(`/batches/${resolvedId}/cost-breakdown`, {
      headers: getHeaders()
    }, MEDIUM_REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to fetch cost breakdown'));
    return safeJson(response, 'getCostBreakdown');
  },

  async getBOM(id: string): Promise<any[]> {
    const resolvedId = await resolveBatchId(id);
    try {
      return await this.getCostBreakdown(resolvedId);
    } catch {
      const response = await fetchWithTimeout(`/batches/${resolvedId}/bom`, {
        headers: getHeaders()
      }, MEDIUM_REQUEST_TIMEOUT_MS);
      if (!response.ok) throw new Error(await toServiceError(response, 'Failed to fetch BOM'));
      return safeJson(response, 'getBOM');
    }
  },

  async getAdjustmentMeta(): Promise<{ adjustments: MarketAdjustment[]; fetched_at: string }> {
    const response = await fetchWithTimeout('/meta/adjustments', {
      headers: getHeaders()
    }, REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to fetch adjustment metadata'));
    return safeJson(response, 'getAdjustmentMeta');
  },

  async syncMarketAdjustments(payload: {
    adjustments: Array<Partial<MarketAdjustment> & Record<string, unknown>>;
    replaceMissing?: boolean;
    triggerRecalculate?: boolean;
  }): Promise<{
    success: boolean;
    upserted: number;
    changed: number;
    deactivated: number;
    checksum: string;
    item_count: number;
    recalculation?: any;
  }> {
    const response = await fetchWithTimeout('/sync/market-adjustments', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    }, HEAVY_REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to sync market adjustments'));
    return safeJson(response, 'syncMarketAdjustments');
  },

  async syncInventoryItems(payload: {
    items: Array<(Partial<Item> & { id: string }) & Record<string, unknown>>;
    triggerRecalculate?: boolean;
  }): Promise<{
    success: boolean;
    upserted: number;
    changed: number;
    cost_changed: number;
    checksum: string;
    item_count: number;
    recalculation?: any;
  }> {
    const response = await fetchWithTimeout('/sync/inventory-items', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    }, HEAVY_REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to sync inventory items'));
    return safeJson(response, 'syncInventoryItems');
  },

  async getSyncHealth(): Promise<{
    checked_at: string;
    ok: boolean;
    entities: Record<string, {
      last_synced_at: string | null;
      state_checksum: string | null;
      backend_checksum: string;
      state_count: number;
      backend_count: number;
      drift: boolean;
    }>;
  }> {
    const response = await fetchWithTimeout('/sync/health', {
      headers: getHeaders()
    }, REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to fetch sync health'));
    return safeJson(response, 'getSyncHealth');
  },

  async recalculateNonInvoicedBatches(payload?: {
    trigger?: string;
    includeApproved?: boolean;
    limit?: number;
  }): Promise<{
    attempted: number;
    recalculated: number;
    failed: number;
    skipped: number;
    errors: Array<{ batch_id: string; status: string; error: string }>;
  }> {
    const response = await fetchWithTimeout('/backfill/recalculate-non-invoiced', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload || {})
    }, HEAVY_REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to recalculate non-invoiced batches'));
    return safeJson(response, 'recalculateNonInvoicedBatches');
  },

  async recalculateBatch(batchId: string): Promise<any> {
    const response = await fetchWithTimeout(`/recalculate-batch/${batchId}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({})
    }, HEAVY_REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to recalculate batch'));
    return safeJson(response, 'recalculateBatch');
  },

  async generateInvoice(
    id: string,
    payload?: { idempotencyKey?: string; invoiceNumber?: string }
  ): Promise<{
    success: boolean;
    invoiceId: number;
    created?: boolean;
    idempotent?: boolean;
    invoice?: ExaminationGeneratedInvoicePayload;
  }> {
    const headers = getHeaders();
    const resolvedId = await resolveBatchId(id);
    const idempotencyKey = payload?.idempotencyKey || `EXAM-BATCH-${resolvedId}`;
    const invoiceNumber = payload?.invoiceNumber;

    const response = await fetchWithTimeout(`/batches/${resolvedId}/invoice`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ idempotencyKey, invoiceNumber })
    }, HEAVY_REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to generate invoice'));
    return safeJson(response, 'generateInvoice');
  },

  // Class methods
  async getBatchByNumber(batchNumber: string): Promise<ExaminationBatch | null> {
    try {
      const response = await fetchWithTimeout(`/batches?batch_number=${encodeURIComponent(batchNumber)}`, {
        headers: getHeaders()
      }, REQUEST_TIMEOUT_MS);
      if (!response.ok) return null;
      const data = await safeJson(response, 'getBatchByNumber');
      return data?.batches?.[0] || data?.[0] || null;
    } catch {
      return null;
    }
  },

  async findBatchByNumber(batchNumber: string): Promise<ExaminationBatch | null> {
    const local = await getLocalBatches();
    const found = local.find(b => b.batch_number === batchNumber || b.batchNumber === batchNumber);
    if (found) return found as ExaminationBatch;
    return this.getBatchByNumber(batchNumber);
  },

  async addClass(batchId: string, payload: Partial<ExaminationClass>): Promise<ExaminationClass> {
    // Validate required fields
    if (!batchId || !batchId.trim()) {
      throw new Error('Batch ID is required to create a class');
    }
    if (!payload.class_name || !String(payload.class_name).trim()) {
      throw new Error('Class name is required');
    }
    if (payload.number_of_learners === undefined || payload.number_of_learners === null) {
      throw new Error('Number of learners is required');
    }
    if (Number(payload.number_of_learners) <= 0) {
      throw new Error('Number of learners must be greater than 0');
    }

    // Fallback: if batch not found (especially for local batch IDs), try to find by batch number or re-create
    let actualBatchId = batchId;
    
    // Check if this is a local batch ID that needs resolution to backend ID
    const localBatch = isLocalBatchId(batchId) 
      ? (await getLocalBatches()).find(b => String(b.id) === String(batchId))
      : null;
    
    if (localBatch?.batch_number) {
      // This is a local batch - try to find the corresponding backend batch by number
      console.log('[DEBUG] examinationBatchService.addClass - Resolving local batch ID to backend:', { batchId, batchNumber: localBatch.batch_number });
      try {
        const foundByNumber = await this.getBatchByNumber(localBatch.batch_number);
        if (foundByNumber?.id) {
          actualBatchId = String(foundByNumber.id);
          console.log('[DEBUG] examinationBatchService.addClass - Found backend batch by number:', { oldBatchId: batchId, newBatchId: actualBatchId });
        } else {
          // Batch not in backend, re-create it
          console.log('[DEBUG] examinationBatchService.addClass - Batch not in backend, attempting to re-create:', { batchId, batchNumber: localBatch.batch_number });
          try {
            const recreated = await this.createBatch({
              ...localBatch,
              batch_number: localBatch.batch_number,
              status: localBatch.status || 'Draft'
            });
            actualBatchId = String(recreated.id);
            console.log('[DEBUG] examinationBatchService.addClass - Re-created batch:', { oldBatchId: batchId, newBatchId: actualBatchId });
          } catch (recreateError) {
            console.error('[DEBUG] examinationBatchService.addClass - Failed to re-create batch:', recreateError);
          }
        }
      } catch (lookupError) {
        console.error('[DEBUG] examinationBatchService.addClass - Error looking up batch:', lookupError);
      }
    } else if (!isLocalBatchId(batchId)) {
      // Non-local batch ID - check if it exists in backend
      try {
        const testResponse = await fetchWithTimeout(`/batches/${batchId}`, {
          headers: getHeaders()
        }, 5000);
        if (!testResponse.ok && testResponse.status === 404) {
          const localBatchFromId = (await getLocalBatches()).find(b => String(b.id) === String(batchId));
          if (localBatchFromId?.batch_number) {
            console.log('[DEBUG] examinationBatchService.addClass - Batch ID not found, trying batch number lookup:', { batchId, batchNumber: localBatchFromId.batch_number });
            const foundByNumber = await this.getBatchByNumber(localBatchFromId.batch_number);
            if (foundByNumber?.id) {
              actualBatchId = String(foundByNumber.id);
              console.log('[DEBUG] examinationBatchService.addClass - Found batch by number:', { oldBatchId: batchId, newBatchId: actualBatchId });
            } else {
              console.log('[DEBUG] examinationBatchService.addClass - Batch not in backend either, attempting to re-create:', { batchId, batchNumber: localBatchFromId.batch_number });
              try {
                const recreated = await this.createBatch({
                  ...localBatchFromId,
                  batch_number: localBatchFromId.batch_number,
                  status: localBatchFromId.status || 'Draft'
                });
                actualBatchId = String(recreated.id);
                console.log('[DEBUG] examinationBatchService.addClass - Re-created batch:', { oldBatchId: batchId, newBatchId: actualBatchId });
              } catch (recreateError) {
                console.error('[DEBUG] examinationBatchService.addClass - Failed to re-create batch:', recreateError);
              }
            }
          }
        }
      } catch {}
    }

    console.log('[DEBUG] examinationBatchService.addClass - Request details:', {
      batchId: actualBatchId,
      originalBatchId: batchId,
      className: payload.class_name,
      numberOfLearners: payload.number_of_learners,
      requestPath: '/classes',
      isLocalBatchId: isLocalBatchId(actualBatchId)
    });

    const response = await fetchWithTimeout('/classes', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ ...payload, batch_id: actualBatchId }),
    }, HEAVY_REQUEST_TIMEOUT_MS);
    
    if (!response.ok) {
      const errorText = await toServiceError(response, 'Failed to add class');
      console.error('[DEBUG] examinationBatchService.addClass - API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        batchId: actualBatchId,
        originalBatchId: batchId,
        isLocalBatch: isLocalBatchId(actualBatchId)
      });
      throw new Error(errorText);
    }
    
    const result = await safeJson(response, 'addClass');
    console.log('[DEBUG] examinationBatchService.addClass - Success:', result);
    return result;
  },

  async updateClass(classId: string, payload: Partial<ExaminationClass>): Promise<ExaminationClass> {
    const response = await fetchWithTimeout(`/classes/${classId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    }, HEAVY_REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to update class'));
    return safeJson(response, 'updateClass');
  },

  async updateClassPricing(
    classId: string,
    payload: { cost_per_learner?: number; is_manual_override?: boolean; override_reason?: string },
    canOverrideSuggestedCost = false
  ): Promise<ExaminationBatch> {
    const headers = getHeaders();
    headers['x-can-override-exam-cost'] = canOverrideSuggestedCost ? 'true' : 'false';

    const response = await fetchWithTimeout(`/classes/${classId}/pricing`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    }, HEAVY_REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to update class pricing'));
    return response.json();
  },

  async getClassPricingHistory(classId: string, limit = 100): Promise<any[]> {
    const response = await fetchWithTimeout(`/classes/${classId}/pricing-history?limit=${limit}`, {
      headers: getHeaders()
    }, REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to fetch class pricing history'));
    return response.json();
  },

  async deleteClass(classId: string): Promise<void> {
    const response = await fetchWithTimeout(`/classes/${classId}`, {
      method: 'DELETE',
      headers: getHeaders()
    }, HEAVY_REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to delete class'));
  },

  // Subject methods
  async addSubject(classId: string, payload: Partial<ExaminationSubject>): Promise<ExaminationSubject> {
    const response = await fetchWithTimeout('/subjects', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ ...payload, class_id: classId }),
    }, HEAVY_REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to add subject'));
    return response.json();
  },

  async updateSubject(subjectId: string, payload: Partial<ExaminationSubject>): Promise<ExaminationSubject> {
    const response = await fetchWithTimeout(`/subjects/${subjectId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    }, HEAVY_REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to update subject'));
    return response.json();
  },

  async deleteSubject(subjectId: string): Promise<void> {
    const response = await fetchWithTimeout(`/subjects/${subjectId}`, {
      method: 'DELETE',
      headers: getHeaders()
    }, HEAVY_REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to delete subject'));
  },

  // Settings methods
  async getPricingSettings(): Promise<ExaminationPricingSettings> {
    const response = await fetchWithTimeout('/settings/pricing', {
      headers: getHeaders()
    }, REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to fetch examination pricing settings'));
    return response.json();
  },

  async updatePricingSettings(payload: {
    paper_item_id?: string | null;
    toner_item_id?: string | null;
    conversion_rate?: number;
    trigger_recalculate?: boolean;
    lock_batch_id?: string;
    lock_pricing_snapshot?: boolean;
    lock_reason?: string;
  }): Promise<{
    success: boolean;
    recalculation?: any;
    pricing_lock?: any;
  }> {
    const response = await fetchWithTimeout('/settings/pricing', {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    }, HEAVY_REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to update examination pricing settings'));
    return response.json();
  },

  async getExamPricingSettings() {
    return this.getPricingSettings();
  },

  async updateExamPricingSettings(payload: {
    paper_item_id?: string | null;
    toner_item_id?: string | null;
    conversion_rate?: number;
    trigger_recalculate?: boolean;
    lock_batch_id?: string;
    lock_pricing_snapshot?: boolean;
    lock_reason?: string;
  }) {
    return this.updatePricingSettings(payload);
  },

  // New methods for Examination Pricing Redesign

  async getClass(classId: string): Promise<ExaminationClass> {
    const response = await fetchWithTimeout(`/classes/${classId}`, {
      headers: getHeaders()
    }, REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to fetch class'));
    return response.json();
  },

  async getClassPreview(
    classId: string,
    options?: {
      paperId?: string;
      tonerId?: string;
      paperUnitCost?: number;
      tonerUnitCost?: number;
      tonerPagesPerUnit?: number;
      paperConversionRate?: number;
      applyRounding?: boolean;
      rounding_method?: string;
      rounding_value?: number;
      roundingMethod?: string;
      roundingValue?: number;
      adjustments?: MarketAdjustment[];
    }
  ): Promise<{
    classId: string;
    className: string;
    learners: number;
    totalSheets: number;
    totalPages: number;
    paperQuantity: number;
    tonerQuantity: number;
    paperCost: number;
    tonerCost: number;
    totalBomCost: number;
    totalAdjustments: number;
    totalCost: number;
    expectedFeePerLearner: number;
    materialTotalCost: number;
    adjustmentTotalCost: number;
    calculatedTotalCost: number;
    adjustmentBreakdown: Array<{
      adjustmentId: string;
      adjustmentName: string;
      adjustmentType: string;
      adjustmentValue: number;
      baseAmount: number;
      originalAmount: number;
      redistributedAmount: number;
      allocationRatio: number;
    }>;
  }> {
    const response = await fetchWithTimeout(`/classes/${classId}/preview`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(options || {})
    }, MEDIUM_REQUEST_TIMEOUT_MS);

    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to fetch class preview'));
    return response.json();
  },

  async updateClassFinancialMetrics(
    classId: string,
    payload: {
      expected_fee_per_learner?: number;
      final_fee_per_learner?: number;
      live_total_preview?: number;
      material_total_cost?: number;
      adjustment_total_cost?: number;
      market_adjustment_total?: number;
      rounding_adjustment?: number;
      calculated_total_cost?: number;
      financial_metrics_source?: 'SYSTEM_CALCULATION' | 'MANUAL_OVERRIDE' | 'PRICING_SETTINGS_SYNC';
      financial_metrics_updated_by?: string;
      financial_metrics_updated_at?: string;
    }
  ): Promise<ExaminationClass> {
    const response = await fetchWithTimeout(`/classes/${classId}/financial-metrics`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    }, HEAVY_REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to update class financial metrics'));
    return response.json();
  },

  async syncPricingToBatch(
    batchId: string,
    payload: {
      settings: ExaminationPricingSettings;
      adjustments: MarketAdjustment[];
      triggerSource: 'SYSTEM_CALCULATION' | 'MANUAL_OVERRIDE' | 'PRICING_SETTINGS_SYNC';
    }
  ): Promise<{
    success: boolean;
    classesUpdated: number;
    errors: Array<{ classId: string; error: string }>;
  }> {
    const headers = getHeaders();
    headers['x-user-id'] = headers['x-user-id'] || 'System';

    const response = await fetchWithTimeout(`/batches/${batchId}/sync-pricing`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }, HEAVY_REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(await toServiceError(response, 'Failed to sync pricing to batch'));
    return response.json();
  }
};
