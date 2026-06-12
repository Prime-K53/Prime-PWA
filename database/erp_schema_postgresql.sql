-- PostgreSQL ERP Schema
-- Generated on 2026-02-07
-- Updated on 2026-02-15: Added market adjustment transaction tracking
-- Updated on 2026-02-22: Added product-level rounding logs and analytics indexes

-- 1. BOM Templates Table
CREATE TABLE bom_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    components_json JSONB NOT NULL DEFAULT '{}'
);

-- Seed hardcoded presets for BOM templates
INSERT INTO bom_templates (name, components_json) VALUES 
('Print Core', '{"category": "preset", "description": "Standard printing core components", "elements": []}'),
('Print Finishing', '{"category": "preset", "description": "Standard print finishing components", "elements": []}');

-- 2. Inventory Items Table
CREATE TABLE inventory_items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    unit_cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    stock_level INTEGER NOT NULL DEFAULT 0
);

-- 3. Products Table
-- Note: bom_id is a dropdown selection (foreign key) on the product level
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    bom_id INTEGER REFERENCES bom_templates(id) ON DELETE SET NULL,
    market_adjustment_multiplier NUMERIC(5, 2) NOT NULL DEFAULT 1.00
);

-- 4. Product Variants Table
-- Note: number_of_pages is strictly on the variant level
CREATE TABLE product_variants (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_name VARCHAR(255) NOT NULL,
    number_of_pages INTEGER NOT NULL CHECK (number_of_pages >= 0)
);

-- 5. Market Adjustments Table
-- Stores adjustment rules (profit margin, transport, wastage, etc.)
CREATE TABLE market_adjustments (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('PERCENTAGE', 'FIXED', 'PERCENT')),
    value NUMERIC(15, 4) NOT NULL DEFAULT 0,
    percentage NUMERIC(15, 4),
    applies_to VARCHAR(50) NOT NULL DEFAULT 'COST',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    category VARCHAR(100),
    display_name VARCHAR(255),
    adjustment_category VARCHAR(50) CHECK (adjustment_category IN ('Profit Margin', 'Transport/Logistics', 'Wastage Factor', 'Overhead', 'Custom')),
    sort_order INTEGER DEFAULT 0,
    is_system_default BOOLEAN DEFAULT FALSE,
    apply_to_categories JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_applied_at TIMESTAMP,
    total_applied_amount NUMERIC(15, 2) DEFAULT 0,
    application_count INTEGER DEFAULT 0
);

-- 6. Market Adjustment Transactions Table
-- Individual adjustment records for each sale item
CREATE TABLE market_adjustment_transactions (
    id VARCHAR(50) PRIMARY KEY,
    sale_id VARCHAR(50) NOT NULL,
    item_id VARCHAR(50) NOT NULL,
    variant_id VARCHAR(50),
    adjustment_id VARCHAR(50) NOT NULL REFERENCES market_adjustments(id) ON DELETE CASCADE,
    adjustment_name VARCHAR(255) NOT NULL,
    adjustment_type VARCHAR(20) NOT NULL CHECK (adjustment_type IN ('PERCENTAGE', 'FIXED', 'PERCENT')),
    adjustment_value NUMERIC(15, 4) NOT NULL,
    base_amount NUMERIC(15, 2) NOT NULL,
    calculated_amount NUMERIC(15, 2) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_amount NUMERIC(15, 2) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Reversed', 'Modified')),
    reversed_by VARCHAR(50),
    notes TEXT
);

