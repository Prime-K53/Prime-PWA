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
const { getFrontendDistPath } = require('./appRoot.cjs');
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
const { verifyToken, requireRole } = require('./middleware/auth.cjs');
const { validateBody, sanitizeInput, inventorySchemas, salesSchemas, userSchemas, financialSchemas, productionSchemas, documentSchemas, exchangeSchemas, orderSchemas, classSchemas, subjectSchemas, notificationSchemas } = require('./middleware/validation.cjs');
const authRoutes = require('./routes/auth.cjs');
app.use(auditContextMiddleware);

app.use('/api/auth', auditAuthMiddleware, authRoutes);

// CORS configuration - accepts all local/LAN origins for browser-based access
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    const normalizedOrigin = normalizeCorsOrigin(origin);
    if (isDesktopLocalOrigin(normalizedOrigin)) {
      return callback(null, true);
    }
    try {
      const parsed = new URL(normalizedOrigin);
      const hostname = parsed.hostname;
      if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
          /^10\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
          /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname === '0.0.0.0') {
        return callback(null, true);
      }
    } catch {
      return callback(null, false);
    }
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-role', 'x-user-email', 'x-correlation-id'],
  credentials: true
};

// Apply CORS middleware before auth so preflight OPTIONS get proper headers
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
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-user-role, x-user-email, x-correlation-id');
    // Only echo back if origin passed CORS validation (safe), otherwise deny
    const safeOrigin = req.headers['origin']
      ? corsOptions.origin(req.headers['origin'], (err, allowed) => allowed ? req.headers['origin'] : null)
      : null;
    res.header('Access-Control-Allow-Origin', safeOrigin || '');
    return res.sendStatus(204);
  }
  next();
});

// Apply JWT verification to all /api routes (auth routes are skipped by verifyToken internally)
app.use('/api', verifyToken);

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
    const hostname = parsed.hostname;
    // Allow localhost, 127.0.0.1, 0.0.0.0 and any port on localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      return true;
    }
  } catch {
    return false;
  }
  return false;
};




// Global request logging (audit trail)
app.use((req, res, next) => {
  console.log('[REQ]', {
    method: req.method,
    url: req.originalUrl,
    origin: req.headers.origin
  });
  next();
});

app.use(express.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));

// Global input sanitization to prevent XSS
app.use(sanitizeInput);

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

