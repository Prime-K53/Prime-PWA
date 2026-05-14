console.log('--- SERVER SCRIPT STARTING ---');
console.log('Requiring express...');
const express = require('express');
// const helmet = require('helmet'); // Temporarily disabled due to installation issues
// const rateLimit = require('express-rate-limit'); // Temporarily disabled due to installation issues
console.log('Requiring cors...');
const cors = require('cors');
console.log('Requiring body-parser...');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
console.log('Requiring db...');
const { db } = require('./db.cjs');
console.log('Requiring bootstrap...');
const bootstrap = require('./bootstrap.cjs');
console.log('Imports done.');

const TONER_MG_PER_SHEET = 20; 

// Safe formula evaluator - replaces eval/new Function with controlled AST evaluation
function safeEvaluate(formula, context = {}) {
  try {
    if (!formula || typeof formula !== 'string') return 0;
    
    // Tokenize the formula
    const tokens = [];
    let i = 0;
    while (i < formula.length) {
      const char = formula[i];
      
      // Skip whitespace
      if (/\s/.test(char)) {
        i++;
        continue;
      }
      
      // Number (including decimals)
      if (/[0-9.]/.test(char)) {
        let num = '';
        while (i < formula.length && /[0-9.]/.test(formula[i])) {
          num += formula[i];
          i++;
        }
        tokens.push({ type: 'NUMBER', value: parseFloat(num) });
        continue;
      }
      
      // Identifier (variable name)
      if (/[a-zA-Z_]/.test(char)) {
        let ident = '';
        while (i < formula.length && /[a-zA-Z0-9_]/.test(formula[i])) {
          ident += formula[i];
          i++;
        }
        tokens.push({ type: 'IDENTIFIER', value: ident });
        continue;
      }
      
      // Operators and parentheses
      if (/[+\-*/()]/.test(char)) {
        tokens.push({ type: 'OPERATOR', value: char });
        i++;
        continue;
      }
      
      // Invalid character
      console.warn(`Invalid character in formula: ${char}`);
      return 0;
    }
    
    // Simple recursive descent parser for arithmetic expressions
    let pos = 0;
    
    function parseExpression() {
      let node = parseTerm();
      
      while (pos < tokens.length && (tokens[pos].value === '+' || tokens[pos].value === '-')) {
        const op = tokens[pos].value;
        pos++;
        const right = parseTerm();
        node = { type: 'BINARY_EXPRESSION', operator: op, left: node, right };
      }
      
      return node;
    }
    
    function parseTerm() {
      let node = parseFactor();
      
      while (pos < tokens.length && (tokens[pos].value === '*' || tokens[pos].value === '/')) {
        const op = tokens[pos].value;
        pos++;
        const right = parseFactor();
        node = { type: 'BINARY_EXPRESSION', operator: op, left: node, right };
      }
      
      return node;
    }
    
    function parseFactor() {
      if (pos >= tokens.length) return null;
      
      const token = tokens[pos];
      
      if (token.type === 'NUMBER') {
        pos++;
        return { type: 'LITERAL', value: token.value };
      }
      
      if (token.type === 'IDENTIFIER') {
        pos++;
        const value = context[token.value] !== undefined ? context[token.value] : 0;
        return { type: 'LITERAL', value };
      }
      
      if (token.value === '(') {
        pos++;
        const expr = parseExpression();
        if (pos < tokens.length && tokens[pos].value === ')') {
          pos++;
          return expr;
        } else {
          console.warn('Mismatched parentheses in formula');
          return { type: 'LITERAL', value: 0 };
        }
      }
      
      if (token.value === '-') {
        pos++;
        const factor = parseFactor();
        return { type: 'UNARY_EXPRESSION', operator: '-', argument: factor };
      }
      
      pos++;
      return { type: 'LITERAL', value: 0 };
    }
    
    const ast = parseExpression();
    
    // Evaluate the AST
    function evaluate(node) {
      if (!node) return 0;
      
      if (node.type === 'LITERAL') {
        return typeof node.value === 'number' ? node.value : 0;
      }
      
      if (node.type === 'UNARY_EXPRESSION') {
        const arg = evaluate(node.argument);
        return node.operator === '-' ? -arg : arg;
      }
      
      if (node.type === 'BINARY_EXPRESSION') {
        const left = evaluate(node.left);
        const right = evaluate(node.right);
        
        switch (node.operator) {
          case '+': return left + right;
          case '-': return left - right;
          case '*': return left * right;
          case '/': return right !== 0 ? left / right : 0;
          default: return 0;
        }
      }
      
      return 0;
    }
    
    const result = evaluate(ast);
    return typeof result === 'number' && isFinite(result) ? result : 0;
    
  } catch (e) {
    console.error('Formula evaluation error:', e);
    return 0;
  }
}

const app = express();
let PORT = process.env.PORT || 3000;

// Trust proxy for Render/Heroku behind reverse proxy
app.set('trust proxy', 1);


const ensurePortAvailable = (candidatePort) => {
  const normalizedPort = Number(candidatePort);
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (error) => {
      if (error?.code === 'EADDRINUSE') {
        reject(new Error(`Port ${normalizedPort} is already in use`));
        return;
      }
      reject(error);
    });
    probe.once('listening', () => {
      probe.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve();
      });
    });
    probe.listen(normalizedPort, '0.0.0.0');
  });
};

const closeDbAndExit = (code = 1) => {
  try {
    db.close(() => process.exit(code));
    setTimeout(() => process.exit(code), 1000);
  } catch {
    process.exit(code);
  }
};

// Security Middleware
try {
  const helmet = require('helmet');
  app.use(helmet());
} catch (e) {
  console.warn('[Security] helmet is not available:', e && e.message);
}

// Rate Limiting
try {
  const rateLimit = require('express-rate-limit');
  const limiter = rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: Number(process.env.RATE_LIMIT_MAX) || 200, // Limit each IP
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use(limiter);
} catch (e) {
  console.warn('[Security] express-rate-limit is not available:', e && e.message);
}

// Additional security headers applied to all responses
app.use((req, res, next) => {
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', process.env.REFERRER_POLICY || 'no-referrer-when-downgrade');
    // Only set HSTS if explicitly enabled via env to avoid local dev issues
    if (process.env.ENABLE_HSTS === 'true') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    // Minimal CSP to mitigate inline script attacks; configurable via env
    const csp = process.env.CONTENT_SECURITY_POLICY || "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:;";
    res.setHeader('Content-Security-Policy', csp);
  } catch (err) {
    // Non-fatal: continue request handling
    console.warn('[Security] failed to set some headers:', err && err.message);
  }
  next();
});

app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || randomUUID();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'info',
    event: 'http_request',
    correlationId,
    method: req.method,
    path: req.url
  }));
  next();
});

// Audit middleware for correlation ID propagation and context capture
const { auditContextMiddleware, auditAuthMiddleware, auditCrudMiddleware } = require('./auditMiddleware.cjs');
const { validateTransactionPrice, calculateSellingPrice } = require('./services/pricingEngine.cjs');
app.use(auditContextMiddleware);

app.use('/api/auth', auditAuthMiddleware);

// Shared helper for pricing validation
async function validateItemsPricing(items) {
  if (!items || !Array.isArray(items)) return;
  for (const item of items) {
    if (item.price != null && item.cost != null) {
      await validateTransactionPrice({
        itemId: item.itemId || item.productId || item.id,
        categoryId: item.categoryId || item.category,
        cost: item.cost,
        price: item.price,
        quantity: item.quantity || 1,
        adjustmentSnapshots: item.adjustmentSnapshots || [],
        adjustmentTotal: item.adjustmentTotal
      });
    }
  }
}




const normalizeCorsOrigin = (value) => String(value || '').trim().replace(/\/$/, '');

const isDesktopLocalOrigin = (origin) => {
  const normalized = normalizeCorsOrigin(origin);
  if (!normalized) return true;
  if (normalized === 'null') return true;
  if (/^file:\/\//i.test(normalized)) return true;

  try {
    const parsed = new URL(normalized);
    return ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname);
  } catch {
    return false;
  }
};

