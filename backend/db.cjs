const sqlite3 = require('sqlite3').verbose();
const { getDbPath, ensureRuntimeDirs } = require('./runtimePaths.cjs');

ensureRuntimeDirs();

// Singleton pattern: prevent multiple DB instances
let dbInstance = null;
let instanceId = 0;

/**
 * Get or create the singleton database instance.
 * This ensures only a single DB connection exists in the application.
 * @returns {sqlite3.Database} The singleton database instance
 */
function getDatabase() {
  if (dbInstance === null) {
    instanceId++;
    if (instanceId > 1) {
      throw new Error('Multiple database connection attempts detected. Use getDatabase() to access the singleton instance.');
    }
    const dbPath = getDbPath();
    console.log(`[Database] Opening database at: ${dbPath}`);
    dbInstance = new sqlite3.Database(dbPath);
    
    // Enable WAL mode for concurrent read/write performance
    // WAL allows concurrent reads while writes are in progress
    dbInstance.run('PRAGMA journal_mode=WAL');
    
    // NORMAL synchronous provides good durability with better performance
    // than FULL, while still being safer than OFF
    dbInstance.run('PRAGMA synchronous=NORMAL');
    
    // Enable foreign key constraints for data integrity
    dbInstance.run('PRAGMA foreign_keys=ON');
    
    // Give SQLite up to 10 seconds to retry if it hits a lock before giving up
    dbInstance.run('PRAGMA busy_timeout=10000');
  }
  return dbInstance;
}

// Export the singleton instance directly
let db = getDatabase();