// Root route - serves frontend in production or status message in dev
app.get('/', (req, res) => {
  const frontendDistPath = getFrontendDistPath();
  const indexPath = path.join(frontendDistPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send('Backend Running');
  }
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

  app.post('/api/sales', validateBody(salesSchemas.sale), async (req, res) => {
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

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      db.run(
        `INSERT OR REPLACE INTO sales (
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
            db.run("ROLLBACK");
            console.error(`[BACKEND] Error creating sale #${id}:`, error.message);
            return res.status(500).json({ error: error.message });
          }
          db.run("COMMIT");
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
  });

  // --- Examination Module Endpoints ---
  // Apply checkPermission middleware to all examination routes that modify state
  // For GET routes, we might allow read-only access or apply granular permissions if needed
  const examinationRoutes = require('./routes/examination.cjs');
  app.use('/api/examination', (req, res, next) => {
      if (req.method !== 'GET' && !req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      next();
  }, auditCrudMiddleware('examination_batch'), examinationRoutes);

  // --- Profit Margin Settings Endpoints ---
  const settingsRoutes = require('./routes/settings.cjs');
  app.use('/api/settings', (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }, settingsRoutes);

  // --- System & Workspace Endpoints ---
  const systemRoutes = require('./routes/system.cjs');
  app.use('/api/system', systemRoutes);

  // Helper: ensure production tables exist
  const createProductionTables = () => new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS work_centers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        hourly_rate REAL DEFAULT 0,
        capacity_per_day INTEGER DEFAULT 8,
        status TEXT DEFAULT 'Active',
        location TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS production_resources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        work_center_id TEXT NOT NULL,
        status TEXT DEFAULT 'Active',
        resource_type TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (work_center_id) REFERENCES work_centers(id) ON DELETE CASCADE
      )`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

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
  app.get('/api/production/work-centers', async (req, res) => {
    try {
      const rows = await new Promise((resolve, reject) => {
        db.all('SELECT id, name, description, hourly_rate as hourlyRate, capacity_per_day as capacityPerDay, status FROM work_centers WHERE status = ? ORDER BY name', ['Active'], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
      res.json(rows);
    } catch (err) {
      console.error('[Production] work-centers query error:', err?.message || err);
      if (err?.message?.includes?.('no such table')) {
        try { await createProductionTables(); } catch { /* ignore */ }
        return res.json([]);
      }
      res.status(500).json({ error: err?.message || 'Unknown database error' });
    }
  });

  // Production: fetch real resources from database
  app.get('/api/production/resources', async (req, res) => {
    try {
      const rows = await new Promise((resolve, reject) => {
        db.all('SELECT id, name, work_center_id as workCenterId, status FROM production_resources WHERE status = ? ORDER BY name', ['Active'], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
      res.json(rows);
    } catch (err) {
      console.error('[Production] resources query error:', err?.message || err);
      if (err?.message?.includes?.('no such table')) {
        try { await createProductionTables(); } catch { /* ignore */ }
        return res.json([]);
      }
      res.status(500).json({ error: err?.message || 'Unknown database error' });
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

  // Middleware for simple "permission" check (uses JWT from verifyToken)
  const ADMIN_ACTIONS = new Set(['admin_access', 'admin_settings', 'admin_users', 'delete_document', 'approve_exchange']);
  const checkPermission = (action) => (req, res, next) => {
    if (!req.user) {
       return res.status(401).json({ error: 'Unauthorized' });
    }

    if (ADMIN_ACTIONS.has(action) && String(req.user.role || '').toLowerCase() !== 'admin') {
       return sendError(res, 403, 'Forbidden: Admin access required', 'ACCESS_DENIED');
    }

    req.userId = req.user.id;
    req.userRole = req.user.role;
    next();
  };

  /**
   * Create/Edit Documents
   */
  app.post('/api/documents/register', checkPermission('create_document'), validateBody(documentSchemas.register), auditCrudMiddleware('document'), async (req, res) => {
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

  app.post('/api/documents', checkPermission('create_document'), validateBody(documentSchemas.create), auditCrudMiddleware('document'), async (req, res) => {
    try {
      const { type, payload } = req.body;
      const result = await documentService.createDocument(type, payload, req.userId);
      await documentService.logAudit(req.userId, 'CREATE', 'document', result.id, { type });
      res.status(201).json(result);
    } catch (err) {
      sendError(res, 500, err.message, 'CREATE_FAILED');
    }
  });

  app.put('/api/documents/:id', checkPermission('edit_document'), validateBody(documentSchemas.update), async (req, res) => {
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
  app.post('/api/documents/:id/finalize', checkPermission('finalize_document'), validateBody(documentSchemas.finalize), async (req, res) => {
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
  app.post('/api/documents/batch/finalize', checkPermission('batch_finalize'), validateBody(documentSchemas.batchFinalize), async (req, res) => {
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

  app.post('/api/documents/batch/export', checkPermission('batch_export'), validateBody(documentSchemas.batchExport), async (req, res) => {
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

  app.post('/api/sales-exchanges', checkPermission('create_exchange'), validateBody(exchangeSchemas.create), async (req, res) => {
    try {
      const { 
        invoice_id, customer_id, customer_name, reason, remarks, items 
      } = req.body;

      if (!invoice_id || !reason || !items || !items.length) {
        return sendError(res, 400, 'Invoice ID, reason, and items are required', 'MISSING_FIELDS');
      }

      const exchange_number = `SE-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`;

      const exchangeId = await new Promise((resolve, reject) => {
        db.serialize(() => {
          db.run("BEGIN TRANSACTION");

          db.run(
            `INSERT INTO sales_exchanges (exchange_number, invoice_id, customer_id, customer_name, reason, remarks, created_by) 
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [exchange_number, invoice_id, customer_id, customer_name, reason, remarks, req.userId],
            function(err) {
              if (err) {
                db.run("ROLLBACK");
                return reject(err);
              }
              const newId = this.lastID;
              const itemStmt = db.prepare(
                `INSERT INTO sales_exchange_items (exchange_id, product_id, product_name, qty_returned, qty_replaced, price_difference, item_condition) 
                  VALUES (?, ?, ?, ?, ?, ?, ?)`
              );

              let itemError = null;
              for (const item of items) {
                itemStmt.run([
                  newId, item.product_id, item.product_name, item.qty_returned, 
                  item.qty_replaced, item.price_difference || 0, item.condition
                ], (err) => {
                  if (err) itemError = err;
                });
              }

              itemStmt.finalize((err) => {
                if (err || itemError) {
                  db.run("ROLLBACK");
                  return reject(err || itemError);
                }
                db.run("COMMIT");
                resolve(newId);
              });
            }
          );
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

      // Auto-generate reprint job
      const exchangeRow = await new Promise((resolve, reject) => {
        db.get("SELECT * FROM sales_exchanges WHERE id = ?", [exchangeId], (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });

      if (exchangeRow) {
        await new Promise((resolve, reject) => {
          db.run(
            "INSERT INTO reprint_jobs (exchange_id, job_description) VALUES (?, ?)",
            [exchangeId, `Reprint for Exchange ${exchangeRow.exchange_number}: ${exchangeRow.reason}`],
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

  app.post('/api/sales-orders', checkPermission('create_sales_order'), validateBody(orderSchemas.create), async (req, res) => {
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

  app.put('/api/sales-orders/:id', checkPermission('edit_sales_order'), validateBody(orderSchemas.update), (req, res) => {
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

  app.post('/api/classes', validateBody(classSchemas.create), (req, res) => {
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

  app.post('/api/subjects', validateBody(subjectSchemas.create), (req, res) => {
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

// [REMOVED] Dead routes 2.1-9: calculate-variant-price, examinations, calculate,
// confirm-batch, complete-subject, generate-invoice, invoices, invoices/:id/pay
// These were marked SUSPECTED DEAD and replaced by routes/examination.cjs

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
  app.post('/api/inventory/transactions', checkPermission('create_transaction'), validateBody(inventorySchemas.stockAdjustment), async (req, res) => {
    try {
      const { itemId, warehouseId, quantity, batchId, reason, reference, referenceId, performedBy, type } = req.body;

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

      const newQuantity = Math.max(0, currentQuantity + (isDeduction ? -Math.abs(quantity) : Math.abs(quantity)));
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

  // --- File serving API endpoints (browser platform support) ---
  const { storageDir, tempDir } = require('./runtimePaths.cjs');

  const ALLOWED_FILE_DIRS = [
    path.resolve(storageDir || './storage'),
    path.resolve(tempDir || './temp'),
  ];

  const isPathAllowed = (requestedPath) => {
    if (!requestedPath || typeof requestedPath !== 'string') return false;
    const resolved = path.resolve(requestedPath);
    return ALLOWED_FILE_DIRS.some(allowed => resolved.startsWith(allowed));
  };

  app.get('/api/read-file', (req, res) => {
    const filePath = req.query.path;
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing path parameter' });
    }
    if (!isPathAllowed(filePath)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    try {
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }
      const data = fs.readFileSync(filePath);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.send(data);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/write-temp-pdf', (req, res) => {
    try {
      const { data, filename } = req.body;
      if (!data || !Array.isArray(data)) {
        return res.status(400).json({ success: false, error: 'Invalid data' });
      }
      const safeName = String(filename || `gen_${Date.now()}.pdf`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const tempDirPath = tempDir;
      if (!fs.existsSync(tempDirPath)) {
        fs.mkdirSync(tempDirPath, { recursive: true });
      }
      const filePath = path.join(tempDirPath, safeName);
      const buffer = Buffer.from(data);
      fs.writeFileSync(filePath, buffer);
      res.json({ success: true, path: filePath, size: buffer.length });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/serve-file', (req, res) => {
    const filePath = req.query.path;
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing path parameter' });
    }
    if (!isPathAllowed(filePath)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    try {
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }
      const ext = path.extname(filePath).toLowerCase();
      const mimeMap = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.html': 'text/html',
        '.json': 'application/json',
      };
      const contentType = mimeMap[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'private, max-age=300');
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Static file serving for production frontend ---
  const frontendDistPath = getFrontendDistPath();
  if (fs.existsSync(frontendDistPath)) {
    console.log(`[BACKEND] Serving static frontend from: ${frontendDistPath}`);
    app.use(express.static(frontendDistPath, {
      maxAge: '1d',
      etag: true,
      lastModified: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
        if (filePath.endsWith('.js')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        }
      }
    }));

    // SPA fallback: serve index.html for all non-API routes
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/') || req.path === '/health' || req.path === '/api') {
        return next();
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return next();
      }
      if (path.extname(req.path)) {
        return res.status(404).type('text/plain').send('Not found');
      }
      const acceptsHtml = String(req.headers.accept || '').includes('text/html');
      if (!acceptsHtml) {
        return next();
      }
      const indexPath = path.join(frontendDistPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        next();
      }
    });
  } else {
    console.log('[BACKEND] No frontend dist found at:', frontendDistPath);
    console.log('[BACKEND] Run "npm run build" to build the frontend for production.');
  }

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
  res.status(500).json({ error: 'Internal Server Error', message: 'An unexpected error occurred. Please try again later.' });
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