// CORS configuration - accepts frontend from environment or defaults
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'https://meek-starburst-fd4497.netlify.app',
      'http://127.0.0.1:5173',
      'http://localhost:5173',
      'http://127.0.0.1:3003',
      'http://localhost:3003',
      'http://127.0.0.1:5002',
      'http://localhost:5002'
    ].map(normalizeCorsOrigin).filter(Boolean);
    
    // Normalize origin to handle trailing slash
    const normalizedOrigin = normalizeCorsOrigin(origin);
    const isAllowed = allowedOrigins.includes(normalizedOrigin);
    const isDesktopOrigin = isDesktopLocalOrigin(normalizedOrigin);
    
    // Debug: log origin for troubleshooting
    console.log('[CORS]', {
      origin,
      normalizedOrigin,
      desktopLocal: isDesktopOrigin,
      allowed: isAllowed,
      method: 'CHECK'
    });
    
    // Allow requests with no origin (mobile apps, curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // Allow Electron/file origins and local loopback frontends used by the desktop app.
    if (isAllowed || isDesktopOrigin) {
      return callback(null, true);
    }
    
    // Deny but don't throw error
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-role', 'x-user-is-super-admin', 'x-correlation-id', 'x-dev-bypass', 'x-user-email', 'x-can-override-exam-cost'],
  credentials: true
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Explicit credentials header (safety net)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// Handle preflight for all routes (safe global handler)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-user-role, x-user-is-super-admin, x-correlation-id, x-dev-bypass, x-user-email, x-can-override-exam-cost');
    return res.sendStatus(204);
  }
  next();
});

