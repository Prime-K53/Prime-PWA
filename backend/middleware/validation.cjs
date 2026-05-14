/**
 * Input Validation Middleware for Prime ERP API
 * Uses Zod for schema validation
 */

const { z } = require('zod');

/**
 * Create a validation middleware for a Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {string} source - Request property to validate ('body', 'query', 'params')
 * @returns {Function} Express middleware function
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      const data = req[source];
      const validated = schema.parse(data);
      req[source] = validated;
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors = err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code
        }));
        
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Invalid input data',
          details: errors
        });
      }
      next(err);
    }
  };
};

/**
 * Validate request body
 */
const validateBody = (schema) => validate(schema, 'body');

/**
 * Validate query parameters
 */
const validateQuery = (schema) => validate(schema, 'query');

/**
 * Validate route parameters
 */
const validateParams = (schema) => validate(schema, 'params');

// Common validation schemas
const commonSchemas = {
  id: z.string().min(1, 'ID is required'),
  pagination: z.object({
    page: z.number().int().positive().default(1),
    limit: z.number().int().min(1).max(100).default(25)
  }),
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional()
  }),
  search: z.object({
    query: z.string().optional(),
    filters: z.record(z.any()).optional()
  })
};

// Financial validation schemas
const financialSchemas = {
  amount: z.number().finite().min(0, 'Amount must be non-negative'),
  currency: z.string().length(3, 'Currency must be 3-letter ISO code'),
  accountCode: z.string().regex(/^\d{4}$/, 'Account code must be 4 digits'),
  journalEntry: z.object({
    date: z.string().datetime(),
    description: z.string().min(1).max(500),
    reference: z.string().optional(),
    lines: z.array(z.object({
      accountId: z.string(),
      debit: z.number().min(0).default(0),
      credit: z.number().min(0).default(0)
    })).min(2, 'Journal entry must have at least 2 lines')
  })
};

// User validation schemas
const userSchemas = {
  login: z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    password: z.string().min(6, 'Password must be at least 6 characters')
  }),
  createUser: z.object({
    username: z.string().min(3).max(50),
    email: z.string().email().optional(),
    password: z.string().min(6),
    role: z.enum(['Admin', 'Accountant', 'Clerk', 'Viewer']),
    permissions: z.array(z.string()).optional()
  })
};

// Inventory validation schemas
const inventorySchemas = {
  item: z.object({
    name: z.string().min(1).max(200),
    sku: z.string().min(1).max(50),
    category: z.string(),
    type: z.enum(['Material', 'Product']),
    unit: z.string(),
    cost: z.number().min(0).optional(),
    price: z.number().min(0).optional(),
    stock: z.number().int().min(0).optional(),
    minStockLevel: z.number().int().min(0).optional()
  }),
  stockAdjustment: z.object({
    itemId: z.string(),
    quantityChange: z.number().int(),
    reason: z.string().min(1),
    warehouseId: z.string().optional()
  })
};

// Sales validation schemas
const salesSchemas = {
  sale: z.object({
    customerId: z.string().optional(),
    items: z.array(z.object({
      itemId: z.string(),
      quantity: z.number().positive(),
      unitPrice: z.number().min(0)
    })).min(1, 'Sale must have at least one item'),
    paymentMethod: z.enum(['Cash', 'Card', 'Mobile', 'Invoice']),
    warehouseId: z.string()
  }),
  invoice: z.object({
    customerId: z.string(),
    items: z.array(z.object({
      description: z.string(),
      quantity: z.number().positive(),
      unitPrice: z.number().min(0)
    })).min(1),
    dueDate: z.string().datetime(),
    notes: z.string().optional()
  })
};

// Production validation schemas
const productionSchemas = {
  workOrder: z.object({
    itemId: z.string(),
    quantity: z.number().positive(),
    priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).default('Medium'),
    dueDate: z.string().datetime().optional(),
    notes: z.string().optional()
  }),
  bom: z.object({
    itemId: z.string(),
    components: z.array(z.object({
      materialId: z.string(),
      quantity: z.number().positive(),
      unit: z.string()
    })).min(1)
  })
};

/**
 * Sanitize input to prevent XSS attacks
 */
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      // Remove potentially dangerous HTML/script tags
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '');
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const key of Object.keys(obj)) {
        sanitized[key] = sanitize(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }
  if (req.query) {
    req.query = sanitize(req.query);
  }
  next();
};

module.exports = {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  sanitizeInput,
  commonSchemas,
  financialSchemas,
  userSchemas,
  inventorySchemas,
  salesSchemas,
  productionSchemas
};
