const express = require('express');
const router = express.Router();
const examinationService = require('../services/examinationService.cjs');
const batchWorkflow = require('../services/examinationBatchWorkflow.cjs');

const canOverrideSuggestedCost = (req) => {
  const explicit = String(req.headers['x-can-override-exam-cost'] || '').toLowerCase();
  if (explicit === '1' || explicit === 'true' || explicit === 'yes') return true;

  const isSuperAdmin = String(req.headers['x-user-is-super-admin'] || '').toLowerCase();
  if (isSuperAdmin === '1' || isSuperAdmin === 'true') return true;

  const role = String(req.headers['x-user-role'] || '').toLowerCase();
  return role === 'admin';
};

const createRequestAbortSignal = (req, res) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  req.once('aborted', abort);
  res.once('close', () => {
    if (!res.writableEnded) {
      abort();
    }
  });
  return controller.signal;
};

const resolveWorkflowErrorStatus = (error) => {
  const code = String(error?.workflowCode || '');
  if (code === batchWorkflow.WORKFLOW_VALIDATION_CODES.BATCH_IMMUTABLE) return 409;
  if (code === batchWorkflow.WORKFLOW_VALIDATION_CODES.INVALID_TRANSITION) return 409;
  if (code === batchWorkflow.WORKFLOW_VALIDATION_CODES.APPROVAL_NOT_ALLOWED) return 409;
  if (code === batchWorkflow.WORKFLOW_VALIDATION_CODES.INVOICE_NOT_ALLOWED) return 409;
  return 500;
};

// --- Base Route ---
router.get('/', (req, res) => {
  res.json({ message: 'Examination API working' });
});

// --- Batches ---
router.get('/meta/adjustments', async (req, res) => {
  try {
    const adjustments = await examinationService.getMarketAdjustmentMeta();
    res.json({
      adjustments,
      fetched_at: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync/market-adjustments', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || req.body?.user_id || req.body?.userId || 'System';
    const signal = createRequestAbortSignal(req, res);
    const result = await examinationService.syncMarketAdjustments(req.body || {}, { userId, signal });
    if (signal.aborted || res.headersSent) return;
    res.json(result);
  } catch (err) {
    if (res.headersSent) return;
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync/inventory-items', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || req.body?.user_id || req.body?.userId || 'System';
    const signal = createRequestAbortSignal(req, res);
    const result = await examinationService.syncInventoryItems(req.body || {}, { userId, signal });
    if (signal.aborted || res.headersSent) return;
    res.json(result);
  } catch (err) {
    if (res.headersSent) return;
    console.error('[ERROR] sync/inventory-items failed:', err.message, err.stack);
    res.status(500).json({ error: err.message, details: err.stack });
  }
});

router.get('/sync/health', async (req, res) => {
  try {
    const result = await examinationService.getSyncHealth();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backfill/recalculate-non-invoiced', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || req.body?.user_id || req.body?.userId || 'System';
    const signal = createRequestAbortSignal(req, res);
    const result = await examinationService.recalculateNonInvoicedBatches({
      trigger: req.body?.trigger || 'BACKFILL_NON_INVOICED',
      userId,
      includeApproved: req.body?.includeApproved ?? req.body?.include_approved,
      limit: req.body?.limit,
      signal
    });
    if (signal.aborted || res.headersSent) return;
    res.json(result);
  } catch (err) {
    if (res.headersSent) return;
    res.status(500).json({ error: err.message });
  }
});

router.post('/recalculate-batch/:batchId', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || req.body?.user_id || req.body?.userId || 'System';
    const batchId = req.params.batchId;
    if (!batchId) {
      return res.status(400).json({ error: 'Batch ID is required' });
    }
    const result = await examinationService.calculateBatch(batchId, {
      trigger: 'MANUAL',
      userId
    });
    if (res.headersSent) return;
    res.json(result);
  } catch (err) {
    if (res.headersSent) return;
    res.status(500).json({ error: err.message });
  }
});