const initDb = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Tasks Table
      db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Customers Table
      db.run(`CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        city TEXT,
        balance REAL DEFAULT 0,
        walletBalance REAL DEFAULT 0,
        creditLimit REAL DEFAULT 0,
        creditHold INTEGER DEFAULT 0,
        outstandingBalance REAL DEFAULT 0,
        status TEXT DEFAULT 'Active',
        category TEXT DEFAULT 'School',
        segment TEXT DEFAULT 'B2B'
      )`);

      // Schools Table
      db.run(`CREATE TABLE IF NOT EXISTS schools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        pricing_type TEXT CHECK(pricing_type IN ('margin-based', 'per-sheet')) NOT NULL,
        pricing_value REAL NOT NULL
      )`);

      // Inventory Table
      db.run(`CREATE TABLE IF NOT EXISTS inventory (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        material TEXT,
        type TEXT CHECK(type IN ('stationery', 'material', 'product', 'service')) DEFAULT 'material',
        is_stock_tracked INTEGER GENERATED ALWAYS AS (CASE WHEN type IN ('stationery', 'material') THEN 1 ELSE 0 END) VIRTUAL,
        quantity INTEGER NOT NULL DEFAULT 0,
        cost_per_unit REAL NOT NULL,
        conversion_rate REAL DEFAULT 500,
        unit TEXT DEFAULT 'units',
        category_id TEXT,
        min_stock_level INTEGER DEFAULT 0,
        max_stock_level INTEGER DEFAULT 0,
        reorder_point INTEGER DEFAULT 0,
        warehouse_id TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_synced_at DATETIME,
        sync_checksum TEXT
      )`);

      // Examinations Table
      db.run(`CREATE TABLE IF NOT EXISTS examinations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT,
        school_id INTEGER,
        customer_id TEXT,
        school_name TEXT,
        sub_account_name TEXT,
        class TEXT,
        subject TEXT,
        pages INTEGER,
        candidates INTEGER,
        waste_percent REAL,
        extra_copies INTEGER,
        charge_per_learner REAL,
        sheets_per_copy INTEGER,
        production_copies INTEGER,
        base_sheets INTEGER,
        waste_sheets REAL,
        actual_waste_sheets REAL,
        total_sheets_used REAL,
        billable_sheets INTEGER,
        internal_cost REAL,
        selling_price REAL,
        status TEXT DEFAULT 'pending', 
        invoice_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_recurring INTEGER DEFAULT 0,
        academic_year TEXT,
        term TEXT,
        exam_type TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id),
        FOREIGN KEY (invoice_id) REFERENCES invoices(id)
      )`);

      // Invoices Table
      db.run(`CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        school_id INTEGER,
        customer_id TEXT,
        customer_name TEXT,
        sub_account_name TEXT,
        subtotal REAL DEFAULT 0,
        total_amount REAL,
        currency TEXT DEFAULT 'MWK',
        status TEXT DEFAULT 'unpaid',
        payment_method TEXT,
        paid_at DATETIME,
        due_date DATETIME,
        invoice_number TEXT,
        origin_module TEXT,
        origin_batch_id TEXT,
        idempotency_key TEXT,
        line_items_json TEXT,
        notes TEXT,
        document_title TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (school_id) REFERENCES schools(id)
      )`, (err) => {
        if (!err) {
          // Check if currency column exists (for existing tables)
          db.all("PRAGMA table_info(invoices)", (err, rows) => {
            if (!err && rows) {
              const existingColumns = new Set(rows.map(r => r.name));

              const columnsToAdd = [
                { name: 'currency', type: "TEXT DEFAULT 'MWK'" },
                { name: 'customer_name', type: 'TEXT' },
                { name: 'due_date', type: 'DATETIME' },
                { name: 'invoice_number', type: 'TEXT' },
                { name: 'origin_module', type: 'TEXT' },
                { name: 'origin_batch_id', type: 'TEXT' },
                { name: 'rounding_difference', type: 'REAL DEFAULT 0' },
                { name: 'rounding_method', type: 'TEXT' },
                { name: 'adjustment_total', type: 'REAL DEFAULT 0' },
                { name: 'adjustment_snapshots_json', type: 'TEXT' },
                { name: 'idempotency_key', type: 'TEXT' },
                { name: 'line_items_json', type: 'TEXT' },
                { name: 'notes', type: 'TEXT' },
                { name: 'document_title', type: 'TEXT' },
                { name: 'updated_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' }
              ];

              columnsToAdd.forEach(col => {
                if (!existingColumns.has(col.name)) {
                  db.run(`ALTER TABLE invoices ADD COLUMN ${col.name} ${col.type}`, (err) => {
                    if (err) console.error(`Error adding ${col.name} column to invoices:`, err);
                    else console.log(`Added ${col.name} column to invoices table`);
                  });
                }
              });
            }
          });
        }
      });

      db.run(`CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        date DATETIME NOT NULL,
        customer_id TEXT,
        customer_name TEXT,
        sub_account_name TEXT,
        total_amount REAL DEFAULT 0,
        material_total REAL DEFAULT 0,
        adjustment_total REAL DEFAULT 0,
        profit_margin_total REAL DEFAULT 0,
        rounding_total REAL DEFAULT 0,
        adjustment_snapshots_json TEXT,
        status TEXT DEFAULT 'Paid',
        payment_method TEXT,
        source TEXT,
        items_json TEXT,
        payments_json TEXT,
        last_synced_at DATETIME,
        sync_checksum TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (!err) {
          db.all("PRAGMA table_info(sales)", (err, rows) => {
            if (!err && rows) {
              const existingColumns = new Set(rows.map(r => r.name));
              const columnsToAdd = [
                { name: 'sub_account_name', type: 'TEXT' },
                { name: 'material_total', type: 'REAL DEFAULT 0' },
                { name: 'adjustment_total', type: 'REAL DEFAULT 0' },
                { name: 'profit_margin_total', type: 'REAL DEFAULT 0' },
                { name: 'rounding_total', type: 'REAL DEFAULT 0' },
                { name: 'adjustment_snapshots_json', type: 'TEXT' }
              ];

              columnsToAdd.forEach(col => {
                if (!existingColumns.has(col.name)) {
                  db.run(`ALTER TABLE sales ADD COLUMN ${col.name} ${col.type}`, (err) => {
                    if (err) console.error(`Error adding ${col.name} column to sales:`, err);
                    else console.log(`Added ${col.name} column to sales table`);
                  });
                }
              });
            }
          });
        }
      });


      // Classes Table
      db.run(`CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      )`);

      // Audit Logs Table (Compliance-Grade Immutable Trail)
      db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp DATETIME NOT NULL,
        correlation_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_role TEXT NOT NULL,
        session_id TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        details TEXT,
        old_value TEXT,
        new_value TEXT,
        delta TEXT,
        integrity_hash TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        http_method TEXT,
        http_path TEXT,
        reason TEXT,
        approval_chain TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Inventory Transactions Table (for full audit trail)
      db.run(`CREATE TABLE IF NOT EXISTS inventory_transactions (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        warehouse_id TEXT,
        batch_id TEXT,
        type TEXT NOT NULL CHECK(type IN ('IN', 'OUT', 'ADJUSTMENT')),
        quantity INTEGER NOT NULL,
        previous_quantity INTEGER NOT NULL,
        new_quantity INTEGER NOT NULL,
        unit_cost REAL,
        total_cost REAL,
        reference TEXT,
        reference_id TEXT,
        reason TEXT NOT NULL,
        performed_by TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Material Batches Table (for batch/lot tracking)
      db.run(`CREATE TABLE IF NOT EXISTS material_batches (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        batch_number TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        remaining_quantity INTEGER NOT NULL,
        cost_per_unit REAL,
        received_date DATETIME,
        expiry_date DATETIME,
        supplier_id TEXT,
        supplier_name TEXT,
        warehouse_id TEXT,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'depleted', 'expired')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Warehouse Inventory Table (for multi-warehouse support)
      db.run(`CREATE TABLE IF NOT EXISTS warehouse_inventory (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        warehouse_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        reserved INTEGER NOT NULL DEFAULT 0,
        available INTEGER NOT NULL DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(item_id, warehouse_id)
      )`);

      // Material Categories Table
      db.run(`CREATE TABLE IF NOT EXISTS material_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        parent_category_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Document Registry (The Core of the New Document Engine)
      db.run(`CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        logical_number TEXT UNIQUE, -- e.g., INV-0001
        type TEXT NOT NULL, -- e.g., 'invoice', 'purchase_order'
        status TEXT NOT NULL DEFAULT 'draft', -- draft, finalized, voided
        payload TEXT NOT NULL, -- The InvoicePayload JSON
        render_model TEXT, -- The generated RenderModel (only when finalized)
        fingerprint TEXT, -- Consistency Lock fingerprint
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        finalized_at DATETIME,
        created_by TEXT,
        metadata TEXT -- Flexible metadata storage
      )`);

      // Subjects Table
      db.run(`CREATE TABLE IF NOT EXISTS subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        code TEXT UNIQUE
      )`);

      // Sales Exchanges Table
      db.run(`CREATE TABLE IF NOT EXISTS sales_exchanges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange_number TEXT UNIQUE,
        invoice_id TEXT, -- Logical ID like INV-0001 or DB ID
        customer_id TEXT,
        customer_name TEXT,
        exchange_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        reason TEXT NOT NULL,
        remarks TEXT,
        status TEXT DEFAULT 'pending', -- pending, approved, rejected, completed
        created_by TEXT,
        total_price_difference REAL DEFAULT 0,
        FOREIGN KEY (invoice_id) REFERENCES documents(logical_number)
      )`);

      // Sales Exchange Items Table
      db.run(`CREATE TABLE IF NOT EXISTS sales_exchange_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange_id INTEGER,
        product_id TEXT,
        product_name TEXT,
        qty_returned INTEGER DEFAULT 0,
        qty_replaced INTEGER DEFAULT 0,
        price_difference REAL DEFAULT 0,
        condition TEXT,
        FOREIGN KEY (exchange_id) REFERENCES sales_exchanges(id)
      )`);

      // Reprint Jobs Table
      db.run(`CREATE TABLE IF NOT EXISTS reprint_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange_id INTEGER,
        job_description TEXT,
        paper_used REAL DEFAULT 0,
        ink_used REAL DEFAULT 0,
        finishing_cost REAL DEFAULT 0,
        total_reprint_cost REAL DEFAULT 0,
        status TEXT DEFAULT 'pending', -- pending, in_progress, completed
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (exchange_id) REFERENCES sales_exchanges(id)
      )`);

      // Sales Exchange Approvals Table
      db.run(`CREATE TABLE IF NOT EXISTS sales_exchange_approvals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange_id INTEGER,
        approved_by TEXT,
        approval_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        comments TEXT,
        status TEXT, -- approved, rejected
        FOREIGN KEY (exchange_id) REFERENCES sales_exchanges(id)
      )`);

      // Market Adjustments Table
      // Stores adjustment rules (profit margin, transport, wastage, etc.)
      db.run(`CREATE TABLE IF NOT EXISTS market_adjustments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT CHECK(type IN ('PERCENTAGE', 'FIXED', 'PERCENT')) NOT NULL,
        value REAL NOT NULL DEFAULT 0,
        percentage REAL,
        applies_to TEXT NOT NULL DEFAULT 'COST',
        active INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        description TEXT,
        category TEXT,
        display_name TEXT,
        adjustment_category TEXT CHECK(adjustment_category IN ('Profit Margin', 'Transport/Logistics', 'Wastage Factor', 'Overhead', 'Custom')),
        sort_order INTEGER DEFAULT 0,
        is_system_default INTEGER DEFAULT 0,
        apply_to_categories TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_applied_at DATETIME,
        total_applied_amount REAL DEFAULT 0,
        application_count INTEGER DEFAULT 0,
        last_synced_at DATETIME,
        sync_checksum TEXT
      )`);

      // Seed the synthetic auto-rounding adjustment so that rounding
      // entries in market_adjustment_transactions satisfy the FK constraint.
      db.run(`INSERT OR IGNORE INTO market_adjustments (id, name, type, value, applies_to, is_system_default, is_active, active, adjustment_category, sort_order)
              VALUES ('auto-rounding', 'Rounding Adjustment', 'FIXED', 0, 'COST', 1, 0, 0, 'Custom', 9999)`);

      db.run(`CREATE TABLE IF NOT EXISTS examination_batch_notifications (
        id TEXT PRIMARY KEY,
        batch_id TEXT,
        user_id TEXT NOT NULL,
        notification_type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        priority TEXT DEFAULT 'Medium',
        batch_details_json TEXT,
        is_read INTEGER DEFAULT 0,
        read_at DATETIME,
        delivered_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS notification_audit_logs (
        id TEXT PRIMARY KEY,
        notification_id TEXT,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details_json TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // -----------------------------------------------------------------------
      // Examination Module - Normalized Schema (New Implementation)
      // -----------------------------------------------------------------------

      // 1. Examination Batches (Top level container for a school's exam order)
      db.run(`CREATE TABLE IF NOT EXISTS examination_batches (
        id TEXT PRIMARY KEY,
        batch_number TEXT UNIQUE,
        school_id TEXT NOT NULL,
        name TEXT NOT NULL, -- e.g. "Term 1 2026"
        academic_year TEXT,
        term TEXT,
        exam_type TEXT,
        status TEXT DEFAULT 'Draft', -- Draft, Calculated, Approved, Invoiced
        total_amount REAL DEFAULT 0,
        calculated_material_total REAL DEFAULT 0,
        calculated_adjustment_total REAL DEFAULT 0,
        adjustment_snapshots_json TEXT,
        rounding_adjustment_total REAL DEFAULT 0,
        pre_rounding_total_amount REAL DEFAULT 0,
        rounding_method TEXT DEFAULT 'nearest_50',
        rounding_value REAL DEFAULT 50,
        expected_candidature INTEGER DEFAULT 0,
        calculated_cost_per_learner REAL DEFAULT 0,
        calculation_trigger TEXT,
        calculation_duration_ms INTEGER DEFAULT 0,
        last_calculated_at DATETIME,
        currency TEXT DEFAULT 'MWK',
        invoice_id TEXT,
        pricing_lock_enabled INTEGER DEFAULT 0,
        pricing_lock_reason TEXT,
        pricing_lock_by TEXT,
        pricing_locked_at DATETIME,
        locked_paper_unit_cost REAL,
        locked_toner_unit_cost REAL,
        locked_conversion_rate REAL,
        locked_adjustments_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES documents(logical_number)
      )`);

      // 2. Examination Classes (Groups learners and pricing per class)
      db.run(`CREATE TABLE IF NOT EXISTS examination_classes (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        class_name TEXT NOT NULL,
        number_of_learners INTEGER NOT NULL,
        suggested_cost_per_learner REAL DEFAULT 0,
        manual_cost_per_learner REAL,
        is_manual_override INTEGER DEFAULT 0,
        manual_override_reason TEXT,
        manual_override_by TEXT,
        manual_override_at DATETIME,
        calculated_total_cost REAL DEFAULT 0,
        material_total_cost REAL DEFAULT 0,
        adjustment_total_cost REAL DEFAULT 0,
        adjustment_delta_percent REAL DEFAULT 0,
        cost_last_calculated_at DATETIME,
        price_per_learner REAL DEFAULT 0,
        total_price REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (batch_id) REFERENCES examination_batches(id) ON DELETE CASCADE
      )`);

      // Ensure no duplicate class names exist within the same batch
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_class_per_batch ON examination_classes(batch_id, class_name)`);

      // 3. Examination Subjects (The actual patch/paper details)
      db.run(`CREATE TABLE IF NOT EXISTS examination_subjects (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL,
        subject_name TEXT NOT NULL,
        pages INTEGER NOT NULL,
        extra_copies INTEGER DEFAULT 0,
        paper_size TEXT DEFAULT 'A4',
        orientation TEXT DEFAULT 'Portrait',
        total_sheets INTEGER DEFAULT 0, -- Calculated field
        total_pages INTEGER DEFAULT 0, -- Calculated field
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_id) REFERENCES examination_classes(id) ON DELETE CASCADE
      )`);

      // 3b. Examination Global Hidden BOM Defaults
      db.run(`CREATE TABLE IF NOT EXISTS bom_default_materials (
        material_type TEXT PRIMARY KEY,
        preferred_item_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (preferred_item_id) REFERENCES inventory(id)
      )`);

      // 4. Examination BOM Calculations (Stores cost breakdown)
      db.run(`CREATE TABLE IF NOT EXISTS examination_bom_calculations (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        class_id TEXT, -- Optional, if specific to a class
        item_id TEXT NOT NULL, -- Inventory Item ID (Paper, Toner)
        item_name TEXT,
        component_type TEXT DEFAULT 'MATERIAL',
        adjustment_id TEXT,
        adjustment_name TEXT,
        adjustment_type TEXT,
        adjustment_value REAL DEFAULT 0,
        allocation_ratio REAL DEFAULT 0,
        quantity_required REAL NOT NULL,
        unit_cost REAL NOT NULL,
        total_cost REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (batch_id) REFERENCES examination_batches(id) ON DELETE CASCADE
      )`);

      // 5. Examination Class Adjustment Allocations
      // Stores original and redistributed adjustment amounts per class.
      db.run(`CREATE TABLE IF NOT EXISTS examination_class_adjustments (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        class_id TEXT NOT NULL,
        adjustment_id TEXT NOT NULL,
        adjustment_name TEXT NOT NULL,
        adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('PERCENTAGE', 'FIXED', 'PERCENT')),
        adjustment_value REAL DEFAULT 0,
        base_amount REAL DEFAULT 0,
        original_amount REAL DEFAULT 0,
        redistributed_amount REAL DEFAULT 0,
        allocation_ratio REAL DEFAULT 0,
        sequence_no INTEGER DEFAULT 0,
        source TEXT DEFAULT 'SYSTEM' CHECK(source IN ('SYSTEM', 'MANUAL_OVERRIDE')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (batch_id) REFERENCES examination_batches(id) ON DELETE CASCADE,
        FOREIGN KEY (class_id) REFERENCES examination_classes(id) ON DELETE CASCADE
      )`);

      // 6. Examination Pricing Audit
      // Full history of automatic/manual pricing changes.
      db.run(`CREATE TABLE IF NOT EXISTS examination_pricing_audit (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        class_id TEXT,
        user_id TEXT,
        event_type TEXT NOT NULL CHECK(event_type IN ('SYSTEM_CALCULATION', 'MANUAL_OVERRIDE', 'MANUAL_OVERRIDE_RESET', 'AUTO_RECALC', 'VALIDATION_WARNING', 'PERMISSION_DENIED')),
        trigger_source TEXT,
        previous_cost_per_learner REAL,
        suggested_cost_per_learner REAL,
        new_cost_per_learner REAL,
        candidature INTEGER DEFAULT 0,
        previous_total_amount REAL,
        new_total_amount REAL,
        percentage_difference REAL DEFAULT 0,
        details_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (batch_id) REFERENCES examination_batches(id) ON DELETE CASCADE,
        FOREIGN KEY (class_id) REFERENCES examination_classes(id) ON DELETE CASCADE
      )`);

      // Market Adjustment Transactions Table
      // Individual adjustment records for each sale item
      db.run(`CREATE TABLE IF NOT EXISTS market_adjustment_transactions (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        variant_id TEXT,
        adjustment_id TEXT NOT NULL,
        adjustment_name TEXT NOT NULL,
        adjustment_type TEXT CHECK(adjustment_type IN ('PERCENTAGE', 'FIXED', 'PERCENT')) NOT NULL,
        adjustment_value REAL NOT NULL,
        base_amount REAL NOT NULL,
        calculated_amount REAL NOT NULL,
        quantity INTEGER NOT NULL,
        unit_amount REAL NOT NULL,
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Reversed', 'Modified')),
        reversed_by TEXT,
        notes TEXT,
        FOREIGN KEY (adjustment_id) REFERENCES market_adjustments(id)
      )`);

      // Transaction Adjustment Snapshots Table
      // Detailed snapshots for audit trail
      db.run(`CREATE TABLE IF NOT EXISTS transaction_adjustment_snapshots (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_name TEXT,
        variant_id TEXT,
        quantity INTEGER NOT NULL,
        base_cost REAL NOT NULL,
        unit_adjustment_amount REAL NOT NULL,
        total_adjustment_amount REAL NOT NULL,
        adjustment_id TEXT,
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        name TEXT NOT NULL,
        type TEXT CHECK(type IN ('PERCENTAGE', 'FIXED', 'PERCENT')) NOT NULL,
        value REAL NOT NULL,
        calculated_amount REAL NOT NULL,
        category TEXT,
        is_active INTEGER NOT NULL DEFAULT 1
      )`);

      // Create indices for market adjustment tables
      db.run(`CREATE INDEX IF NOT EXISTS idx_mat_sale_id ON market_adjustment_transactions(sale_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_mat_item_id ON market_adjustment_transactions(item_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_mat_adjustment_id ON market_adjustment_transactions(adjustment_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_mat_timestamp ON market_adjustment_transactions(timestamp)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_tas_sale_id ON transaction_adjustment_snapshots(sale_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_tas_item_id ON transaction_adjustment_snapshots(item_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_ma_active ON market_adjustments(active)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_ma_category ON market_adjustments(adjustment_category)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_notifications_user ON examination_batch_notifications(user_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_notifications_created ON examination_batch_notifications(created_at)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_notifications_read ON examination_batch_notifications(is_read)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_notifications_user_created ON examination_batch_notifications(user_id, created_at DESC)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_notification_audit_logs_notification ON notification_audit_logs(notification_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_notification_audit_logs_user ON notification_audit_logs(user_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_notification_audit_logs_created ON notification_audit_logs(created_at)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_class_adjustments_batch ON examination_class_adjustments(batch_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_class_adjustments_class ON examination_class_adjustments(class_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_pricing_audit_batch ON examination_pricing_audit(batch_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_pricing_audit_class ON examination_pricing_audit(class_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_pricing_audit_event ON examination_pricing_audit(event_type)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_exam_bom_calc_batch_class ON examination_bom_calculations(batch_id, class_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_bom_default_materials_preferred ON bom_default_materials(preferred_item_id)`);

      db.run(`CREATE TABLE IF NOT EXISTS email_verifications (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        purpose TEXT NOT NULL,
        verified INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        expires_at TEXT NOT NULL,
        verified_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);

      db.run(`CREATE INDEX IF NOT EXISTS idx_ev_email ON email_verifications(email)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_ev_purpose ON email_verifications(purpose)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_ev_expires ON email_verifications(expires_at)`);

      // -----------------------------------------------------------------------
      // Profit Margin Settings & Overrides
      // -----------------------------------------------------------------------
      db.run(`CREATE TABLE IF NOT EXISTS profit_margin_settings (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL CHECK(scope IN ('global', 'category', 'line_item')),
        scope_ref_id TEXT, -- category ID or line-item/product SKU
        margin_type TEXT NOT NULL CHECK(margin_type IN ('percentage', 'fixed_amount')),
        margin_value REAL NOT NULL,
        is_active INTEGER DEFAULT 1,
        apply_volume_margins INTEGER DEFAULT 0,
        reason TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS profit_margin_audit_logs (
        id TEXT PRIMARY KEY,
        setting_id TEXT,
        action TEXT NOT NULL, -- CREATE, UPDATE, DELETE, TOGGLE
        scope TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        reason TEXT,
        performed_by TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE INDEX IF NOT EXISTS idx_pms_resolution ON profit_margin_settings(scope, scope_ref_id, is_active, deleted_at)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_pm_audit_setting ON profit_margin_audit_logs(setting_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_pm_audit_timestamp ON profit_margin_audit_logs(timestamp)`);

      // Sales Orders Table (Phase 1 - Sales Module)
      db.run(`CREATE TABLE IF NOT EXISTS sales_orders (
        id TEXT PRIMARY KEY,
        quotation_id TEXT,
        customer_id TEXT,
        orderDate DATETIME NOT NULL,
        deliveryDate DATETIME,
        status TEXT DEFAULT 'Draft',
        items TEXT NOT NULL,
        subtotal REAL DEFAULT 0,
        discounts REAL DEFAULT 0,
        tax REAL DEFAULT 0,
        total REAL DEFAULT 0,
        notes TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_by TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // -----------------------------------------------------------------------
      // Update existing tables if columns are missing
      const columns = [
        { table: 'examinations', column: 'charge_per_learner', type: 'REAL DEFAULT 0' },
        { table: 'examinations', column: 'batch_id', type: 'TEXT' },
        { table: 'examinations', column: 'actual_waste_sheets', type: 'REAL' },
        { table: 'examinations', column: 'invoice_id', type: 'INTEGER' },
        { table: 'examinations', column: 'is_recurring', type: 'INTEGER DEFAULT 0' },
        { table: 'examinations', column: 'academic_year', type: 'TEXT' },
        { table: 'examinations', column: 'term', type: 'TEXT' },
        { table: 'examinations', column: 'exam_type', type: 'TEXT' },
        { table: 'examinations', column: 'sub_account_name', type: 'TEXT' },
        { table: 'examinations', column: 'customer_id', type: 'TEXT' },
        { table: 'invoices', column: 'status', type: "TEXT DEFAULT 'unpaid'" },
        { table: 'invoices', column: 'payment_method', type: 'TEXT' },
        { table: 'invoices', column: 'paid_at', type: 'DATETIME' },
        { table: 'invoices', column: 'customer_id', type: 'TEXT' },
        { table: 'invoices', column: 'sub_account_name', type: 'TEXT' },
        { table: 'inventory', column: 'conversion_rate', type: 'REAL DEFAULT 500' },
        { table: 'examination_batches', column: 'batch_number', type: 'TEXT' },
        { table: 'examination_batches', column: 'sub_account_name', type: 'TEXT' },
        { table: 'examination_batches', column: 'type', type: "TEXT DEFAULT 'Original'" },
        { table: 'examination_batches', column: 'parent_batch_id', type: 'TEXT' },
        { table: 'examination_batches', column: 'calculated_material_total', type: 'REAL DEFAULT 0' },
        { table: 'examination_batches', column: 'calculated_adjustment_total', type: 'REAL DEFAULT 0' },
        { table: 'examination_batches', column: 'adjustment_snapshots_json', type: 'TEXT' },
        { table: 'examination_batches', column: 'rounding_adjustment_total', type: 'REAL DEFAULT 0' },
        { table: 'examination_batches', column: 'pre_rounding_total_amount', type: 'REAL DEFAULT 0' },
        { table: 'examination_batches', column: 'rounding_method', type: "TEXT DEFAULT 'nearest_50'" },
        { table: 'examination_batches', column: 'rounding_value', type: 'REAL DEFAULT 50' },
        { table: 'examination_batches', column: 'expected_candidature', type: 'INTEGER DEFAULT 0' },
        { table: 'examination_batches', column: 'calculated_cost_per_learner', type: 'REAL DEFAULT 0' },
        { table: 'examination_batches', column: 'calculation_trigger', type: 'TEXT' },
        { table: 'examination_batches', column: 'calculation_duration_ms', type: 'INTEGER DEFAULT 0' },
        { table: 'examination_batches', column: 'last_calculated_at', type: 'DATETIME' },
        { table: 'examination_batches', column: 'pricing_lock_enabled', type: 'INTEGER DEFAULT 0' },
        { table: 'examination_batches', column: 'pricing_lock_reason', type: 'TEXT' },
        { table: 'examination_batches', column: 'pricing_lock_by', type: 'TEXT' },
        { table: 'examination_batches', column: 'pricing_locked_at', type: 'DATETIME' },
        { table: 'examination_batches', column: 'locked_paper_unit_cost', type: 'REAL' },
        { table: 'examination_batches', column: 'locked_toner_unit_cost', type: 'REAL' },
        { table: 'examination_batches', column: 'locked_conversion_rate', type: 'REAL' },
        { table: 'examination_batches', column: 'locked_adjustments_json', type: 'TEXT' },
        { table: 'examination_classes', column: 'suggested_cost_per_learner', type: 'REAL DEFAULT 0' },
        { table: 'examination_classes', column: 'manual_cost_per_learner', type: 'REAL' },
        { table: 'examination_classes', column: 'is_manual_override', type: 'INTEGER DEFAULT 0' },
        { table: 'examination_classes', column: 'manual_override_reason', type: 'TEXT' },
        { table: 'examination_classes', column: 'manual_override_by', type: 'TEXT' },
        { table: 'examination_classes', column: 'manual_override_at', type: 'DATETIME' },
        { table: 'examination_classes', column: 'calculated_total_cost', type: 'REAL DEFAULT 0' },
        { table: 'examination_classes', column: 'material_total_cost', type: 'REAL DEFAULT 0' },
        { table: 'examination_classes', column: 'adjustment_total_cost', type: 'REAL DEFAULT 0' },
        { table: 'examination_classes', column: 'adjustment_delta_percent', type: 'REAL DEFAULT 0' },
        { table: 'examination_classes', column: 'cost_last_calculated_at', type: 'DATETIME' },
        // Three Critical Financial Metrics (Examination Pricing Redesign)
        { table: 'examination_classes', column: 'expected_fee_per_learner', type: 'REAL DEFAULT 0' },
        { table: 'examination_classes', column: 'final_fee_per_learner', type: 'REAL DEFAULT 0' },
        { table: 'examination_classes', column: 'live_total_preview', type: 'REAL DEFAULT 0' },
        // Audit trail for financial metrics
        { table: 'examination_classes', column: 'financial_metrics_updated_at', type: 'DATETIME' },
        { table: 'examination_classes', column: 'financial_metrics_updated_by', type: 'TEXT' },
        { table: 'examination_classes', column: 'financial_metrics_source', type: 'TEXT' },
        { table: 'examination_subjects', column: 'total_pages', type: 'INTEGER DEFAULT 0' },
        { table: 'examination_bom_calculations', column: 'component_type', type: "TEXT DEFAULT 'MATERIAL'" },
        { table: 'examination_bom_calculations', column: 'adjustment_id', type: 'TEXT' },
        { table: 'examination_bom_calculations', column: 'adjustment_name', type: 'TEXT' },
        { table: 'examination_bom_calculations', column: 'adjustment_type', type: 'TEXT' },
        { table: 'examination_bom_calculations', column: 'adjustment_value', type: 'REAL DEFAULT 0' },
        { table: 'examination_bom_calculations', column: 'allocation_ratio', type: 'REAL DEFAULT 0' },
        { table: 'documents', column: 'logical_number', type: 'TEXT' },
        { table: 'profit_margin_settings', column: 'apply_volume_margins', type: 'INTEGER DEFAULT 0' }
      ];

      // Production resources (work centers and resources) — must be queued
      // BEFORE migration ALTER TABLEs so they exist when initDb() resolves.
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
      )`);

      const migrationPromises = columns.map(col => {
        return new Promise((res) => {
          db.run(`ALTER TABLE ${col.table} ADD COLUMN ${col.column} ${col.type}`, (err) => {
            // Ignore error if column exists or other migration issues
            res();
          });
        });
      });

      Promise.all(migrationPromises).then(() => {
        resolve();
      });
    });
  });
};

/**
 * Re-initialize the database connection with the current dbPath.
 * This is useful after workspace initialization when the dbPath changes.
 * @returns {sqlite3.Database} The new database instance
 */
function reinitializeDatabase() {
  if (dbInstance !== null) {
    try {
      dbInstance.close();
    } catch (e) {
      console.warn('[DB] Error closing existing connection:', e.message);
    }
    dbInstance = null;
    instanceId = 0;
  }
  db = getDatabase();
  return db;
}

module.exports = {
  get db() { return getDatabase(); },
  initDb,
  getDatabase,
  reinitializeDatabase
};
