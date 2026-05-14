# Examination Module Pricing Engine Replacement Plan (Hidden BOM Removal + Inventory-Style Settings)

## Summary
Replace the current examination BOM/adjustment implementation with a global settings-driven model that matches Inventory Modal calculation semantics, then remove hidden-BOM UI/calc flows across `views/examination`.  
The new flow will compute total sheets/pages from subjects, compute Total BOM Cost from Hidden BOM settings (paper/toner), compute Total Adjustments from active market adjustments, derive expected fee per learner, and still allow manual fee override.

## Locked Decisions
1. Settings scope is global-only.
2. Adjustment math matches Inventory Modal exactly: percentage on base BOM cost, fixed scaled by total pages, non-compounding.
3. Approval-time inventory deduction uses live computed class totals (no BOM snapshot table dependency).
4. Changing settings auto-recalculates all non-invoiced batches.
5. Manual override allows any positive value.
6. Scope is `views/examination` module only (exclude production exam screens like `views/production/ExaminationPrinting*`).

## Implementation Plan

### 1) Backend Data + API Refactor
1. Update [server/services/examinationService.cjs](d:/Application/Prime ERP System/server/services/examinationService.cjs) to add settings methods:
- `getExamPricingSettings()`
- `updateExamPricingSettings(payload, { userId })`
2. Persist Hidden BOM settings in existing `bom_default_materials` rows (`material_type='paper'|'toner'`, `preferred_item_id`).
3. Add/ensure `inventory.conversion_rate` support (default `500`) in:
- [server/db.cjs](d:/Application/Prime ERP System/server/db.cjs)
- normalization/sync paths in `examinationService`.
4. Add routes in [server/routes/examination.cjs](d:/Application/Prime ERP System/server/routes/examination.cjs):
- `GET /settings/pricing`
- `PUT /settings/pricing`
5. Keep `GET /batches/:id/bom` as compatibility shim returning `[]` + deprecation note (no new BOM rows), then remove frontend usage.

### 2) Backend Calculation Engine Replacement
1. Refactor `calculateBatch` in [server/services/examinationService.cjs](d:/Application/Prime ERP System/server/services/examinationService.cjs):
- Stop deleting/inserting `examination_bom_calculations` and `examination_class_adjustments`.
- Compute per-subject totals:
  - `total_sheets = ceil(pages/2) * (learners + extra_copies)`
  - `total_pages = pages * (learners + extra_copies)`
- Compute per-class BOM cost:
  - `paper_qty = total_sheets / paper_conversion_rate`
  - `paper_cost = paper_qty * paper_unit_cost`
  - `toner_qty = total_pages / 20000`
  - `toner_cost = toner_qty * toner_unit_cost`
  - `total_bom_cost = paper_cost + toner_cost`
- Compute per-class adjustments (all active, sorted):
  - percentage: `total_bom_cost * pct/100`
  - fixed: `value * total_pages`
  - `total_adjustments = sum(all adjustments)`
- Compute:
  - `expected_total = total_bom_cost + total_adjustments`
  - `expected_fee_per_learner = expected_total / learners`
  - `final_fee_per_learner = manual_override > 0 ? manual_override : expected_fee_per_learner`
  - `final_total = final_fee_per_learner * learners`
- Persist existing pricing columns (`suggested_cost_per_learner`, `material_total_cost`, `adjustment_total_cost`, `price_per_learner`, `total_price`, etc.).
2. Add/ensure subject `total_pages` persistence (`examination_subjects.total_pages`) and update type/model mapping.
3. Keep manual override permission checks, but remove minimum-floor restrictions beyond `> 0`.

### 3) Approval Deduction Refactor
1. Refactor `approveBatch` in [server/services/examinationService.cjs](d:/Application/Prime ERP System/server/services/examinationService.cjs):
- Remove dependency on `examination_bom_calculations`.
- Recompute live class totals with current settings/material config.
- Aggregate paper/toner deduction quantities by item and post inventory transactions.
2. Preserve audit logging and status transitions unchanged.

### 4) Frontend API + Services
1. Extend [services/examinationBatchService.ts](d:/Application/Prime ERP System/services/examinationBatchService.ts):
- Add `getPricingSettings()`
- Add `updatePricingSettings(payload)`
- Remove `getBOM()` callers from examination module.
2. Extend [services/examinationSyncService.ts](d:/Application/Prime ERP System/services/examinationSyncService.ts) inventory sync payload to include `conversion_rate` (`item.conversionRate`).