// Global request logging (audit trail)
app.use((req, res, next) => {
  console.log('[REQ]', {
    method: req.method,
    url: req.originalUrl,
    origin: req.headers.origin
  });
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

const applyDocumentResponseHeaders = (res, { contentType, filename, inline = true }) => {
  const safeFilename = String(filename || 'document').replace(/"/g, '');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${safeFilename}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
};

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// Root route for Render health checks
app.get('/', (req, res) => {
  res.status(200).send('Backend Running');
});

// Explicit health check for Electron startup
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function startServer() {
  console.log('--- STARTING SERVER ---');

  try {
    await ensurePortAvailable(PORT);
  } catch (err) {
    console.error(`Startup aborted: ${err.message}`);
    process.exit(1);
  }

  try {
    await bootstrap();
    console.log('Bootstrap finished');
  } catch (err) {
    console.error('Bootstrap failed:', err);
    process.exit(1);
  }

  // System & Licensing Endpoints
  const licenseService = require('./services/licenseService.cjs');

  // SUSPECTED DEAD: No frontend or test caller found as of April 21, 2026.
  // Confirm before removing.
  app.get('/api/status', (req, res) => {
    res.json({ 
      status: 'online', 
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });

  app.get('/api', (req, res) => {
    res.json({ message: 'API is operational' });
  });

  // SUSPECTED DEAD: No frontend or test caller found as of April 21, 2026.
  // Confirm before removing.
  app.get('/api/health-check', (req, res) => {
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  });

  // SUSPECTED DEAD: No frontend or test caller found as of April 21, 2026.
  // Confirm before removing.
  app.get('/api/system/license', (req, res) => {
    res.json({
      fingerprint: licenseService.getFingerprint(),
      license: licenseService.validateLicense()
    });
  });

  app.get('/api/dashboard', async (req, res) => {
    const daysRaw = Number(req.query?.days);
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 120) : 30;

    const getOne = (query, params = []) => new Promise((resolve, reject) => {
      db.get(query, params, (error, row) => {
        if (error) reject(error);
        else resolve(row || {});
      });
    });

    const getAll = (query, params = []) => new Promise((resolve, reject) => {
      db.all(query, params, (error, rows) => {
        if (error) reject(error);
        else resolve(rows || []);
      });
    });

    try {
      const offset = `-${days - 1} days`;
      const [revenueRow, todayRow, outstandingRow, chartRows, salesRows, invoiceRows] = await Promise.all([
        getOne(`SELECT SUM(total_amount) as revenue FROM sales`),
        getOne(`SELECT SUM(total_amount) as todaySales FROM sales WHERE date(date) = date('now')`),
        getOne(`SELECT COUNT(*) as outstandingInvoices FROM invoices WHERE lower(COALESCE(status, '')) != 'paid'`),
        getAll(
          `SELECT date(date) as day, SUM(total_amount) as total
           FROM sales
           WHERE date(date) >= date('now', ?)
           GROUP BY date(date)
           ORDER BY day`,
          [offset]
        ),
        getAll(
          `SELECT id, customer_id as customerId, customer_name as customerName, total_amount as totalAmount, date
           FROM sales
           ORDER BY date DESC
           LIMIT 200`
        ),
        getAll(
          `SELECT id, customer_id as customerId, customer_name as customerName, total_amount as totalAmount, status, created_at as createdAt
           FROM invoices
           ORDER BY created_at DESC
           LIMIT 50`
        )
      ]);

      const chartIndex = new Map(chartRows.map(row => [row.day, row.total || 0]));
      const chartData = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const key = date.toISOString().slice(0, 10);
        chartData.push({
          day: key,
          total: chartIndex.get(key) || 0
        });
      }

      res.json({
        revenue: Number(revenueRow?.revenue || 0),
        todaySales: Number(todayRow?.todaySales || 0),
        outstandingInvoices: Number(outstandingRow?.outstandingInvoices || 0),
        chartData,
        sales: salesRows,
        invoices: invoiceRows
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/sales', (req, res) => {
    db.all(
      `SELECT 
        id, date, customer_id as customerId, customer_name as customerName, sub_account_name as subAccountName,
        total_amount as totalAmount, material_total as materialTotal, adjustment_total as adjustmentTotal,
        profit_margin_total as profitMarginTotal, rounding_total as roundingTotal,
        adjustment_snapshots_json as adjustmentSnapshots,
        status, payment_method as paymentMethod, source, items_json, payments_json
       FROM sales
       ORDER BY date DESC`,
      [],
      (error, rows) => {
        if (error) {
          return res.status(500).json({ error: error.message });
        }
        const sales = (rows || []).map((row) => ({
          id: row.id,
          date: row.date,
          customerId: row.customerId,
          customerName: row.customerName,
          subAccountName: row.subAccountName,
          totalAmount: Number(row.totalAmount || 0),
          materialTotal: Number(row.materialTotal || 0),
          adjustmentTotal: Number(row.adjustmentTotal || 0),
          profitMarginTotal: Number(row.profitMarginTotal || 0),
          roundingTotal: Number(row.roundingTotal || 0),
          status: row.status,
          paymentMethod: row.paymentMethod,
          source: row.source,
          items: parseJsonArray(row.items_json),
          payments: parseJsonArray(row.payments_json),
          adjustmentSnapshots: parseJsonArray(row.adjustmentSnapshots)
        }));
        res.json(sales);
      }
    );
  });

  app.post('/api/sales', async (req, res) => {
    const payload = req.body || {};
    
    try {
      await validateItemsPricing(payload.items);
    } catch (validationError) {
      console.error('[BACKEND] [Pricing Validation Failed]', validationError.message);
      return res.status(400).json({ error: validationError.message, code: 'PRICE_VALIDATION_FAILED' });
    }

    const id = payload.id || randomUUID();
    const date = payload.date || new Date().toISOString();
    const totalAmount = Number(payload.totalAmount ?? payload.total ?? 0);
    const materialTotal = Number(payload.materialTotal ?? payload.material_total ?? 0);
    const adjustmentTotal = Number(payload.adjustmentTotal ?? payload.adjustment_total ?? 0);
    const profitMarginTotal = Number(payload.profitMarginTotal ?? payload.profit_margin_total ?? 0);
    const roundingTotal = Number(payload.roundingTotal ?? payload.rounding_total ?? payload.roundingDifference ?? 0);
    const subAccountName = payload.subAccountName || payload.sub_account_name || 'Main';
    
    const customerId = payload.customerId || payload.customer_id || 'walk-in';
    const customerName = payload.customerName || payload.customer_name || 'Walk-in';
    const status = payload.status || 'Paid';
    const paymentMethod = payload.paymentMethod || payload.payment_method || null;
    const source = payload.source || null;
    
    const itemsJson = JSON.stringify(payload.items || []);
    const paymentsJson = JSON.stringify(payload.payments || []);
    const snapshotsJson = JSON.stringify(payload.adjustmentSnapshots || []);

    console.log(`[BACKEND] Creating POS sale #${id} for ${customerName}. Revenue: ${totalAmount}, Margin: ${profitMarginTotal}`);

    db.run(
      `INSERT INTO sales (
        id, date, customer_id, customer_name, sub_account_name, 
        total_amount, material_total, adjustment_total, profit_margin_total, rounding_total,
        adjustment_snapshots_json, status, payment_method, source, items_json, payments_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, date, customerId, customerName, subAccountName,
        totalAmount, materialTotal, adjustmentTotal, profitMarginTotal, roundingTotal,
        snapshotsJson, status, paymentMethod, source, itemsJson, paymentsJson
      ],
      (error) => {
        if (error) {
          console.error(`[BACKEND] Error creating sale #${id}:`, error.message);
          return res.status(500).json({ error: error.message });
        }
        res.json({
          id,
          date,
          customerId,
          customerName,
          subAccountName,
          totalAmount,
          materialTotal,
          adjustmentTotal,
          profitMarginTotal,
          roundingTotal,
          status,
          paymentMethod,
          source,
          items: payload.items || [],
          payments: payload.payments || [],
          adjustmentSnapshots: payload.adjustmentSnapshots || []
        });
      }
    );
  });

  // --- Examination Module Endpoints ---
  // Apply checkPermission middleware to all examination routes that modify state
  // For GET routes, we might allow read-only access or apply granular permissions if needed
  const examinationRoutes = require('./routes/examination.cjs');
  app.use('/api/examination', (req, res, next) => {
      if (req.method !== 'GET') {
          const userId = req.headers['x-user-id'];
          const userRole = req.headers['x-user-role'];
          if (!userId || !userRole) {
            return res.status(401).json({ error: 'Unauthorized' });
          }
      }
      next();
  }, auditCrudMiddleware('examination_batch'), examinationRoutes);

  // --- Profit Margin Settings Endpoints ---
  const settingsRoutes = require('./routes/settings.cjs');
  app.use('/api/settings', (req, res, next) => {
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];
    if (!userId || !userRole) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }, settingsRoutes);

  // --- System & Workspace Endpoints ---
  const systemRoutes = require('./routes/system.cjs');
  app.use('/api/system', systemRoutes);

  // Production fallback endpoint: return a basic set of work centers/resources
  // SUSPECTED DEAD: No frontend or test caller found as of April 21, 2026.
  // Confirm before removing.
  app.get('/api/production/seed-work-centers', (req, res) => {
    const mockWorkCenters = [
      { id: 'WC-1', name: 'Main Press', status: 'Active', description: 'Primary examination printing press' },
      { id: 'WC-2', name: 'Folding Station', status: 'Active', description: 'Paper folding and finishing' }
    ];

    const mockResources = [
      { id: 'R-1', name: 'Operator A', workCenterId: 'WC-1', status: 'Active' },
      { id: 'R-2', name: 'Operator B', workCenterId: 'WC-2', status: 'Active' }
    ];

    res.json({ workCenters: mockWorkCenters, resources: mockResources });
  });

  // Production: fetch real work centers from database
  app.get('/api/production/work-centers', (req, res) => {
    try {
      db.all('SELECT id, name, description, hourly_rate as hourlyRate, capacity_per_day as capacityPerDay, status FROM work_centers WHERE status = ? ORDER BY name', ['Active'], (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Production: fetch real resources from database
  app.get('/api/production/resources', (req, res) => {
    try {
      db.all('SELECT id, name, work_center_id as workCenterId, status FROM production_resources WHERE status = ? ORDER BY name', ['Active'], (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Document Engine Integration Endpoints ---
  const documentService = require('./services/documentService.cjs');
  // const pdfService = require('./services/pdfService.cjs');
  // const documentGenerator = require('./services/documentGenerator.cjs');

  // Pre-initialize the persistent PDF browser to eliminate launch latency
  console.log('[System] Pre-initializing Document Engine services...');
  /*
  pdfService.init().catch(err => {
    console.error('[System] Critical: PDF Service pre-initialization failed:', err);
  });
  */

  /**
   * Standardized error responder to ensure valid JSON and consistent fields.
   * Enforces mandatory diagnostic metadata for the document preview pipeline.
   */
  const sendError = (res, statusCode, message, code = 'INTERNAL_ERROR', diagnostic = null) => {
    // Default diagnostic generator to ensure it's never null or empty
    const generateDefaultDiagnostic = (msg, errCode) => {
      const timestamp = new Date().toISOString();
      return `[${timestamp}] Error ${errCode}: ${msg}. Please contact system administrator if this persists.`;
    };

    const finalDiagnostic = diagnostic && diagnostic.trim() !== "" 
      ? diagnostic 
      : generateDefaultDiagnostic(message, code);

    res.status(statusCode).json({
      status: 'error',
      error: message,
      code: code,
      diagnostic: finalDiagnostic
    });
  };

  // Middleware for simple "permission" check (can be expanded)
  const checkPermission = (action) => (req, res, next) => {
    const userId = req.headers['x-user-id'];
    const userRole = req.headers['x-user-role'];
    const userIsSuperAdmin = req.headers['x-user-is-super-admin'];
    
    if (!userId || !userRole || typeof userIsSuperAdmin === 'undefined') {
       return res.status(401).json({ error: 'Unauthorized' });
    }

    if (action.includes('admin') && userRole !== 'Admin') {
       return sendError(res, 403, 'Forbidden: Admin access required', 'ACCESS_DENIED');
    }

    req.userId = userId;
    req.userRole = userRole;
    req.userIsSuperAdmin = String(userIsSuperAdmin).toLowerCase() === 'true';
    next();
  };

  /**
   * Create/Edit Documents
   */
  app.post('/api/documents/register', checkPermission('create_document'), auditCrudMiddleware('document'), async (req, res) => {
    try {
      const { type, payload, id } = req.body;
      if (!type || !payload) {
        return sendError(res, 400, 'Document type and payload are required', 'MISSING_FIELDS');
      }
      const result = await documentService.registerDocument(type, payload, req.userId, id);
      try {
        await documentService.logAudit(req.userId, result.isNew ? 'CREATE' : 'UPDATE', 'document', result.id, { type, auto_registered: true });
      } catch (auditErr) {
        console.error('[Documents] Audit log failed (non-fatal):', auditErr);
      }
      res.status(result.isNew ? 201 : 200).json(result);
    } catch (err) {
      sendError(res, 500, err.message, 'REGISTRATION_FAILED');
    }
  });

  app.post('/api/documents', checkPermission('create_document'), auditCrudMiddleware('document'), async (req, res) => {
    try {
      const { type, payload } = req.body;
      const result = await documentService.createDocument(type, payload, req.userId);
      await documentService.logAudit(req.userId, 'CREATE', 'document', result.id, { type });
      res.status(201).json(result);
    } catch (err) {
      sendError(res, 500, err.message, 'CREATE_FAILED');
    }
  });

  app.put('/api/documents/:id', checkPermission('edit_document'), async (req, res) => {
    try {
      const { payload } = req.body;
      const result = await documentService.updateDocument(req.params.id, payload, req.userId);
      await documentService.logAudit(req.userId, 'UPDATE', 'document', req.params.id, { payload_updated: true });
      res.json(result);
    } catch (err) {
      sendError(res, 400, err.message, 'UPDATE_FAILED');
    }
  });

  /**
   * Workflow: Finalize/Void
   */
  app.post('/api/documents/:id/finalize', checkPermission('finalize_document'), async (req, res) => {
    try {
      const { blueprint } = req.body;
      if (!blueprint) {
        return sendError(res, 400, 'Layout blueprint is required for finalization', 'MISSING_BLUEPRINT');
      }
      
      const result = await documentService.finalizeDocument(req.params.id, blueprint, req.userId);
      await documentService.logAudit(req.userId, 'FINALIZE', 'document', req.params.id, { fingerprint: result.fingerprint });
      res.json(result);
    } catch (err) {
      sendError(res, 422, err.message, 'FINALIZE_FAILED');
    }
  });

  app.post('/api/documents/:id/void', checkPermission('void_document'), async (req, res) => {
    try {
      const result = await documentService.voidDocument(req.params.id, req.userId);
      await documentService.logAudit(req.userId, 'VOID', 'document', req.params.id, {});
      res.json(result);
    } catch (err) {
      sendError(res, 500, err.message, 'VOID_FAILED');
    }
  });

  /**
   * Preview/Export
   */
  app.get('/api/documents/:identifier/preview', checkPermission('view_document'), async (req, res) => {
    try {
      const purpose = req.query.purpose || 'preview';
      const { identifier } = req.params;
      
      // POLICY: Ensure document is registered if payload is available in session or provided
      // For GET previews, we primarily resolve. If it fails, we check if we can register.
      // However, the PreviewButton now handles the 'register-then-preview' flow via POST /register.
      // We still keep this robust by ensuring the resolver is context-aware.
      
      const renderModel = await documentService.getPreview(identifier, { purpose });
      res.json(renderModel);
    } catch (err) {
      if (err.name === 'ResolutionError') {
        return sendError(
          res, 
          err.code === 'ACCESS_DENIED' ? 403 : 404, 
          err.message, 
          err.code, 
          err.diagnostic
        );
      }
      sendError(res, 500, err.message, 'PREVIEW_PIPELINE_ERROR');
    }
  });

  app.get('/api/documents/:id/export', checkPermission('export_document'), async (req, res) => {
    try {
      const doc = await documentService.resolveDocument(req.params.id);
      if (!doc) return sendError(res, 404, 'Document not found', 'NOT_FOUND');

      const pdfBytes = await documentService.exportPdf(req.params.id);
      
      // Standardized filename generation
      const type = doc.type || 'Document';
      const id = doc.logical_number || doc.id;
      const customerName = doc.payload?.customerName || doc.payload?.clientName || 'Customer';
      
      const cleanCustomer = customerName.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
      const filename = `${type.toUpperCase()}-${id}_${cleanCustomer}.pdf`;

      const pdfBuffer = Buffer.from(pdfBytes);
      const isStream = req.query.stream === 'true';

      if (!isStream) {
        // Define Export Directory (User's Documents/ERP_Exports)
        const exportDir = path.join(os.homedir(), 'Documents', 'ERP_Exports');
        if (!fs.existsSync(exportDir)) {
          fs.mkdirSync(exportDir, { recursive: true });
        }

        const filePath = path.join(exportDir, filename);

        // Write to Disk
        fs.writeFileSync(filePath, pdfBuffer);
        console.log(`[Export] PDF saved to: ${filePath}`);

        // Automatically open the file using OS-specific shell
        try {
          const command = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
          require('child_process').exec(`${command} "${filePath}"`);
          console.log(`[Export] Opened file: ${filePath}`);
        } catch (openErr) {
          console.error(`[Export] Failed to open file: ${openErr.message}`);
        }
      }

      // Send back to client
      applyDocumentResponseHeaders(res, {
        contentType: 'application/pdf',
        filename,
        inline: isStream
      });
      res.send(pdfBuffer);
      
      await documentService.logAudit(req.userId, 'EXPORT_PDF', 'document', req.params.id, {
        filename,
        streamed: isStream,
        savedToDisk: !isStream
      });
    } catch (err) {
      sendError(res, 500, err.message, 'EXPORT_FAILED');
    }
  });

  /**
   * Batch Operations
   */
  app.post('/api/documents/batch/finalize', checkPermission('batch_finalize'), async (req, res) => {
    try {
      const { ids, blueprint } = req.body;
      if (!Array.isArray(ids) || !blueprint) {
        return sendError(res, 400, 'IDs array and blueprint are required', 'INVALID_BATCH_REQUEST');
      }
      const results = await documentService.batchFinalize(ids, blueprint, req.userId);
      await documentService.logAudit(req.userId, 'BATCH_FINALIZE', 'document_batch', null, { count: ids.length });
      res.json(results);
    } catch (err) {
      sendError(res, 500, err.message, 'BATCH_FINALIZE_FAILED');
    }
  });

  app.post('/api/documents/batch/export', checkPermission('batch_export'), async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return sendError(res, 400, 'IDs array is required', 'INVALID_BATCH_REQUEST');
      }
      
      const pdfs = await documentService.batchExport(ids);
      // In a real system, you might ZIP these or return a multipart response
      // For this implementation, we'll return metadata and base64 for demo purposes
      const results = pdfs.map(p => ({
        id: p.id,
        pdfBase64: Buffer.from(p.pdfBytes).toString('base64')
      }));
      
      await documentService.logAudit(req.userId, 'BATCH_EXPORT', 'document_batch', null, { count: ids.length });
      res.json(results);
    } catch (err) {
      sendError(res, 500, err.message, 'BATCH_EXPORT_FAILED');
    }
  });

  /**
   * Sales Exchange Module Endpoints
   */
  app.get('/api/sales-exchanges', checkPermission('view_exchanges'), (req, res) => {
    db.all('SELECT * FROM sales_exchanges ORDER BY exchange_date DESC', [], (err, rows) => {
      if (err) return sendError(res, 500, err.message, 'FETCH_EXCHANGES_FAILED');
      res.json(rows);
    });
  });

  app.get('/api/sales-exchanges/:id', checkPermission('view_exchanges'), async (req, res) => {
    try {
      const exchangeId = req.params.id;
      const exchange = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM sales_exchanges WHERE id = ?', [exchangeId], (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });
      if (!exchange) return sendError(res, 404, 'Exchange not found', 'NOT_FOUND');

      const [items, reprints, approvals] = await Promise.all([
        new Promise((resolve, reject) => {
          db.all('SELECT * FROM sales_exchange_items WHERE exchange_id = ?', [exchangeId], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
          });
        }),
        new Promise((resolve, reject) => {
          db.all('SELECT * FROM reprint_jobs WHERE exchange_id = ?', [exchangeId], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
          });
        }),
        new Promise((resolve, reject) => {
          db.all('SELECT * FROM sales_exchange_approvals WHERE exchange_id = ?', [exchangeId], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
          });
        })
      ]);

      res.json({
        ...exchange,
        items,
        reprint_jobs: reprints,
        approvals
      });
    } catch (err) {
      sendError(res, 500, err.message, 'FETCH_EXCHANGE_FAILED');
    }
  });

  app.post('/api/sales-exchanges', checkPermission('create_exchange'), async (req, res) => {
    try {
      const { 
        invoice_id, customer_id, customer_name, reason, remarks, items 
      } = req.body;

      if (!invoice_id || !reason || !items || !items.length) {
        return sendError(res, 400, 'Invoice ID, reason, and items are required', 'MISSING_FIELDS');
      }

      const exchange_number = `SE-${Date.now().toString().slice(-6)}`;

      const exchangeId = await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO sales_exchanges (exchange_number, invoice_id, customer_id, customer_name, reason, remarks, created_by) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [exchange_number, invoice_id, customer_id, customer_name, reason, remarks, req.userId],
          function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      });

      await new Promise((resolve, reject) => {
        const itemStmt = db.prepare(
          `INSERT INTO sales_exchange_items (exchange_id, product_id, product_name, qty_returned, qty_replaced, price_difference, condition) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`
        );

        let errorOccurred = false;
        items.forEach(item => {
          itemStmt.run([
            exchangeId, item.product_id, item.product_name, item.qty_returned, 
            item.qty_replaced, item.price_difference || 0, item.condition
          ], (err) => {
            if (err) errorOccurred = err;
          });
        });

        itemStmt.finalize((err) => {
          if (err || errorOccurred) return reject(err || errorOccurred);
          resolve();
        });
      });

      await documentService.logAudit(req.userId, 'CREATE', 'sales_exchange', exchangeId, { exchange_number });

      res.status(201).json({ id: exchangeId, exchange_number });
    } catch (err) {
      sendError(res, 500, err.message, 'CREATE_EXCHANGE_FAILED');
    }
  });  app.post('/api/sales-exchanges/:id/approve', checkPermission('approve_exchange'), async (req, res) => {
    try {
      const exchangeId = req.params.id;
      const { comments } = req.body;

      await new Promise((resolve, reject) => {
        db.run(
          "UPDATE sales_exchanges SET status = 'approved' WHERE id = ?",
          [exchangeId],
          function(err) {
            if (err) return reject(err);
            resolve();
          }
        );
      });

      await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO sales_exchange_approvals (exchange_id, approved_by, comments, status) VALUES (?, ?, ?, ?)",
          [exchangeId, req.userId, comments, 'approved'],
          (err) => {
            if (err) return reject(err);
            resolve();
          }
        );
      });

      // Auto-generate reprint job if needed
      const exchange = await new Promise((resolve, reject) => {
        db.get("SELECT * FROM sales_exchanges WHERE id = ?", [exchangeId], (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });

      if (exchange) {
        await new Promise((resolve, reject) => {
          db.run(
            "INSERT INTO reprint_jobs (exchange_id, job_description) VALUES (?, ?)",
            [exchangeId, `Reprint for Exchange ${exchange.exchange_number}: ${exchange.reason}`],
            (err) => {
              if (err) return reject(err);
              resolve();
            }
          );
        });
      }

      res.json({ status: 'approved' });
    } catch (err) {
      sendError(res, 500, err.message, 'APPROVE_EXCHANGE_FAILED');
    }
  });

  /**
   * Sales Orders Endpoints
   */
  app.get('/api/sales-orders', checkPermission('view_sales_orders'), (req, res) => {
    db.all('SELECT * FROM sales_orders ORDER BY orderDate DESC', [], (err, rows) => {
      if (err) return sendError(res, 500, err.message, 'FETCH_SALES_ORDERS_FAILED');
      res.json(rows);
    });
  });

  app.get('/api/sales-orders/:id', checkPermission('view_sales_orders'), (req, res) => {
    const id = req.params.id;
    db.get('SELECT * FROM sales_orders WHERE id = ?', [id], (err, row) => {
      if (err) return sendError(res, 500, err.message, 'FETCH_SALES_ORDER_FAILED');
      if (!row) return sendError(res, 404, 'Sales order not found', 'NOT_FOUND');
      res.json(row);
    });
  });

  app.post('/api/sales-orders', checkPermission('create_sales_order'), async (req, res) => {
    try {
      const o = req.body || {};
      if (!o.id || !o.items || !Array.isArray(o.items) || o.items.length === 0) {
        return sendError(res, 400, 'Order id and items are required', 'MISSING_FIELDS');
      }

      try {
        await validateItemsPricing(o.items);
      } catch (validationError) {
        console.error('[Pricing Validation Failed]', validationError.message);
        return sendError(res, 400, validationError.message, 'PRICE_VALIDATION_FAILED');
      }

      const now = new Date().toISOString();
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO sales_orders (id, quotation_id, customer_id, orderDate, deliveryDate, status, items, subtotal, discounts, tax, total, notes, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [o.id, o.quotationId || null, o.customerId || null, o.orderDate || now, o.deliveryDate || null, o.status || 'Draft', JSON.stringify(o.items), o.subtotal || 0, o.discounts || 0, o.tax || 0, o.total || 0, o.notes || '', req.userId, now],
          function(err) {
            if (err) return reject(err);
            resolve();
          }
        );
      });
      await documentService.logAudit(req.userId, 'CREATE', 'sales_order', o.id, { created: true });
      res.status(201).json({ id: o.id });
    } catch (err) {
      sendError(res, 500, err.message, 'CREATE_SALES_ORDER_FAILED');
    }
  });

  app.put('/api/sales-orders/:id', checkPermission('edit_sales_order'), (req, res) => {
    const id = req.params.id;
    const o = req.body || {};
    db.run(
      `UPDATE sales_orders SET quotation_id = ?, customer_id = ?, orderDate = ?, deliveryDate = ?, status = ?, items = ?, subtotal = ?, discounts = ?, tax = ?, total = ?, notes = ?, updated_by = ?, updated_at = ? WHERE id = ?`,
      [o.quotationId || null, o.customerId || null, o.orderDate || null, o.deliveryDate || null, o.status || 'Draft', JSON.stringify(o.items || []), o.subtotal || 0, o.discounts || 0, o.tax || 0, o.total || 0, o.notes || '', req.userId, new Date().toISOString(), id],
      function(err) {
        if (err) return sendError(res, 500, err.message, 'UPDATE_SALES_ORDER_FAILED');
        res.json({ status: 'updated' });
      }
    );
  });

  app.delete('/api/sales-orders/:id', checkPermission('delete_sales_order'), (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM sales_orders WHERE id = ?', [id], function(err) {
      if (err) return sendError(res, 500, err.message, 'DELETE_SALES_ORDER_FAILED');
      res.json({ status: 'deleted' });
    });
  });

  app.get('/api/reprint-jobs', checkPermission('view_reprints'), (req, res) => {
    db.all('SELECT * FROM reprint_jobs ORDER BY created_at DESC', [], (err, rows) => {
      if (err) return sendError(res, 500, err.message, 'FETCH_REPRINTS_FAILED');
      res.json(rows);
    });
  });

  app.put('/api/reprint-jobs/:id', checkPermission('edit_reprint'), (req, res) => {
    const { status, paper_used, ink_used, finishing_cost, total_reprint_cost } = req.body;
    const completed_at = status === 'completed' ? new Date().toISOString() : null;

    db.run(
      `UPDATE reprint_jobs 
       SET status = ?, paper_used = ?, ink_used = ?, finishing_cost = ?, total_reprint_cost = ?, completed_at = ?
       WHERE id = ?`,
      [status, paper_used, ink_used, finishing_cost, total_reprint_cost, completed_at, req.params.id],
      function(err) {
        if (err) return sendError(res, 500, err.message, 'UPDATE_REPRINT_FAILED');
        res.json({ status: 'updated' });
      }
    );
  });

  app.get('/api/documents/:id/verify', checkPermission('verify_document'), async (req, res) => {
    try {
      const result = await documentService.verifySignature(req.params.id);
      res.json(result);
    } catch (err) {
      sendError(res, 404, err.message, 'VERIFICATION_FAILED');
    }
  });

  app.get('/api/documents/:id/audit', checkPermission('view_audit'), (req, res) => {
    db.all("SELECT * FROM audit_logs WHERE entity_id = ? ORDER BY timestamp DESC", [req.params.id], (err, rows) => {
      if (err) return sendError(res, 500, err.message, 'AUDIT_FETCH_FAILED');
      res.json(rows);
    });
  });

  /**
   * PDF Generation Endpoint
   */
  /*
  app.post('/api/pdf/generate', async (req, res) => {
    try {
      const { html } = req.body;
      const isStream = req.query.stream === 'true';

      if (!html) {
        return sendError(res, 400, 'HTML content is required', 'MISSING_HTML');
      }

      const pdfBuffer = await pdfService.generatePdfFromHtml(html);

      res.setHeader('Content-Type', 'application/pdf');
      const disposition = isStream ? 'inline' : 'attachment';
      res.setHeader('Content-Disposition', `${disposition}; filename=document.pdf`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error('PDF generation endpoint error:', err);
      sendError(res, 500, 'Failed to generate PDF', 'PDF_GENERATION_FAILED');
    }
  });
  */

  /**
   * Universal Dispatcher Endpoint
   * Takes document data and generates a styled PDF regardless of type.
   */
  /*
  app.post('/api/documents/dispatch', async (req, res) => {
    try {
      const { docType, data, id } = req.body;
      const isStream = req.query.stream === 'true';

      let finalData = data;
      let finalType = docType;

      // If an ID is provided, resolve the document first
      if (id) {
        const doc = await documentService.resolveDocument(id);
        if (!doc) return sendError(res, 404, 'Document not found', 'NOT_FOUND');
        finalData = JSON.parse(doc.payload);
        finalType = doc.type || finalType;
        // Include ID and logical number in final data for the generator
        finalData.id = doc.id;
        finalData.logical_number = doc.logical_number;
      }

      if (!finalType || !finalData) {
        return sendError(res, 400, 'docType and data (or id) are required', 'INVALID_DISPATCH_REQUEST');
      }

      console.log(`[Dispatcher] Generating ${finalType} PDF...`);
      const pdfBytes = await documentGenerator.generate(finalType, finalData);
      const pdfBuffer = Buffer.from(pdfBytes);

      const filename = `${finalType.toUpperCase()}-${finalData.logical_number || 'TEMP'}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      const disposition = isStream ? 'inline' : 'attachment';
      res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
      res.send(pdfBuffer);

      if (id) {
        await documentService.logAudit(req.userId || 'system', 'DISPATCH_PDF', 'document', id, {
          type: finalType,
          streamed: isStream
        });
      }
    } catch (err) {
      console.error('[Dispatcher] Error:', err);
      sendError(res, 500, err.message, 'DISPATCH_FAILED');
    }
  });
  */

  // --- End of Document Engine Endpoints ---
  app.get('/api/classes', (req, res) => {
    db.all("SELECT * FROM classes ORDER BY name", [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  app.post('/api/classes', (req, res) => {
    const { name } = req.body;
    db.run("INSERT INTO classes (name) VALUES (?)", [name], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, name });
    });
  });

  app.delete('/api/classes/:id', (req, res) => {
    db.run("DELETE FROM classes WHERE id = ?", [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });

  // --- Subjects Endpoints ---
  app.get('/api/subjects', (req, res) => {
    db.all("SELECT * FROM subjects ORDER BY name", [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  app.post('/api/subjects', (req, res) => {
    const { name, code } = req.body;
    db.run("INSERT INTO subjects (name, code) VALUES (?, ?)", [name, code], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, name, code });
    });
  });

  app.delete('/api/subjects/:id', (req, res) => {
    db.run("DELETE FROM subjects WHERE id = ?", [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });

  // 1. GET Schools
  // SUSPECTED DEAD: No frontend or test caller found as of April 21, 2026.
  // Confirm before removing.
  app.get('/api/schools', checkPermission('view_schools'), (req, res) => {
    db.all("SELECT * FROM schools", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

  // 2. GET Inventory
  // SUSPECTED DEAD: No frontend or test caller found as of April 21, 2026.
  // Confirm before removing.
  app.get('/api/inventory', checkPermission('view_inventory'), (req, res) => {
    db.all("SELECT * FROM inventory", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 2.1 Calculate Variant Price - Dynamic pricing for product variants
// SUSPECTED DEAD: No frontend or test caller found as of April 21, 2026.
// Confirm before removing.
app.post('/api/calculate-variant-price', (req, res) => {
  const { parentId, variantId, pages, quantity = 1 } = req.body;
  
  if (!parentId) {
    return res.status(400).json({ error: 'Parent item ID is required' });
  }
  
  // Get parent item
  db.get("SELECT * FROM inventory WHERE id = ?", [parentId], (err, parentItem) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!parentItem) return res.status(404).json({ error: 'Parent item not found' });
    
    // Parse variants if stored as string
    let variants = parentItem.variants;
    if (typeof variants === 'string') {
      try { variants = JSON.parse(variants); } catch (e) { variants = []; }
    }
    
    // Find the variant
    const variant = variants?.find(v => v.id === variantId);
    if (variantId && !variant) {
      return res.status(404).json({ error: 'Variant not found' });
    }
    
    // Get all inventory for material lookups
    db.all("SELECT * FROM inventory", [], (err, inventory) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // Get BOM templates
      db.all("SELECT * FROM bom_templates", [], (err, bomTemplates) => {
        if (err) console.error('Error fetching BOM templates:', err);
        
        // Get market adjustments
        db.all("SELECT * FROM market_adjustments WHERE active = 1", [], (err, marketAdjustments) => {
          if (err) console.error('Error fetching market adjustments:', err);
          
          // Parse smart pricing config
          let smartPricing = parentItem.smart_pricing || parentItem.smartPricing;
          if (typeof smartPricing === 'string') {
            try { smartPricing = JSON.parse(smartPricing); } catch (e) { smartPricing = null; }
          }
          
          // Check if dynamic pricing should be used
          const hiddenBOMId = smartPricing?.hiddenBOMId || smartPricing?.bomTemplateId;
          const useDynamicPricing = variant?.pricingSource === 'dynamic' || 
                                     variant?.inheritsParentBOM || 
                                     (hiddenBOMId && variant?.pricingSource !== 'static');
          
          if (!useDynamicPricing || !hiddenBOMId) {
            // Return static pricing
            return res.json({
              price: variant?.price || parentItem.price || 0,
              cost: variant?.cost || parentItem.cost || 0,
              basePrice: variant?.price || parentItem.price || 0,
              adjustmentTotal: 0,
              adjustmentSnapshots: [],
              consumption: null,
              breakdown: [],
              transactionAdjustmentSnapshots: [],
              pricingMode: 'static'
            });
          }
          
          // Find BOM template
          const template = bomTemplates?.find(t => t.id === hiddenBOMId);
          if (!template) {
            return res.json({
              price: variant?.price || parentItem.price || 0,
              cost: variant?.cost || parentItem.cost || 0,
              basePrice: variant?.price || parentItem.price || 0,
              adjustmentTotal: 0,
              adjustmentSnapshots: [],
              consumption: null,
              breakdown: [],
              transactionAdjustmentSnapshots: [],
              pricingMode: 'static',
              warning: 'BOM template not found, using static pricing'
            });
          }
          
          // Calculate dynamic pricing
          const effectivePages = pages || variant?.pages || 1;
          const totalPages = effectivePages * quantity;
          
          // Calculate BOM cost
          let bomCost = 0;
          const bomBreakdown = [];
          
          // Parse template components
          let components = template.components;
          if (typeof components === 'string') {
            try { components = JSON.parse(components); } catch (e) { components = []; }
          }
          
          for (const comp of components || []) {
            const material = inventory.find(i => i.id === comp.itemId || i.name === comp.name);
            if (!material) continue;
            
            let consumedQty = 0;
            const isPaper = comp.itemId?.toLowerCase().includes('paper') || material.category === 'Paper';
            const isToner = comp.itemId?.toLowerCase().includes('toner') || material.category === 'Toner';
            
            if (isPaper) {
              // Sheets = ceil(pages / 2) for double-sided
              const sheets = Math.ceil(totalPages / 2);
              const reamSize = material.conversion_rate || material.conversionRate || 500;
              consumedQty = sheets / reamSize;
            } else if (isToner) {
              // Toner per page (assume 0.05g per page)
              consumedQty = totalPages * 0.00005; // kg
            } else {
              // Use formula if available
              if (comp.quantityFormula) {
                try {
                  const formula = comp.quantityFormula;
                  const variables = { pages: effectivePages, quantity: quantity };
                  consumedQty = safeEvaluate(formula, variables);
                } catch (e) {
                  console.error('Formula error:', e);
                }
              }
            }
            
            if (consumedQty > 0) {
              const matCost = consumedQty * (material.cost || 0);
              bomCost += matCost;
              bomBreakdown.push({
                materialId: material.id,
                materialName: material.name,
                quantity: consumedQty,
                unit: material.unit,
                cost: material.cost
              });
            }
          }
          
          const unitCost = bomCost / quantity;
          
          // Apply market adjustments
          let adjustmentTotal = 0;
          const adjustmentSnapshots = [];
          
          for (const adj of (marketAdjustments || [])) {
            const isActive = adj.active ?? adj.isActive;
            if (!isActive) continue;
            
            let amount = 0;
            if (adj.type === 'PERCENTAGE' || adj.type === 'PERCENT') {
              amount = unitCost * ((adj.percentage || adj.value) / 100);
            } else {
              amount = adj.value;
            }
            
            adjustmentTotal += amount;
            adjustmentSnapshots.push({
              name: adj.name,
              type: adj.type,
              value: adj.value,
              calculatedAmount: Math.round(amount * 100) / 100
            });
          }
          
          const finalPrice = Math.round((unitCost + adjustmentTotal) * 100) / 100;
          
          res.json({
            price: finalPrice,
            cost: Math.round(unitCost * 100) / 100,
            basePrice: unitCost,
            adjustmentTotal: Math.round(adjustmentTotal * 100) / 100,
            adjustmentSnapshots,
            consumption: {
              id: `SNAP-${Date.now()}`,
              itemId: parentId,
              variantId: variantId,
              pages: totalPages,
              bomBreakdown,
              costPerUnit: unitCost,
              timestamp: new Date().toISOString()
            },
            breakdown: bomBreakdown,
            transactionAdjustmentSnapshots: [],
            pricingMode: 'dynamic',
            calculatedAt: new Date().toISOString()
          });
        });
      });
    });
  });
});

// 3. GET Examinations (with status filter)
  // SUSPECTED DEAD: No frontend or test caller found as of April 21, 2026.
  // Confirm before removing.
app.get('/api/examinations', (req, res) => {
  const { status, school_id } = req.query;
  let query = "SELECT * FROM examinations WHERE 1=1";
  const params = [];

  if (status) {
    query += " AND status = ?";
    params.push(status);
  }
  if (school_id) {
    query += " AND school_id = ?";
    params.push(school_id);
  }

  query += " ORDER BY created_at DESC";

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 4. Multi-Subject Calculation API
// SUSPECTED DEAD: No frontend or test caller found as of April 21, 2026.
// Confirm before removing.
app.post('/api/calculate', (req, res) => {
  const { school_id, subjects } = req.body;
  console.log(`Calculation requested for school_id: ${school_id}`);

  db.get("SELECT * FROM schools WHERE id = ?", [school_id], (err, school) => {
    if (err) console.error('Database error in /api/calculate:', err);
    
    // Fallback pricing if school not found or error
    const effectiveSchool = school || {
      pricing_type: 'margin-based',
      pricing_value: 0.3 // Default 30% margin
    };
    
    if (!school) {
      console.log(`School ID ${school_id} not found, using fallback pricing.`);
    }

    // Fetch current inventory costs for accurate estimation
    db.all("SELECT material, cost_per_unit FROM inventory WHERE material IN ('Paper', 'Toner')", [], (err, inv) => {
      const paper = inv?.find(i => i.material === 'Paper') || { cost_per_unit: 35 };
      const toner = inv?.find(i => i.material === 'Toner') || { cost_per_unit: 0.25 };
      
      // Costing logic with conversion: 
      // Paper cost is per sheet
      // Toner cost is per mg, so we multiply by mg per sheet
      const internal_cost_per_sheet = paper.cost_per_unit + (toner.cost_per_unit * TONER_MG_PER_SHEET);

      const results = subjects.map(subj => {
        const pages = parseInt(subj.pages) || 0;
        const candidates = parseInt(subj.candidates) || 0;
        const extra_copies = parseInt(subj.extra_copies) || 0;
        const charge_per_learner = parseFloat(subj.charge_per_learner) || 0;

        // PRINTING LOGIC
        const sheets_per_copy = Math.ceil(pages / 2);
        const production_copies = candidates + extra_copies;
        const base_sheets = sheets_per_copy * production_copies;
        // Waste is now purely manual entry at completion, but we still need an internal estimate for costing
        const estimated_waste_percent = 5; // Default 5% for internal estimation
        const waste_sheets = Math.ceil(base_sheets * (estimated_waste_percent / 100));
        const total_sheets_used = base_sheets + waste_sheets;
        const billable_sheets = sheets_per_copy * candidates;

        // COSTING (Estimated)
        const estimated_internal_cost = total_sheets_used * internal_cost_per_sheet;
        
        let selling_price = 0;
        if (charge_per_learner > 0) {
          selling_price = candidates * charge_per_learner;
        } else if (effectiveSchool.pricing_type === 'margin-based') {
          selling_price = estimated_internal_cost * (1 + effectiveSchool.pricing_value);
        } else if (effectiveSchool.pricing_type === 'per-sheet') {
          selling_price = billable_sheets * effectiveSchool.pricing_value;
        }

        return {
          ...subj,
          sheets_per_copy,
          production_copies,
          base_sheets,
          waste_sheets,
          total_sheets_used,
          billable_sheets,
          internal_cost: estimated_internal_cost,
          selling_price
        };
      });

      res.json({ subjects: results });
    });
  });
});

// 5. Confirm Batch
app.post('/api/confirm-batch', async (req, res) => {
  try {
    const { school_id, customer_id, class_name, subjects, academic_year, term, exam_type, sub_account_name } = req.body;
    const batch_id = `BATCH-${Date.now()}`;

    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        const stmt = db.prepare(`INSERT INTO examinations (
          batch_id, school_id, customer_id, school_name, sub_account_name, class, subject, pages, candidates, extra_copies,
          charge_per_learner, sheets_per_copy, production_copies, base_sheets, waste_sheets, 
          total_sheets_used, billable_sheets, internal_cost, selling_price, status,
          academic_year, term, exam_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`);

        let errorOccurred = false;
        subjects.forEach(subj => {
          stmt.run([
            batch_id, school_id, customer_id, subj.school_name, sub_account_name, class_name, subj.subject, subj.pages, subj.candidates, 
            subj.extra_copies, subj.charge_per_learner, subj.sheets_per_copy, subj.production_copies, 
            subj.base_sheets, subj.waste_sheets, subj.total_sheets_used, subj.billable_sheets, 
            subj.internal_cost, subj.selling_price, academic_year, term, exam_type
          ], (err) => {
            if (err) errorOccurred = true;
          });
        });

        stmt.finalize((err) => {
          if (err || errorOccurred) {
            db.run("ROLLBACK");
            return reject(err || new Error("Failed to save batch"));
          }
          db.run("COMMIT", (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      });
    });

    res.json({ success: true, batch_id });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to save batch" });
  }
});

// 6. Complete Subject with Actual Waste
// SUSPECTED DEAD: No frontend or test caller found as of April 21, 2026.
// Confirm before removing.
app.post('/api/complete-subject', async (req, res) => {
  const { exam_id, actual_waste_sheets } = req.body;

  try {
    // 1. Get current exam data
    const exam = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM examinations WHERE id = ?", [exam_id], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!exam) {
      return res.status(404).json({ error: "Examination not found" });
    }

    if (exam.status !== 'pending') {
      return res.status(400).json({ error: "Subject already completed or invoiced" });
    }

    // 2. Recalculate based on actual waste
    const actual_total_sheets = exam.base_sheets + parseFloat(actual_waste_sheets);

    // Get current paper/toner costs from inventory
    const inv = await new Promise((resolve, reject) => {
      db.all("SELECT material, cost_per_unit, quantity FROM inventory WHERE material IN ('Paper', 'Toner')", [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    const paper = inv.find(i => i.material === 'Paper');
    const toner = inv.find(i => i.material === 'Toner');

    if (!paper || !toner) {
      return res.status(500).json({ error: "Required inventory items (Paper/Toner) not found" });
    }

    const actual_toner_usage_mg = actual_total_sheets * TONER_MG_PER_SHEET;

    if (paper.quantity < actual_total_sheets || toner.quantity < actual_toner_usage_mg) {
      return res.status(400).json({ error: "Insufficient inventory for actual usage" });
    }

    const actual_internal_cost_per_sheet = paper.cost_per_unit + (toner.cost_per_unit * TONER_MG_PER_SHEET);
    const actual_internal_cost = actual_total_sheets * actual_internal_cost_per_sheet;

    // Re-calculate selling price based on school rules
    const school = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM schools WHERE id = ?", [exam.school_id], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    const effectiveSchool = school || {
      pricing_type: 'margin-based',
      pricing_value: 0.3
    };

    let selling_price = 0;
    if (exam.charge_per_learner > 0) {
      selling_price = exam.candidates * exam.charge_per_learner;
    } else if (effectiveSchool.pricing_type === 'margin-based') {
      selling_price = actual_internal_cost * (1 + effectiveSchool.pricing_value);
    } else if (effectiveSchool.pricing_type === 'per-sheet') {
      selling_price = exam.billable_sheets * effectiveSchool.pricing_value;
    }

    // 3. Update Inventory and Examination Record atomically
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        db.run("UPDATE inventory SET quantity = quantity - ? WHERE material = 'Paper'", [actual_total_sheets], (err) => {
          if (err) {
            db.run("ROLLBACK");
            return reject(err);
          }
        });

        db.run("UPDATE inventory SET quantity = quantity - ? WHERE material = 'Toner'", [actual_toner_usage_mg], (err) => {
          if (err) {
            db.run("ROLLBACK");
            return reject(err);
          }
        });

        db.run(`UPDATE examinations SET 
                actual_waste_sheets = ?, 
                total_sheets_used = ?, 
                internal_cost = ?, 
                selling_price = ?, 
                status = 'completed' 
                WHERE id = ?`, 
          [actual_waste_sheets, actual_total_sheets, actual_internal_cost, selling_price, exam_id], (err) => {
            if (err) {
              db.run("ROLLBACK");
              return reject(err);
            }

            db.run("COMMIT", (err) => {
              if (err) return reject(err);
              resolve();
            });
        });
      });
    });

    res.json({ success: true, actual_total_sheets, selling_price });
  } catch (err) {
    res.status(500).json({ error: err.message || "Transaction failed" });
  }
});

// 7. Generate Bulk Invoice
// SUSPECTED DEAD: No frontend or test caller found as of April 21, 2026.
// Confirm before removing.
app.post('/api/generate-invoice', async (req, res) => {
  try {
    const { exam_ids, school_id, customer_id, sub_account_name } = req.body;
    const placeholders = exam_ids.map(() => '?').join(',');

    // Get total amount and details grouped by class
    const rows = await new Promise((resolve, reject) => {
      db.all(`SELECT class, SUM(candidates) as total_learners, AVG(charge_per_learner) as avg_charge, SUM(selling_price) as total_price 
              FROM examinations 
              WHERE id IN (${placeholders})
              GROUP BY class`, exam_ids, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    const subtotal = rows.reduce((sum, row) => sum + row.total_price, 0);
    const total_amount = subtotal;

    // Create Invoice and update examinations atomically
    const invoice_id = await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        db.run("INSERT INTO invoices (school_id, customer_id, sub_account_name, subtotal, total_amount, status) VALUES (?, ?, ?, ?, ?, 'unpaid')", 
          [school_id, customer_id, sub_account_name, subtotal, total_amount], function(err) {
          if (err) {
            db.run("ROLLBACK");
            return reject(err);
          }

          const newInvoiceId = this.lastID;

          db.run(`UPDATE examinations SET status = 'invoiced', invoice_id = ? WHERE id IN (${placeholders})`, 
            [newInvoiceId, ...exam_ids], (err) => {
            if (err) {
              db.run("ROLLBACK");
              return reject(err);
            }

            db.run("COMMIT", (err) => {
              if (err) return reject(err);
              resolve(newInvoiceId);
            });
          });
        });
      });
    });

    res.json({ success: true, invoice_id, subtotal, total_amount });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to generate invoice" });
  }
});

  // 8. Get All Invoices
  // SUSPECTED DEAD: No frontend or test caller found as of April 21, 2026.
  // Confirm before removing.
  app.get('/api/invoices', checkPermission('view_invoices'), (req, res) => {
    db.all(`SELECT i.*, COALESCE(s.name, 'Independent Customer') as school_name 
            FROM invoices i 
            LEFT JOIN schools s ON i.school_id = s.id 
            ORDER BY i.created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 9. Mark Invoice as Paid
// SUSPECTED DEAD: No frontend or test caller found as of April 21, 2026.
// Confirm before removing.
app.post('/api/invoices/:id/pay', (req, res) => {
  const { id } = req.params;
  const { payment_method } = req.body;
  const paid_at = new Date().toISOString();

  db.run("UPDATE invoices SET status = 'paid', payment_method = ?, paid_at = ? WHERE id = ?", 
    [payment_method || 'Cash', paid_at, id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, paid_at });
  });
});

// 11. Delete Examination Batch
app.delete('/api/examinations/batch/:batch_id', (req, res) => {
  const { batch_id } = req.params;
  db.run("DELETE FROM examinations WHERE batch_id = ? AND status = 'pending'", [batch_id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 13. Toggle Recurring Status
app.post('/api/examinations/batch/:batch_id/recurring', (req, res) => {
  const { batch_id } = req.params;
  const { is_recurring } = req.body;
  db.run("UPDATE examinations SET is_recurring = ? WHERE batch_id = ?", [is_recurring ? 1 : 0, batch_id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 12. Get Invoice Details
app.get('/api/invoices/:id/details', (req, res) => {
  const { id } = req.params;
  db.all(`SELECT class, SUM(candidates) as learner_count, AVG(charge_per_learner) as charge_per_learner, SUM(selling_price) as total
          FROM examinations 
          WHERE invoice_id = ? 
          GROUP BY class`, [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

  // 10. Get Examination Stats
  app.get('/api/stats/examination', checkPermission('view_stats'), (req, res) => {
    const stats = {};
    
    db.get("SELECT COUNT(*) as count FROM examinations WHERE status = 'pending'", (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      stats.pending_jobs = row?.count || 0;
      
      db.get("SELECT SUM(total_amount) as total FROM invoices WHERE status = 'paid'", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        stats.total_revenue = row?.total || 0;
        
        db.get("SELECT SUM(total_amount) as total FROM invoices WHERE status = 'unpaid'", (err, row) => {
          if (err) return res.status(500).json({ error: err.message });
          stats.outstanding_amount = row?.total || 0;
          
          db.get("SELECT SUM(actual_waste_sheets) as waste FROM examinations", (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            stats.total_waste = row?.waste || 0;
            
            db.get("SELECT SUM(total_sheets_used) as total, SUM(internal_cost) as cost FROM examinations", (err, row) => {
              if (err) return res.status(500).json({ error: err.message });
              stats.total_sheets = row?.total || 0;
              stats.total_cost = row?.cost || 0;
              res.json(stats);
            });
          });
        });
      });
    });
  });

  // 14. Get Monthly Examination Data for Dashboard
  app.get('/api/stats/monthly-data', checkPermission('view_stats'), (req, res) => {
    const currentYear = new Date().getFullYear();
    
    const query = `
      SELECT 
        m.month,
        COALESCE(i.revenue, 0) as revenue,
        COALESCE(e.month_cost, 0) as cost
      FROM (
        SELECT '01' as month UNION SELECT '02' UNION SELECT '03' UNION SELECT '04' 
        UNION SELECT '05' UNION SELECT '06' UNION SELECT '07' UNION SELECT '08' 
        UNION SELECT '09' UNION SELECT '10' UNION SELECT '11' UNION SELECT '12'
      ) m
      LEFT JOIN (
        SELECT strftime('%m', created_at) as month, SUM(total_amount) as revenue
        FROM invoices 
        WHERE strftime('%Y', created_at) = ? AND status != 'cancelled'
        GROUP BY month
      ) i ON m.month = i.month
      LEFT JOIN (
        SELECT strftime('%m', created_at) as month, SUM(internal_cost) as month_cost
        FROM examinations
        WHERE strftime('%Y', created_at) = ?
        GROUP BY month
      ) e ON m.month = e.month
      ORDER BY m.month
    `;

    db.all(query, [currentYear.toString(), currentYear.toString()], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });
  // --- End of Monthly Data ---

  // === Inventory Transaction API Endpoints ===
  
  // Create inventory transaction (deduction)
  app.post('/api/inventory/transactions', checkPermission('create_transaction'), async (req, res) => {
    try {
      const { itemId, warehouseId, quantity, batchId, reason, reference, referenceId, performedBy, type } = req.body;

      if (!itemId || !quantity || !reason) {
        return res.status(400).json({ error: 'Missing required fields: itemId, quantity, reason' });
      }

      // Get current inventory
      const item = await new Promise((resolve, reject) => {
        db.get("SELECT * FROM inventory WHERE id = ?", [itemId], (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });

      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }

      const currentQuantity = item.quantity || 0;
      const isDeduction = quantity < 0 || type === 'OUT';

      // Check if sufficient quantity for deductions
      if (isDeduction && currentQuantity < Math.abs(quantity)) {
        return res.status(400).json({ 
          error: `Insufficient stock. Available: ${currentQuantity}, Requested: ${Math.abs(quantity)}` 
        });
      }

      const newQuantity = currentQuantity + (type === 'IN' ? quantity : quantity);
      const unitCost = item.cost_per_unit || item.cost || 0;
      const totalCost = Math.abs(quantity) * unitCost;
      const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create transaction record and update inventory atomically
      await new Promise((resolve, reject) => {
        db.serialize(() => {
          db.run("BEGIN TRANSACTION");

          db.run(`INSERT INTO inventory_transactions 
            (id, item_id, warehouse_id, batch_id, type, quantity, previous_quantity, new_quantity, 
              unit_cost, total_cost, reason, reference, reference_id, performed_by, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
            [transactionId, itemId, warehouseId || null, batchId || null, type || (isDeduction ? 'OUT' : 'IN'),
              quantity, currentQuantity, newQuantity, unitCost, isDeduction ? -totalCost : totalCost,
              reason, reference || null, referenceId || null, performedBy || 'system', new Date().toISOString()],
            (err) => {
            if (err) {
              db.run("ROLLBACK");
              return reject(err);
            }

            // Update inventory
            db.run("UPDATE inventory SET quantity = ? WHERE id = ?", [newQuantity, itemId], (err) => {
              if (err) {
                db.run("ROLLBACK");
                return reject(err);
              }

              db.run("COMMIT", (err) => {
                if (err) return reject(err);
                resolve();
              });
            });
          });
        });
      });

      res.json({ 
        success: true, 
        transactionId,
        previousQuantity: currentQuantity,
        newQuantity,
        remainingQuantity: newQuantity
      });
    } catch (err) {
      console.error('Error creating inventory transaction:', err);
      res.status(500).json({ error: 'Failed to create transaction' });
    }
  });
  
  // Get transaction history for item
  app.get('/api/inventory/:itemId/transactions', checkPermission('view_inventory'), (req, res) => {
    const { itemId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    db.all(`SELECT * FROM inventory_transactions 
            WHERE item_id = ? 
            ORDER BY timestamp DESC 
            LIMIT ?`, [itemId, limit], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  });
  
  // Get warehouse inventory
  app.get('/api/inventory/warehouse/:warehouseId', (req, res) => {
    const { warehouseId } = req.params;
    
    db.all(`SELECT wi.*, i.name as item_name, i.material, i.cost_per_unit, i.unit
            FROM warehouse_inventory wi
            LEFT JOIN inventory i ON wi.item_id = i.id
            WHERE wi.warehouse_id = ?`, [warehouseId], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  });
  
  // Get active batches for item
  app.get('/api/inventory/:itemId/batches', (req, res) => {
    const { itemId } = req.params;
    
    db.all(`SELECT * FROM material_batches 
            WHERE item_id = ? AND status = 'active' AND remaining_quantity > 0
            ORDER BY received_date ASC`, [itemId], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  });

  // Catch-all for unknown API routes to ensure JSON response
  app.use('/api', (req, res) => {
    return sendError(res, 404, 'API endpoint not found', 'NOT_FOUND');
  });

  app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });

app.use((err, req, res, next) => {
  console.error('[ERROR]', {
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl
  });
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});


  let server;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    try {
      console.log(`[BACKEND] Attempting to start server on port ${PORT} (Attempt ${attempts + 1}/${maxAttempts})...`);
      server = await new Promise((resolve, reject) => {
        const s = app.listen(PORT, '0.0.0.0', () => {
          console.log(`[BACKEND] Server successfully bound to port ${PORT}`);
          resolve(s);
        });
        
        s.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            console.warn(`[BACKEND] Port ${PORT} is already in use.`);
            reject(err);
          } else {
            console.error(`[BACKEND] Failed to listen on port ${PORT}:`, err.message);
            reject(err);
          }
        });
      });
      break; 
    } catch (err) {
      if (err.code === 'EADDRINUSE') {
        PORT++;
        attempts++;
      } else {
        console.error('[BACKEND] Fatal startup error:', err.message);
        throw err;
      }
    }
  }

  if (!server) {
    throw new Error(`[BACKEND] Failed to start server after ${maxAttempts} attempts.`);
  }

  // Keep-alive mechanism
  const keepAliveId = setInterval(() => {
    // Just to keep the event loop busy
  }, 60000);

  const shutdown = async () => {
    console.log('[BACKEND] Shutdown signal received. Cleaning up...');
    clearInterval(keepAliveId);
    
    // Close the database connection
    try {
      console.log('[BACKEND] Closing database connection...');
      db.close((err) => {
        if (err) console.error('[BACKEND] Error closing database:', err.message);
        else console.log('[BACKEND] Database connection closed.');
      });
    } catch (dbErr) {
      console.error('[BACKEND] Failed to close database:', dbErr.message);
    }

    server.close(() => {
      console.log('[BACKEND] Server closed.');
      process.exit(0);
    });
    
    // Force exit if server.close hangs
    setTimeout(() => {
      console.error('[BACKEND] Shutdown timed out, forcing exit.');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

process.on('exit', (code) => {
  console.log(`Process about to exit with code: ${code}`);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer().catch(err => {
  console.error('Failed to start server:', err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
