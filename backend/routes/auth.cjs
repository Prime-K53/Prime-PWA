const express = require('express');
const router = express.Router();
const authService = require('../services/authService.cjs');
const { generateToken, verifyToken } = require('../middleware/auth.cjs');
const { validateBody, userSchemas } = require('../middleware/validation.cjs');

router.post('/register', validateBody(userSchemas.createUser), async (req, res) => {
  try {
    const { username, email, password, role, permissions } = req.body;
    const user = await authService.registerUser({ username, email, password, role, permissions });
    const token = generateToken(user);
    res.status(201).json({ message: 'User registered successfully', user, token });
  } catch (err) {
    if (err.message === 'Username already exists') {
      return res.status(409).json({ error: err.message });
    }
    console.error('[Auth] Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', validateBody(userSchemas.login), async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await authService.authenticateUser(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials', message: 'Username or password is incorrect' });
    }
    const token = generateToken(user);
    res.json({
      message: 'Login successful',
      user: { id: user.id, username: user.username, email: user.email, role: user.role, permissions: user.permissions },
      token
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/request-verification', (req, res) => res.json({ success: true, disabled: true, message: 'Email verification is disabled for this ERP.' }));
router.post('/verify-code', (req, res) => res.json({ success: true, disabled: true, message: 'Email verification is disabled for this ERP.' }));

router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await authService.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('[Auth] Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

module.exports = router;
