-- Production Module Schema
-- This schema mirrors the examination module structure but adapted for production workflows
-- Created on 2026-03-21

-- 1. Production Batches Table
-- Represents production batches linked to work orders
CREATE TABLE production_batches (
    id VARCHAR(50) PRIMARY KEY,
    work_order_id VARCHAR(50) NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    batch_name VARCHAR(255) NOT NULL,
    batch_type VARCHAR(50) DEFAULT 'Production' CHECK (batch_type IN ('Production', 'Job', 'Run', 'Batch')),
    production_year VARCHAR(20) NOT NULL,
    production_term VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'Draft' CHECK (status IN ('Draft', 'Calculated', 'Approved', 'Invoiced')),
    total_amount NUMERIC(15, 2) DEFAULT 0,
    calculated_material_total NUMERIC(15, 2) DEFAULT 0,
    calculated_adjustment_total NUMERIC(15, 2) DEFAULT 0,
    planned_quantity INTEGER DEFAULT 0,
    completed_quantity INTEGER DEFAULT 0,
    calculated_cost_per_unit NUMERIC(15, 2) DEFAULT 0,
    calculation_trigger VARCHAR(64),
    calculation_duration_ms INTEGER DEFAULT 0,
    last_calculated_at TIMESTAMP,
    currency VARCHAR(10) DEFAULT 'MWK',
    invoice_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Production Classes Table
-- Represents production classes/lines within a batch
CREATE TABLE production_classes (
    id VARCHAR(50) PRIMARY KEY,
    batch_id VARCHAR(50) NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
    class_name VARCHAR(120) NOT NULL,
    planned_quantity INTEGER NOT NULL CHECK (planned_quantity > 0),
    suggested_cost_per_unit NUMERIC(15, 2) DEFAULT 0,
    manual_cost_per_unit NUMERIC(15, 2),
    is_manual_override BOOLEAN DEFAULT FALSE,
    manual_override_reason TEXT,
    manual_override_by VARCHAR(50),
    manual_override_at TIMESTAMP,
    calculated_total_cost NUMERIC(15, 2) DEFAULT 0,
    material_total_cost NUMERIC(15, 2) DEFAULT 0,
    adjustment_total_cost NUMERIC(15, 2) DEFAULT 0,
    adjustment_delta_percent NUMERIC(9, 4) DEFAULT 0,
    cost_last_calculated_at TIMESTAMP,
    unit_price NUMERIC(15, 2) DEFAULT 0,
    total_price NUMERIC(15, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Production Subjects Table
-- Represents product variants/components within a class
CREATE TABLE production_subjects (
    id VARCHAR(50) PRIMARY KEY,
    class_id VARCHAR(50) NOT NULL REFERENCES production_classes(id) ON DELETE CASCADE,
    subject_name VARCHAR(120) NOT NULL,
    variant_id VARCHAR(50) REFERENCES product_variants(id) ON DELETE SET NULL,
    variant_name VARCHAR(255),
    quantity_required NUMERIC(15, 4) NOT NULL,
    unit_cost NUMERIC(15, 4) NOT NULL,
    total_cost NUMERIC(15, 2) NOT NULL,
    pages INTEGER CHECK (pages >= 0),
    extra_copies INTEGER DEFAULT 0 CHECK (extra_copies >= 0),
    paper_size VARCHAR(20) DEFAULT 'A4',
    orientation VARCHAR(20) DEFAULT 'Portrait',
    total_sheets INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Production BOM Calculations Table
-- Tracks material and adjustment calculations for production batches
CREATE TABLE production_bom_calculations (
    id VARCHAR(50) PRIMARY KEY,
    batch_id VARCHAR(50) NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
    class_id VARCHAR(50) REFERENCES production_classes(id) ON DELETE CASCADE,
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

-- 5. Production Class Adjustments Table
-- Tracks adjustment allocations across production classes
CREATE TABLE production_class_adjustments (
    id VARCHAR(50) PRIMARY KEY,
    batch_id VARCHAR(50) NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
    class_id VARCHAR(50) NOT NULL REFERENCES production_classes(id) ON DELETE CASCADE,
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

-- 6. Production Pricing Audit Table
-- Comprehensive audit trail for production pricing changes
CREATE TABLE production_pricing_audit (
    id VARCHAR(50) PRIMARY KEY,
    batch_id VARCHAR(50) NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
    class_id VARCHAR(50) REFERENCES production_classes(id) ON DELETE CASCADE,
    user_id VARCHAR(50),
    event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('SYSTEM_CALCULATION', 'MANUAL_OVERRIDE', 'MANUAL_OVERRIDE_RESET', 'AUTO_RECALC', 'VALIDATION_WARNING', 'PERMISSION_DENIED')),
    trigger_source VARCHAR(64),
    previous_cost_per_unit NUMERIC(15, 2),
    suggested_cost_per_unit NUMERIC(15, 2),
    new_cost_per_unit NUMERIC(15, 2),
    planned_quantity INTEGER DEFAULT 0,
    previous_total_amount NUMERIC(15, 2),
    new_total_amount NUMERIC(15, 2),
    percentage_difference NUMERIC(9, 4) DEFAULT 0,
    details_json JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Production Batch Notifications Table
-- Tracks notifications sent to users about production batch events
CREATE TABLE production_batch_notifications (
    id VARCHAR(50) PRIMARY KEY,
    batch_id VARCHAR(50) NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
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

-- 8. Production Notification Audit Logs Table
-- Comprehensive audit trail for all notification-related activities
CREATE TABLE production_notification_audit_logs (
    id VARCHAR(50) PRIMARY KEY,
    notification_id VARCHAR(50) REFERENCES production_batch_notifications(id) ON DELETE SET NULL,
    user_id VARCHAR(50) NOT NULL,
    action VARCHAR(32) NOT NULL CHECK (action IN ('CREATED', 'DELIVERED', 'READ', 'DISMISSED', 'EXPIRED', 'FAILED')),
    details_json JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Production BOM Templates Table
-- Reusable templates for production BOMs
CREATE TABLE production_bom_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Production BOM Template Components Table
-- Components for production BOM templates
CREATE TABLE production_bom_template_components (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES production_bom_templates(id) ON DELETE CASCADE,
    component_name VARCHAR(255) NOT NULL,
    component_type VARCHAR(20) DEFAULT 'MATERIAL' CHECK (component_type IN ('MATERIAL', 'ADJUSTMENT')),
    quantity_required NUMERIC(15, 4) NOT NULL,
    unit VARCHAR(50),
    unit_cost NUMERIC(15, 4) DEFAULT 0,
    allocation_ratio NUMERIC(12, 8) DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indices for performance
CREATE INDEX idx_production_batches_work_order ON production_batches(work_order_id);
CREATE INDEX idx_production_batches_status ON production_batches(status);
CREATE INDEX idx_production_batches_year_term ON production_batches(production_year, production_term);
CREATE INDEX idx_production_batches_invoice ON production_batches(invoice_id);
CREATE INDEX idx_production_classes_batch ON production_classes(batch_id);
CREATE INDEX idx_production_classes_name ON production_classes(class_name);
CREATE INDEX idx_production_subjects_class ON production_subjects(class_id);
CREATE INDEX idx_production_subjects_variant ON production_subjects(variant_id);
CREATE INDEX idx_production_bom_batch_class ON production_bom_calculations(batch_id, class_id);
CREATE INDEX idx_production_bom_item ON production_bom_calculations(item_id);
CREATE INDEX idx_production_class_adjustments_batch ON production_class_adjustments(batch_id);
CREATE INDEX idx_production_class_adjustments_class ON production_class_adjustments(class_id);
CREATE INDEX idx_production_class_adjustments_adjustment ON production_class_adjustments(adjustment_id);
CREATE INDEX idx_production_pricing_audit_batch ON production_pricing_audit(batch_id);
CREATE INDEX idx_production_pricing_audit_class ON production_pricing_audit(class_id);
CREATE INDEX idx_production_pricing_audit_event ON production_pricing_audit(event_type);
CREATE INDEX idx_production_notifications_batch ON production_batch_notifications(batch_id);
CREATE INDEX idx_production_notifications_user ON production_batch_notifications(user_id);
CREATE INDEX idx_production_notifications_created ON production_batch_notifications(created_at);
CREATE INDEX idx_production_notifications_is_read ON production_batch_notifications(is_read);
CREATE INDEX idx_production_notification_audit_notification ON production_notification_audit_logs(notification_id);
CREATE INDEX idx_production_notification_audit_user ON production_notification_audit_logs(user_id);
CREATE INDEX idx_production_notification_audit_created ON production_notification_audit_logs(created_at);
CREATE INDEX idx_production_bom_templates_active ON production_bom_templates(is_active);
CREATE INDEX idx_production_bom_template_components_template ON production_bom_template_components(template_id);

-- Foreign key constraints for additional integrity
ALTER TABLE production_batches ADD CONSTRAINT fk_production_batches_work_order 
    FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE;

ALTER TABLE production_classes ADD CONSTRAINT fk_production_classes_batch 
    FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE CASCADE;

ALTER TABLE production_subjects ADD CONSTRAINT fk_production_subjects_class 
    FOREIGN KEY (class_id) REFERENCES production_classes(id) ON DELETE CASCADE;

ALTER TABLE production_subjects ADD CONSTRAINT fk_production_subjects_variant 
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;

ALTER TABLE production_bom_calculations ADD CONSTRAINT fk_production_bom_batch 
    FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE CASCADE;

ALTER TABLE production_bom_calculations ADD CONSTRAINT fk_production_bom_class 
    FOREIGN KEY (class_id) REFERENCES production_classes(id) ON DELETE CASCADE;

ALTER TABLE production_class_adjustments ADD CONSTRAINT fk_production_class_adjustments_batch 
    FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE CASCADE;

ALTER TABLE production_class_adjustments ADD CONSTRAINT fk_production_class_adjustments_class 
    FOREIGN KEY (class_id) REFERENCES production_classes(id) ON DELETE CASCADE;

ALTER TABLE production_class_adjustments ADD CONSTRAINT fk_production_class_adjustments_adjustment 
    FOREIGN KEY (adjustment_id) REFERENCES market_adjustments(id) ON DELETE CASCADE;

ALTER TABLE production_pricing_audit ADD CONSTRAINT fk_production_pricing_audit_batch 
    FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE CASCADE;

ALTER TABLE production_pricing_audit ADD CONSTRAINT fk_production_pricing_audit_class 
    FOREIGN KEY (class_id) REFERENCES production_classes(id) ON DELETE CASCADE;

ALTER TABLE production_batch_notifications ADD CONSTRAINT fk_production_notifications_batch 
    FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE CASCADE;

ALTER TABLE production_notification_audit_logs ADD CONSTRAINT fk_production_notification_audit_notification 
    FOREIGN KEY (notification_id) REFERENCES production_batch_notifications(id) ON DELETE SET NULL;