router.get('/batches', async (req, res) => {
  try {
    const modeToken = String(req.query?.mode ?? req.query?.summary ?? '').trim().toLowerCase();
    const summaryModes = new Set(['1', 'true', 'summary', 'fast']);
    const liteModes = new Set(['lite', 'minimal', 'basic', 'bare']);
    const includeSubjectsRaw = req.query?.include_subjects ?? req.query?.includeSubjects;
    const includeClassStatsRaw = req.query?.include_class_stats ?? req.query?.includeClassStats;

    let includeClassStats;
    if (includeClassStatsRaw !== undefined) {
      const normalized = String(includeClassStatsRaw).trim().toLowerCase();
      includeClassStats = !(normalized === '0' || normalized === 'false' || normalized === 'no');
    } else {
      includeClassStats = !liteModes.has(modeToken);
    }

    let includeSubjectPages;
    if (includeSubjectsRaw !== undefined) {
      const normalized = String(includeSubjectsRaw).trim().toLowerCase();
      includeSubjectPages = !(normalized === '0' || normalized === 'false' || normalized === 'no');
    } else {
      includeSubjectPages = !(summaryModes.has(modeToken) || liteModes.has(modeToken));
    }

    if (!includeClassStats) {
      includeSubjectPages = false;
    }

    const batches = await examinationService.getAllBatches({ includeSubjectPages, includeClassStats });
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/batches/:id', async (req, res) => {
  try {
    const batch = await examinationService.getBatchById(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    res.json(batch);
  } catch (err) {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      event: 'route_batch_fetch_failed',
      batchId: req.params.id,
      error: err.message
    }));
    res.status(500).json({ error: err.message });
  }
});

