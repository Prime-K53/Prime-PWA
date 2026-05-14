const express = require('express');
const router = express.Router();
const workspaceService = require('../services/workspaceService.cjs');

/**
 * Initialize the company workspace on the Desktop.
 * Creates folders for Documents, Invoices, Receipts, Backups, and Sync.
 */
router.post('/workspace/initialize', async (req, res) => {
  try {
    const { companyName } = req.body;
    if (!companyName) {
      return res.status(400).json({ error: 'Company name is required' });
    }
    const config = await workspaceService.initializeWorkspace(companyName);
    res.json(config);
  } catch (err) {
    console.error('[System] Workspace initialization failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Sync data to the workspace.
 */
router.post('/workspace/sync', async (req, res) => {
  try {
    const { filename, data } = req.body;
    if (!filename || !data) {
      return res.status(400).json({ error: 'Filename and data are required' });
    }
    const path = await workspaceService.saveToWorkspace('Sync', filename, data);
    res.json({ success: true, path });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Save a document (PDF, Receipt, etc.) to the workspace.
 */
router.post('/workspace/save-document', async (req, res) => {
  try {
    const { folder, filename, data } = req.body; 
    if (!filename || !data) {
      return res.status(400).json({ error: 'Filename and data are required' });
    }
    const path = await workspaceService.saveToWorkspace(folder || 'Documents', filename, data);
    res.json({ success: true, path });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
