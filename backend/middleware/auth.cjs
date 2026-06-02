const jwt = require('jsonwebtoken');

// JWT Secret - must be set via environment variable
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Exiting.');
  process.exit(1);
}

// Token expiration time
const TOKEN_EXPIRATION = '8h';
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

const readBooleanHeader = (value) => TRUE_VALUES.has(String(value || '').trim().toLowerCase());

const isLoopbackAddress = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '::1'
    || normalized === '127.0.0.1'
    || normalized === '::ffff:127.0.0.1';
};

const isTrustedLocalOrigin = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized || normalized === 'null' || /^file:\/\//i.test(normalized)) {
    return true;
  }

  try {
    const { hostname } = new URL(normalized);
    return hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '0.0.0.0'
      || hostname === '::1';
  } catch {
    return false;
  }
};

const canUseHeaderAuth = (req) => {
  // Only allow header-based auth when explicitly enabled AND from loopback
  if (process.env.ALLOW_HEADER_AUTH !== 'true') {
    return false;
  }

  const remoteAddress = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;
  return isLoopbackAddress(remoteAddress);
};

const getHeaderAuthUser = (req) => {
  const userId = String(req.headers['x-user-id'] || '').trim();
  if (!userId) {
    return null;
  }

  const role = String(req.headers['x-user-role'] || 'User').trim() || 'User';
  const email = String(req.headers['x-user-email'] || '').trim() || undefined;
  const isSuperAdmin = readBooleanHeader(req.headers['x-user-is-super-admin']) || role.toLowerCase() === 'admin';

  return {
    id: userId,
    username: email || userId,
    role,
    email,
    isSuperAdmin,
    permissions: isSuperAdmin ? ['*'] : [],
  };
};

/**
 * Generate a JWT token for a user
 * @param {Object} user - User object with id, username, role
 * @returns {string} JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      username: user.username, 
      role: user.role,
      email: user.email 
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRATION }
  );
};

/**
 * Verify JWT token middleware
 * Extracts token from Authorization header and verifies it
 */
const verifyToken = (req, res, next) => {
  // Skip authentication for public endpoints
  // Since this middleware is mounted at /api, req.path is relative to /api
  const publicEndpoints = ['/auth/login', '/auth/register'];
  if (publicEndpoints.includes(req.path)) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    const headerUser = getHeaderAuthUser(req);
    if (headerUser && canUseHeaderAuth(req)) {
      req.user = headerUser;
      req.authMode = 'header';
      return next();
    }

    return res.status(401).json({ 
      error: 'Access denied',
      message: 'No authentication token provided' 
    });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'Your session has expired. Please login again.' 
      });
    }
    return res.status(403).json({ 
      error: 'Invalid token',
      message: 'Authentication failed' 
    });
  }
};

/**
 * Require specific role(s) middleware
 * Must be used after verifyToken
 * @param {...string} roles - Allowed roles
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please login to access this resource' 
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: `This action requires one of the following roles: ${roles.join(', ')}` 
      });
    }
    
    next();
  };
};

/**
 * Require specific permission(s) middleware
 * Must be used after verifyToken
 * @param {...string} permissions - Required permissions
 */
const requirePermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required' 
      });
    }
    
    // Admin role bypasses permission checks
    if (req.user.role === 'Admin') {
      return next();
    }
    
    const userPermissions = req.user.permissions || [];
    const hasPermission = permissions.some(p => userPermissions.includes(p));
    
    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: `This action requires: ${permissions.join(' or ')}` 
      });
    }
    
    next();
  };
};

/**
 * Refresh token endpoint handler
 * Generates a new token for an authenticated user
 */
const refreshToken = (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const newToken = generateToken(req.user);
  res.json({ 
    token: newToken,
    expiresIn: TOKEN_EXPIRATION
  });
};

module.exports = { 
  generateToken, 
  verifyToken, 
  requireRole, 
  requirePermission,
  refreshToken,
  JWT_SECRET 
};
