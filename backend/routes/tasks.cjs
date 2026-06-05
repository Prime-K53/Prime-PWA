const express = require('express');
const router = express.Router();
const { db } = require('../db.cjs');
const { sendSafeError } = require('../utils/errors.cjs');
const { validateBody, taskSchemas } = require('../middleware/validation.cjs');

/**
 * @route   GET /api/tasks
 * @desc    Get all tasks from the database
 */
router.get('/', (req, res) => {
  const companyId = req.companyId || '';
  db.all('SELECT * FROM tasks WHERE company_id = ? ORDER BY created_at DESC', [companyId], (err, rows) => {
    if (err) {
      console.error('[Tasks] Failed to get tasks:', err);
      return res.status(500).json({ error: 'Failed to retrieve tasks' });
    }
    res.json(rows.map(r => ({ ...r, completed: !!r.completed })));
  });
});

/**
 * @route   POST /api/tasks
 * @desc    Create a new task in the database
 */
router.post('/', validateBody(taskSchemas.create), (req, res) => {
  const { title } = req.body;
  const companyId = req.companyId || '';
  
  db.run('INSERT INTO tasks (title, company_id) VALUES (?, ?)', [title, companyId], function(err) {
    if (err) {
      console.error('[Tasks] Failed to create task:', err);
      return res.status(500).json({ error: 'Failed to create task' });
    }
    res.status(201).json({
      id: this.lastID,
      title,
      completed: false
    });
  });
});

module.exports = router;
