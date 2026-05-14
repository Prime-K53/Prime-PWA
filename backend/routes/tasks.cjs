const express = require('express');
const router = express.Router();
const { db } = require('../db.cjs');

/**
 * @route   GET /api/tasks
 * @desc    Get all tasks from the database
 */
router.get('/', (req, res) => {
  db.all('SELECT * FROM tasks ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows.map(r => ({ ...r, completed: !!r.completed })));
  });
});

/**
 * @route   POST /api/tasks
 * @desc    Create a new task in the database
 */
router.post('/', (req, res) => {
  const { title } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  
  db.run('INSERT INTO tasks (title) VALUES (?)', [title], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({
      id: this.lastID,
      title,
      completed: false
    });
  });
});

module.exports = router;