### 5) Examination UI Replacement (views/examination)
1. Replace BOM dialog entry in [views/examination/ExaminationBatchDetail.tsx](d:/Application/Prime ERP System/views/examination/ExaminationBatchDetail.tsx):
- Remove `BOMDialog` usage.
- Add `Settings` button opening new pricing settings modal.
2. Create [views/examination/components/ExaminationPricingSettingsDialog.tsx](d:/Application/Prime ERP System/views/examination/components/ExaminationPricingSettingsDialog.tsx):
- Visual style copied from Inventory ItemModal sections:
  - `Advanced Pricing Configuration`
  - `Hidden BOM (Automatic Cost Calculation)`
  - `Active Market Adjustments`
- Show computed preview from current batch subjects:
  - total sheets
  - total pages
  - total BOM cost
  - total adjustments
  - total cost
  - expected fee per learner
- Save updates via `PUT /settings/pricing`.
3. Remove stale BOM breakdown component usage:
- [views/examination/components/BOMDialog.tsx](d:/Application/Prime ERP System/views/examination/components/BOMDialog.tsx) decommissioned from active flow.
4. Update class cards in `ExaminationBatchDetail` to emphasize expected vs manual fee using new backend values.

### 6) Examination UI Cleanup (All files under views/examination)
1. Remove hidden-BOM frontend dependencies from [context/ExaminationContext.tsx](d:/Application/Prime ERP System/context/ExaminationContext.tsx):
- Remove `initializeExamHiddenBOM()` call/import.
- Remove `boms`/`bomTemplates` from context contract if no longer consumed.
2. Remove hidden-BOM and legacy adjustment selectors from [views/examination/ExaminationJobForm.tsx](d:/Application/Prime ERP System/views/examination/ExaminationJobForm.tsx).
3. Remove/deprecate [views/examination/components/BOMSelector.tsx](d:/Application/Prime ERP System/views/examination/components/BOMSelector.tsx) after references are gone.
4. Remove hidden-BOM bootstrap behavior from [server/bootstrap.cjs](d:/Application/Prime ERP System/server/bootstrap.cjs).

## Public API / Interface / Type Changes
1. New endpoint: `GET /api/examination/settings/pricing` returns global hidden-BOM material settings + active adjustments + constants/formula metadata.
2. New endpoint: `PUT /api/examination/settings/pricing` accepts:
- `paper_item_id?: string | null`
- `toner_item_id?: string | null`
- `trigger_recalculate?: boolean` (default true)
3. Deprecated endpoint behavior: `GET /api/examination/batches/:id/bom` returns empty list (compatibility shim).
4. Type additions in [types.ts](d:/Application/Prime ERP System/types.ts):
- `ExaminationPricingSettings` interface.
- `ExaminationSubject.total_pages?: number`.
- Optional class computed totals if needed (`calculated_total_pages`, `calculated_total_sheets`).
5. Context contract cleanup in [context/ExaminationContext.tsx](d:/Application/Prime ERP System/context/ExaminationContext.tsx): remove unused BOM/template state from examination module API.

## Test Cases and Scenarios
1. Build verification: `npm.cmd run build -- --mode development` succeeds with no dynamic import failures for `/examination/batches/:id`.
2. Formula correctness tests:
- Mixed percent + fixed adjustments apply non-compounding Inventory semantics.
- Fixed adjustment scales by total pages.
- Paper cost honors `conversion_rate` fallback (`500`).
3. Settings persistence tests:
- `GET /settings/pricing` reflects current defaults.
- `PUT /settings/pricing` updates defaults and triggers recalc summary for non-invoiced batches.
4. Batch calculation tests:
- Subject entry updates `total_sheets` and `total_pages`.
- `suggested_cost_per_learner` equals `(BOM + adjustments)/learners`.
5. Manual override tests:
- Any positive override accepted.
- Final billing uses manual fee while expected fee remains computed from BOM+adjustments.
6. Approval deduction tests:
- No read dependency on `examination_bom_calculations`.
- Inventory transactions are created from live computed totals.
7. Regression tests:
- Invoice generation flow unchanged.
- Permission checks for manual override unchanged.
- Existing server verification scripts updated away from BOM-row assertions.

## Assumptions and Defaults
1. “All exam UI” means all files under `views/examination` (not production exam UIs).
2. Hidden BOM now means configurable paper/toner defaults in global examination settings, not hidden BOM templates.
3. Existing BOM-related tables remain in DB for compatibility/history but are no longer part of active calculation flow.
4. Active market adjustments remain sourced from backend `market_adjustments`.
5. No listed AGENTS skill applies to this task (skill-creator/skill-installer are unrelated).
