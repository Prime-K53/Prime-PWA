const express = require('express');
const router = express.Router();
const workspaceService = require('../services/workspaceService.cjs');
const { sendSafeError } = require('../utils/errors.cjs');
const { validateBody, workspaceSchemas } = require('../middleware/validation.cjs');

router.post('/workspace/initialize', validateBody(workspaceSchemas.initialize), async (req, res) => {
  try {
    const { companyName } = req.body;
    const config = await workspaceService.initializeWorkspace(companyName);
    res.json(config);
  } catch (err) {
    console.error('[System] Workspace initialization failed:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.post('/workspace/sync', validateBody(workspaceSchemas.sync), async (req, res) => {
  try {
    const { filename, data } = req.body;
    const path = await workspaceService.saveToWorkspace('Sync', filename, data);
    res.json({ success: true, path });
  } catch (err) {
    console.error('[System] Workspace sync failed:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

router.post('/workspace/save-document', validateBody(workspaceSchemas.saveDocument), async (req, res) => {
  try {
    const { folder, filename, data } = req.body; 
    const path = await workspaceService.saveToWorkspace(folder || 'Documents', filename, data);
    res.json({ success: true, path });
  } catch (err) {
    console.error('[System] Save document failed:', err);
    sendSafeError(res, 500, 'INTERNAL_ERROR');
  }
});

/**
 * Get the current workspace configuration.
 */
router.get('/workspace/config', (req, res) => {
  const config = workspaceService.getWorkspaceConfig();
  res.json(config || { initialized: false });
});

module.exports = router;