-- 7. Transaction Adjustment Snapshots Table
-- Detailed snapshots for audit trail
CREATE TABLE transaction_adjustment_snapshots (
    id VARCHAR(50) PRIMARY KEY,
    sale_id VARCHAR(50) NOT NULL,
    item_id VARCHAR(50) NOT NULL,
    item_name VARCHAR(255),
    variant_id VARCHAR(50),
    quantity INTEGER NOT NULL,
    base_cost NUMERIC(15, 2) NOT NULL,
    unit_adjustment_amount NUMERIC(15, 2) NOT NULL,
    total_adjustment_amount NUMERIC(15, 2) NOT NULL,
    adjustment_id VARCHAR(50),
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('PERCENTAGE', 'FIXED', 'PERCENT')),
    value NUMERIC(15, 4) NOT NULL,
    calculated_amount NUMERIC(15, 2) NOT NULL,
    category VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 8. Rounding Logs Table
-- Product-level rounding snapshots (inventory pricing events only)
CREATE TABLE rounding_logs (
    id VARCHAR(50) PRIMARY KEY,
    product_id VARCHAR(50) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    variant_id VARCHAR(50),
    variant_name VARCHAR(255),
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    calculated_price NUMERIC(15, 4) NOT NULL,
    rounded_price NUMERIC(15, 4) NOT NULL,
    rounding_difference NUMERIC(15, 4) NOT NULL,
    rounding_method VARCHAR(30) NOT NULL CHECK (rounding_method IN (
        'NEAREST_10',
        'NEAREST_50',
        'NEAREST_100',
        'ALWAYS_UP_10',
        'ALWAYS_UP_50',
        'ALWAYS_UP_100',
        'ALWAYS_UP_CUSTOM',
        'PSYCHOLOGICAL'
    )),
    user_id VARCHAR(50),
    version INTEGER NOT NULL CHECK (version >= 1)
);