router.get('/batches/:id/cost-breakdown', async (req, res) => {
  try {
    const rows = await examinationService.getBOMCalculations(req.params.id);
    res.json(Array.isArray(rows) ? rows : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Audit Logs ---
router.get('/audit-logs/:entityType/:id', async (req, res) => {
  try {
    const { entityType, id } = req.params;
    const logs = await examinationService.getAuditLogs(entityType, id);
    res.json(logs || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/audit-trail/:correlationId', async (req, res) => {
  try {
    const { correlationId } = req.params;
    const trail = await examinationService.getAuditTrail(correlationId);
    res.json(trail || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/batches/:id/bom', async (req, res) => {
  try {
    const rows = await examinationService.getBOMCalculations(req.params.id);
    res.set('X-Deprecated-Notice', 'GET /api/examination/batches/:id/bom is deprecated. Use /api/examination/batches/:id/cost-breakdown.');
    res.json(Array.isArray(rows) ? rows : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Settings ---
router.get('/settings/pricing', async (req, res) => {
  try {
    const settings = await examinationService.getExamPricingSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings/pricing', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'System';
    const result = await examinationService.updateExamPricingSettings(req.body || {}, { userId });
    res.json(result);
  } catch (err) {
    console.error('[ERROR] settings/pricing failed:', err.message, err.stack);
    res.status(500).json({ error: err.message, details: err.stack });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const userId = req.query.user_id || req.query.userId || req.headers['x-user-id'];
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    // Validate inputs
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      console.warn(`[notifications] Invalid user_id: ${userId}`);
      return res.status(400).json({ error: 'user_id is required' });
    }

    if (limit < 1 || limit > 1000) {
      console.warn(`[notifications] Invalid limit: ${limit}`);
      return res.status(400).json({ error: 'limit must be between 1 and 1000' });
    }

    console.debug(`[notifications] Fetching notifications for user: ${userId}, limit: ${limit}`);
    const startTime = Date.now();

    // Set a timeout for the database query to prevent hanging
    const fetchPromise = examinationService.getNotifications(userId, limit);
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Database query timeout after 10 seconds')), 10000);
    });

    let notifications;
    try {
      notifications = await Promise.race([fetchPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
    const duration = Date.now() - startTime;

    console.debug(`[notifications] Fetched ${notifications?.length || 0} notifications for user ${userId} in ${duration}ms`);
    res.json(notifications);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const isTimeout = errorMessage.toLowerCase().includes('timeout');
    console.error(`[notifications] Error fetching notifications: ${errorMessage}`, {
      userId: req.query.user_id || req.headers['x-user-id'],
      limit: req.query.limit,
      stack: err instanceof Error ? err.stack : undefined
    });

    res.status(isTimeout ? 504 : 500).json({
      error: 'Failed to fetch notifications',
      details: errorMessage
    });
  }
});

router.post('/notifications', async (req, res) => {
  try {
    const notification = await examinationService.createNotification(req.body || {});
    res.status(201).json(notification);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notifications/:id/read', async (req, res) => {
  try {
    const userId = req.body?.user_id || req.body?.userId || req.headers['x-user-id'];
    const result = await examinationService.markNotificationRead(req.params.id, userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/notifications/:id', async (req, res) => {
  try {
    const userId = req.query.user_id || req.query.userId || req.headers['x-user-id'];
    const result = await examinationService.deleteNotification(req.params.id, userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/audit/notifications', async (req, res) => {
  try {
    const result = await examinationService.createNotificationAuditLog(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/batches', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const batch = await examinationService.createBatch(req.body, userId);
    res.status(201).json(batch);
  } catch (err) {
    const message = String(err?.message || 'Failed to create batch');
    const normalized = message.toLowerCase();
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      event: 'route_batch_create_failed',
      userId: req.headers['x-user-id'],
      error: message
    }));
    if (
      normalized.includes('required')
      || normalized.includes('invalid')
      || normalized.includes('constraint')
    ) {
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ error: message });
  }
});

router.put('/batches/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const batch = await examinationService.updateBatch(req.params.id, req.body, userId);
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/batches/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    await examinationService.deleteBatch(req.params.id, userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Classes ---
router.post('/classes', async (req, res) => {
  try {
    const body = req.body || {};
    // Accept batch_id or batchId
    const batch_id = body.batch_id || body.batchId || body.batch || req.query?.batch_id || req.query?.batchId;
    // Accept class name variants
    const class_name = body.class_name || body.name || body.className;
    const number_of_learners = body.number_of_learners ?? body.numberOfLearners ?? body.learners ?? body.candidates;

    // Validate required fields
    if (!batch_id) {
      return res.status(400).json({ error: 'batch_id is required', message: 'Please provide a valid batch_id to create a class' });
    }
    if (!class_name) {
      return res.status(400).json({ error: 'class_name (name) is required', message: 'Please provide a class name (class_name or name) to create a class' });
    }

    const signal = createRequestAbortSignal(req, res);
    const userId = req.headers['x-user-id'] || 'System';

    // Normalize payload to include canonical field names expected by service
    const payload = { ...body, class_name, number_of_learners };

    const newClass = await examinationService.createClass(batch_id, payload, { userId, signal, canOverride: canOverrideSuggestedCost(req) });
    if (signal.aborted || res.headersSent) return;
    return res.status(201).json(newClass);
  } catch (err) {
    // Log full error details for debugging (message + stack when available)
    try {
      console.error(JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        event: 'route_class_create_failed',
        error: err && err.message ? err.message : String(err),
        stack: err && err.stack ? err.stack : null,
        body: req.body
      }));
    } catch (logErr) {
      console.error('Failed to stringify error for logging', logErr, err);
    }

    const message = String(err?.message || err || 'Failed to create class');
    const normalized = message.toLowerCase();

    if (
      normalized.includes('batch not found')
      || (normalized.includes('batch') && normalized.includes('not found'))
    ) {
      return res.status(404).json({ error: message, suggestion: 'Please create the batch first before creating classes' });
    }

    if (normalized.includes('required') || normalized.includes('must') || normalized.includes('missing')) {
      return res.status(400).json({ error: message });
    }

    if (normalized.includes('constraint') || normalized.includes('duplicate') || normalized.includes('unique')) {
      return res.status(409).json({ error: message });
    }

    return res.status(500).json({ error: message });
  }
});

router.put('/classes/:id', async (req, res) => {
  try {
    const updatedClass = await examinationService.updateClass(req.params.id, req.body);
    res.json(updatedClass);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/classes/:id/pricing', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'System';
    const batch = await examinationService.updateClassPricing(req.params.id, req.body, {
      userId,
      trigger: 'MANUAL_OVERRIDE',
      canOverrideSuggestedCost: canOverrideSuggestedCost(req)
    });
    res.json(batch);
  } catch (err) {
    const message = String(err?.message || '');
    if (message.toLowerCase().includes('permission')) {
      return res.status(403).json({ error: message });
    }
    if (message.toLowerCase().includes('batch status')) {
      return res.status(409).json({ error: message });
    }
    if (message.toLowerCase().includes('required') || message.toLowerCase().includes('must')) {
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ error: message || 'Failed to update class pricing.' });
  }
});

router.get('/classes/:id/pricing-history', async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const history = await examinationService.getClassPricingHistory(req.params.id, limit);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/classes/:id', async (req, res) => {
  try {
    await examinationService.deleteClass(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Subjects ---
router.post('/subjects', async (req, res) => {
  try {
    const { class_id, ...data } = req.body;
    const newSubject = await examinationService.createSubject(class_id, data);
    res.status(201).json(newSubject);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/subjects/:id', async (req, res) => {
  try {
    const updatedSubject = await examinationService.updateSubject(req.params.id, req.body);
    res.json(updatedSubject);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/subjects/:id', async (req, res) => {
  try {
    await examinationService.deleteSubject(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Classes (Additional Routes for Examination Pricing Redesign) ---
router.get('/classes/:id', async (req, res) => {
  try {
    const cls = await examinationService.getClassById(req.params.id);
    if (!cls) {
      return res.status(404).json({ error: 'Class not found' });
    }
    res.json(cls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/classes/:id/financial-metrics', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'System';
    const updatedClass = await examinationService.updateClassFinancialMetrics(
      req.params.id,
      req.body,
      { userId }
    );
    res.json(updatedClass);
  } catch (err) {
    const message = String(err?.message || 'Failed to update class financial metrics');
    if (message.toLowerCase().includes('batch status')) {
      return res.status(409).json({ error: message });
    }
    res.status(500).json({ error: message });
  }
});

// --- Batch Pricing Sync (Examination Pricing Redesign) ---
router.post('/batches/:id/sync-pricing', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'System';
    const { settings, adjustments, triggerSource } = req.body;

    const result = await examinationService.syncPricingToBatchClasses(
      req.params.id,
      { settings, adjustments, triggerSource, userId }
    );
    res.json(result);
  } catch (err) {
    const message = String(err?.message || 'Failed to sync pricing to batch');
    if (message.toLowerCase().includes('batch status')) {
      return res.status(409).json({ error: message });
    }
    res.status(500).json({ error: message });
  }
});

// --- Actions ---
router.post('/batches/:id/calculate', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'System';
    const requestOptions = (req.body && typeof req.body === 'object') ? req.body : {};
    const result = await examinationService.calculateBatch(req.params.id, {
      ...requestOptions,
      trigger: requestOptions.trigger || 'MANUAL_TRIGGER',
      userId
    });
    res.json(result);
  } catch (error) {
    console.error('[Examination] Calculate batch error:', error);
    res.status(500).json({ error: error.message || 'Failed to calculate batch' });
  }
});

// Class preview endpoint - calculates without saving
router.post('/classes/:id/preview', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'System';
    const result = await examinationService.calculateClassPreview(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/batches/:id/approve', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const result = await examinationService.approveBatch(req.params.id, userId);
    res.json(result);
  } catch (err) {
    res.status(resolveWorkflowErrorStatus(err)).json({ error: err.message });
  }
});

router.post('/batches/:id/invoice', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    const idempotencyKey = req.headers['x-idempotency-key'] || req.body?.idempotency_key || req.body?.idempotencyKey;
    const invoiceNumber = req.body?.invoiceNumber || req.body?.invoice_number;
    const result = await examinationService.generateInvoice(req.params.id, userId, { idempotencyKey, invoiceNumber });
    res.json(result);
  } catch (err) {
    console.error('[ERROR] batches/:id/invoice failed:', err.message, err.stack);
    res.status(resolveWorkflowErrorStatus(err)).json({ error: err.message, details: err.stack });
  }
});

module.exports = router;