-- 9. Examination Batches
CREATE TABLE examination_batches (
    id VARCHAR(50) PRIMARY KEY,
    school_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    academic_year VARCHAR(20),
    term VARCHAR(20),
    exam_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'Draft' CHECK (status IN ('Draft', 'Calculated', 'Approved', 'Invoiced')),
    total_amount NUMERIC(15, 2) DEFAULT 0,
    calculated_material_total NUMERIC(15, 2) DEFAULT 0,
    calculated_adjustment_total NUMERIC(15, 2) DEFAULT 0,
    expected_candidature INTEGER DEFAULT 0,
    calculated_cost_per_learner NUMERIC(15, 2) DEFAULT 0,
    calculation_trigger VARCHAR(64),
    calculation_duration_ms INTEGER DEFAULT 0,
    last_calculated_at TIMESTAMP,
    currency VARCHAR(10) DEFAULT 'MWK',
    invoice_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Examination Classes
CREATE TABLE examination_classes (
    id VARCHAR(50) PRIMARY KEY,
    batch_id VARCHAR(50) NOT NULL REFERENCES examination_batches(id) ON DELETE CASCADE,
    class_name VARCHAR(120) NOT NULL,
    number_of_learners INTEGER NOT NULL CHECK (number_of_learners > 0),
    suggested_cost_per_learner NUMERIC(15, 2) DEFAULT 0,
    manual_cost_per_learner NUMERIC(15, 2),
    is_manual_override BOOLEAN DEFAULT FALSE,
    manual_override_reason TEXT,
    manual_override_by VARCHAR(50),
    manual_override_at TIMESTAMP,
    calculated_total_cost NUMERIC(15, 2) DEFAULT 0,
    material_total_cost NUMERIC(15, 2) DEFAULT 0,
    adjustment_total_cost NUMERIC(15, 2) DEFAULT 0,
    adjustment_delta_percent NUMERIC(9, 4) DEFAULT 0,
    cost_last_calculated_at TIMESTAMP,
    price_per_learner NUMERIC(15, 2) DEFAULT 0,
    total_price NUMERIC(15, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Examination Subjects
CREATE TABLE examination_subjects (
    id VARCHAR(50) PRIMARY KEY,
    class_id VARCHAR(50) NOT NULL REFERENCES examination_classes(id) ON DELETE CASCADE,
    subject_name VARCHAR(120) NOT NULL,
    pages INTEGER NOT NULL CHECK (pages > 0),
    extra_copies INTEGER DEFAULT 0 CHECK (extra_copies >= 0),
    paper_size VARCHAR(20) DEFAULT 'A4',
    orientation VARCHAR(20) DEFAULT 'Portrait',
    total_sheets INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Examination BOM Calculations
CREATE TABLE examination_bom_calculations (
    id VARCHAR(50) PRIMARY KEY,
    batch_id VARCHAR(50) NOT NULL REFERENCES examination_batches(id) ON DELETE CASCADE,
    class_id VARCHAR(50) REFERENCES examination_classes(id) ON DELETE CASCADE,
    item_id VARCHAR(50) NOT NULL,
    item_name VARCHAR(255),
    component_type VARCHAR(20) DEFAULT 'MATERIAL' CHECK (component_type IN ('MATERIAL', 'ADJUSTMENT')),
    adjustment_id VARCHAR(50),
    adjustment_name VARCHAR(255),
    adjustment_type VARCHAR(20),
    adjustment_value NUMERIC(15, 4) DEFAULT 0,
    allocation_ratio NUMERIC(12, 8) DEFAULT 0,
    quantity_required NUMERIC(15, 4) NOT NULL,
    unit_cost NUMERIC(15, 4) NOT NULL,
    total_cost NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. Examination Class Adjustments
CREATE TABLE examination_class_adjustments (
    id VARCHAR(50) PRIMARY KEY,
    batch_id VARCHAR(50) NOT NULL REFERENCES examination_batches(id) ON DELETE CASCADE,
    class_id VARCHAR(50) NOT NULL REFERENCES examination_classes(id) ON DELETE CASCADE,
    adjustment_id VARCHAR(50) NOT NULL,
    adjustment_name VARCHAR(255) NOT NULL,
    adjustment_type VARCHAR(20) NOT NULL CHECK (adjustment_type IN ('PERCENTAGE', 'FIXED', 'PERCENT')),
    adjustment_value NUMERIC(15, 4) DEFAULT 0,
    base_amount NUMERIC(15, 2) DEFAULT 0,
    original_amount NUMERIC(15, 2) DEFAULT 0,
    redistributed_amount NUMERIC(15, 2) DEFAULT 0,
    allocation_ratio NUMERIC(12, 8) DEFAULT 0,
    sequence_no INTEGER DEFAULT 0,
    source VARCHAR(20) DEFAULT 'SYSTEM' CHECK (source IN ('SYSTEM', 'MANUAL_OVERRIDE')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. Examination Pricing Audit
CREATE TABLE examination_pricing_audit (
    id VARCHAR(50) PRIMARY KEY,
    batch_id VARCHAR(50) NOT NULL REFERENCES examination_batches(id) ON DELETE CASCADE,
    class_id VARCHAR(50) REFERENCES examination_classes(id) ON DELETE CASCADE,
    user_id VARCHAR(50),
    event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('SYSTEM_CALCULATION', 'MANUAL_OVERRIDE', 'MANUAL_OVERRIDE_RESET', 'AUTO_RECALC', 'VALIDATION_WARNING', 'PERMISSION_DENIED')),
    trigger_source VARCHAR(64),
    previous_cost_per_learner NUMERIC(15, 2),
    suggested_cost_per_learner NUMERIC(15, 2),
    new_cost_per_learner NUMERIC(15, 2),
    candidature INTEGER DEFAULT 0,
    previous_total_amount NUMERIC(15, 2),
    new_total_amount NUMERIC(15, 2),
    percentage_difference NUMERIC(9, 4) DEFAULT 0,
    details_json JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. Examination Batch Notifications
-- Tracks notifications sent to users about examination batch events
CREATE TABLE examination_batch_notifications (
    id VARCHAR(50) PRIMARY KEY,
    batch_id VARCHAR(50) NOT NULL REFERENCES examination_batches(id) ON DELETE CASCADE,
    user_id VARCHAR(50) NOT NULL,
    notification_type VARCHAR(32) NOT NULL CHECK (notification_type IN ('BATCH_CALCULATED', 'BATCH_APPROVED', 'BATCH_INVOICED', 'DEADLINE_REMINDER')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
    batch_details JSONB NOT NULL DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- 16. Notification Audit Logs
-- Comprehensive audit trail for all notification-related activities
CREATE TABLE notification_audit_logs (
    id VARCHAR(50) PRIMARY KEY,
    notification_id VARCHAR(50) REFERENCES examination_batch_notifications(id) ON DELETE SET NULL,
    user_id VARCHAR(50) NOT NULL,
    action VARCHAR(32) NOT NULL CHECK (action IN ('CREATED', 'DELIVERED', 'READ', 'DISMISSED', 'EXPIRED', 'FAILED')),
    details_json JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indices for performance
CREATE INDEX idx_products_bom_id ON products(bom_id);
CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX idx_market_adjustment_transactions_sale_id ON market_adjustment_transactions(sale_id);
CREATE INDEX idx_market_adjustment_transactions_item_id ON market_adjustment_transactions(item_id);
CREATE INDEX idx_market_adjustment_transactions_adjustment_id ON market_adjustment_transactions(adjustment_id);
CREATE INDEX idx_market_adjustment_transactions_timestamp ON market_adjustment_transactions(timestamp);
CREATE INDEX idx_transaction_adjustment_snapshots_sale_id ON transaction_adjustment_snapshots(sale_id);
CREATE INDEX idx_transaction_adjustment_snapshots_item_id ON transaction_adjustment_snapshots(item_id);
CREATE INDEX idx_market_adjustments_active ON market_adjustments(active);
CREATE INDEX idx_market_adjustments_category ON market_adjustments(adjustment_category);
CREATE INDEX idx_rounding_logs_product ON rounding_logs(product_id);
CREATE INDEX idx_rounding_logs_product_variant ON rounding_logs(product_id, variant_id);
CREATE INDEX idx_rounding_logs_date ON rounding_logs(date);
CREATE UNIQUE INDEX idx_rounding_logs_unique_version ON rounding_logs(product_id, COALESCE(variant_id, ''), version);
CREATE INDEX idx_exam_batches_school ON examination_batches(school_id);
CREATE INDEX idx_exam_batches_status ON examination_batches(status);
CREATE INDEX idx_exam_classes_batch ON examination_classes(batch_id);
CREATE INDEX idx_exam_subjects_class ON examination_subjects(class_id);
CREATE INDEX idx_exam_bom_batch_class ON examination_bom_calculations(batch_id, class_id);
CREATE INDEX idx_exam_class_adjustments_batch ON examination_class_adjustments(batch_id);
CREATE INDEX idx_exam_class_adjustments_class ON examination_class_adjustments(class_id);
CREATE INDEX idx_exam_pricing_audit_batch ON examination_pricing_audit(batch_id);
CREATE INDEX idx_exam_pricing_audit_class ON examination_pricing_audit(class_id);
CREATE INDEX idx_exam_pricing_audit_event ON examination_pricing_audit(event_type);
CREATE INDEX idx_exam_batch_notifications_batch ON examination_batch_notifications(batch_id);
CREATE INDEX idx_exam_batch_notifications_user ON examination_batch_notifications(user_id);
CREATE INDEX idx_exam_batch_notifications_created ON examination_batch_notifications(created_at);
CREATE INDEX idx_exam_batch_notifications_is_read ON examination_batch_notifications(is_read);
CREATE INDEX idx_notification_audit_logs_notification ON notification_audit_logs(notification_id);
CREATE INDEX idx_notification_audit_logs_user ON notification_audit_logs(user_id);
CREATE INDEX idx_notification_audit_logs_created ON notification_audit_logs(created_at);
