// DEPRECATED: This file has zero importers as of April 21, 2026.
// Do not add new imports. Scheduled for removal — see cleanup tracker.

import {
  ExaminationBatch,
  ExaminationClass,
  ExaminationPricingSettings,
  MarketAdjustment,
  PricingSyncPayload,
  PricingSyncResult,
  OverrideCascadeResult
} from '../types';
import { PricingSettings, calculateBatchPricing } from '../utils/examinationPricingCalculator';
import { handleOverrideCascade } from '../utils/overrideCascadeEngine';
import { examinationBatchService } from './examinationBatchService';

/**
 * Examination Pricing Sync Service
 * 
 * Ensures bidirectional data consistency between Examination Pricing Settings
 * and the Classes and Subjects table. Handles automatic population of three
 * critical financial metrics upon save, and real-time override cascades.
 */

export interface SyncOptions {
  triggerRecalculation?: boolean;
  lockPricingSnapshot?: boolean;
  userId?: string;
}

export interface ClassFinancialUpdate {
  expected_fee_per_learner: number;
  final_fee_per_learner: number;
  live_total_preview: number;
  financial_metrics_source: 'SYSTEM_CALCULATION' | 'MANUAL_OVERRIDE' | 'PRICING_SETTINGS_SYNC';
  financial_metrics_updated_by?: string;
  financial_metrics_updated_at: string;
}

/**
 * Main synchronization method - called when Pricing Settings are saved
 * Automatically populates Classes table with three financial metrics:
 * - Expected Fee per Learner (mirrors Pricing Settings calculation)
 * - Final Fee per Learner (initialized to match Expected Fee)
 * - Live Total Preview (Final Fee × Learner Count)
 * 
 * @param payload - The pricing sync payload with batch, settings, and adjustments
 * @param options - Optional sync configuration
 * @returns PricingSyncResult with success status and update details
 * 
 * @deprecated No callers found as of April 21, 2026.
 * Candidate for removal after 2 weeks of silence.
 * Functions were intended to be used by examination pricing sync flows
 * but are not currently imported anywhere in the codebase.
 */
export async function syncPricingToClasses(
  payload: PricingSyncPayload,
  options: SyncOptions = {}
): Promise<PricingSyncResult> {
  console.warn('[DEPRECATED] examinationPricingSyncService.syncPricingToClasses called — this service has no known callers and is scheduled for removal.');
  
  const { batchId, settings, adjustments, triggeredBy, triggerSource } = payload;
  const { triggerRecalculation = true } = options;
  
  const errors: Array<{ classId: string; error: string }> = [];
  const timestamp = new Date().toISOString();
  
  try {
    // Fetch the batch with current classes
    const batch = await examinationBatchService.getBatch(batchId);
    
    if (!batch || !batch.classes || batch.classes.length === 0) {
      return {
        success: false,
        batchId,
        classesUpdated: 0,
        errors: [{ classId: 'BATCH', error: 'Batch not found or has no classes' }],
        timestamp
      };
    }
    
    // Convert ExaminationPricingSettings to PricingSettings for calculator
    const pricingSettings: PricingSettings = {
      paper_item_id: settings.paper_item_id,
      paper_item_name: settings.paper_item_name,
      paper_unit_cost: settings.paper_unit_cost,
      toner_item_id: settings.toner_item_id,
      toner_item_name: settings.toner_item_name,
      toner_unit_cost: settings.toner_unit_cost,
      conversion_rate: settings.conversion_rate,
      constants: settings.constants,
      active_adjustments: settings.active_adjustments.map(adj => ({
        id: adj.id,
        name: adj.name,
        type: adj.type,
        value: adj.value,
        percentage: adj.percentage,
        sort_order: adj.sort_order
      }))
    };
    
    // Calculate pricing for all classes
    const pricingResult = calculateBatchPricing(batch, pricingSettings, adjustments);
    
    // Update each class with the three financial metrics
    let classesUpdated = 0;
    
    for (const classPricing of pricingResult.classes) {
      try {
        const cls = batch.classes?.find(c => c.id === classPricing.classId);
        
        if (!cls) {
          errors.push({ classId: classPricing.classId, error: 'Class not found in batch' });
          continue;
        }
        
        // Determine Final Fee: preserve existing override if present, otherwise use Expected Fee
        const hasManualOverride = Boolean(cls.is_manual_override) && cls.manual_cost_per_learner != null;
        const finalFee = hasManualOverride
          ? cls.manual_cost_per_learner!
          : classPricing.expectedFeePerLearner;
        
        // Calculate Live Total Preview
        const liveTotal = Math.round(finalFee * classPricing.learners * 100) / 100;
        
        const updateData: ClassFinancialUpdate = {
          expected_fee_per_learner: classPricing.expectedFeePerLearner,
          final_fee_per_learner: finalFee,
          live_total_preview: liveTotal,
          financial_metrics_source: triggerSource,
          financial_metrics_updated_by: triggeredBy,
          financial_metrics_updated_at: timestamp
        };
        
        // Persist to backend using updateClass (financial metrics are part of the class data)
        await examinationBatchService.updateClass(classPricing.classId, {
          expected_fee_per_learner: updateData.expected_fee_per_learner,
          final_fee_per_learner: updateData.final_fee_per_learner,
          live_total_preview: updateData.live_total_preview,
          financial_metrics_source: updateData.financial_metrics_source,
          financial_metrics_updated_by: updateData.financial_metrics_updated_by,
          financial_metrics_updated_at: updateData.financial_metrics_updated_at
        });
        
        classesUpdated++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ classId: classPricing.classId, error: errorMessage });
      }
    }
    
    // Optionally trigger batch recalculation
    if (triggerRecalculation && classesUpdated > 0) {
      try {
        await examinationBatchService.calculateBatch(batchId);
      } catch (calcError) {
        console.warn('[ExaminationPricingSync] Recalculation warning:', calcError);
      }
    }
    
    return {
      success: errors.length === 0,
      batchId,
      classesUpdated,
      errors,
      timestamp
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      batchId,
      classesUpdated: 0,
      errors: [{ classId: 'BATCH', error: errorMessage }],
      timestamp
    };
  }
}

/**
 * Real-time override cascade - updates Final Fee and Live Total immediately
 * Called when user inputs an override amount in the Override Input field
 * 
 * @param classId - The ID of the class to update
 * @param overrideAmount - The new override amount
 * @param userId - The ID of the user making the change
 * @returns OverrideCascadeResult with before/after values
 * 
 * @deprecated No callers found as of April 21, 2026.
 * Candidate for removal after 2 weeks of silence.
 * Functions were intended to be used by examination pricing sync flows
 * but are not currently imported anywhere in the codebase.
 */
export async function applyOverrideCascade(
  classId: string,
  overrideAmount: number,
  userId: string
): Promise<OverrideCascadeResult> {
  console.warn('[DEPRECATED] examinationPricingSyncService.applyOverrideCascade called — this service has no known callers and is scheduled for removal.');
  
  try {
    // Fetch current class data
    const cls = await examinationBatchService.getClass(classId);
    
    if (!cls) {
      throw new Error(`Class ${classId} not found`);
    }
    
    // Calculate cascade result
    const cascadeResult = handleOverrideCascade(cls, overrideAmount, userId);
    
    // Persist to backend using updateClass
    await examinationBatchService.updateClass(classId, {
      final_fee_per_learner: cascadeResult.newFinalFee,
      live_total_preview: cascadeResult.newLiveTotal,
      financial_metrics_source: 'MANUAL_OVERRIDE',
      financial_metrics_updated_by: userId,
      financial_metrics_updated_at: cascadeResult.updatedAt,
      is_manual_override: true,
      manual_cost_per_learner: cascadeResult.newFinalFee
    });
    
    return cascadeResult;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Override cascade failed: ${errorMessage}`);
  }
}

/**
 * Batch override cascade - applies overrides to multiple classes at once
 * Useful for bulk operations or when processing pricing settings updates
 * 
 * @param batchId - The batch ID containing the classes
 * @param overrides - Map of classId to override amount
 * @param userId - The ID of the user making the changes
 * @returns Array of OverrideCascadeResult for each updated class
 * 
 * @deprecated No callers found as of April 21, 2026.
 * Candidate for removal after 2 weeks of silence.
 * Functions were intended to be used by examination pricing sync flows
 * but are not currently imported anywhere in the codebase.
 */
export async function applyBatchOverrideCascade(
  batchId: string,
  overrides: Map<string, number>,
  userId: string
): Promise<OverrideCascadeResult[]> {
  console.warn('[DEPRECATED] examinationPricingSyncService.applyBatchOverrideCascade called — this service has no known callers and is scheduled for removal.');
  
  const results: OverrideCascadeResult[] = [];
  
  for (const [classId, overrideAmount] of overrides.entries()) {
    try {
      const result = await applyOverrideCascade(classId, overrideAmount, userId);
      results.push(result);
    } catch (error) {
      console.error(`[ExaminationPricingSync] Failed to apply override to class ${classId}:`, error);
      // Continue processing other classes even if one fails
    }
  }
  
  return results;
}

/**
 * Reset financial metrics to system-calculated values
 * Removes manual overrides and recalculates based on current settings
 * 
 * @param classId - The ID of the class to reset
 * @param userId - The ID of the user performing the reset
 * @returns The updated class data
 * 
 * @deprecated No callers found as of April 21, 2026.
 * Candidate for removal after 2 weeks of silence.
 * Functions were intended to be used by examination pricing sync flows
 * but are not currently imported anywhere in the codebase.
 */
export async function resetFinancialMetricsToSystemCalculated(
  classId: string,
  userId: string
): Promise<ExaminationClass> {
  console.warn('[DEPRECATED] examinationPricingSyncService.resetFinancialMetricsToSystemCalculated called — this service has no known callers and is scheduled for removal.');
  
  try {
    const cls = await examinationBatchService.getClass(classId);
    
    if (!cls) {
      throw new Error(`Class ${classId} not found`);
    }
    
    // Reset to expected fee (system calculated)
    const expectedFee = cls.expected_fee_per_learner || cls.suggested_cost_per_learner || 0;
    const learnerCount = Math.max(1, Math.floor(Number(cls.number_of_learners) || 0));
    const liveTotal = Math.round(expectedFee * learnerCount * 100) / 100;
    
    // Reset to expected fee and clear override
    await examinationBatchService.updateClass(classId, {
      final_fee_per_learner: expectedFee,
      live_total_preview: liveTotal,
      financial_metrics_source: 'SYSTEM_CALCULATION',
      financial_metrics_updated_by: userId,
      financial_metrics_updated_at: new Date().toISOString(),
      is_manual_override: false,
      manual_cost_per_learner: null
    });
    
    // Fetch and return the updated class
    const updatedBatch = await examinationBatchService.getBatch(cls.batch_id);
    const updatedClass = updatedBatch.classes?.find(c => c.id === classId);
    if (!updatedClass) {
      throw new Error(`Class ${classId} not found after reset`);
    }
    return updatedClass;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Reset financial metrics failed: ${errorMessage}`);
  }
}

/**
 * Validate that all classes in a batch have consistent financial metrics
 * Checks for data integrity issues
 * 
 * @param batchId - The batch ID to validate
 * @returns Object with validation results and any issues found
 * 
 * @deprecated No callers found as of April 21, 2026.
 * Candidate for removal after 2 weeks of silence.
 * Functions were intended to be used by examination pricing sync flows
 * but are not currently imported anywhere in the codebase.
 */
export async function validateBatchFinancialConsistency(
  batchId: string
): Promise<{
  isConsistent: boolean;
  issues: Array<{ classId: string; issue: string; severity: 'error' | 'warning' }>;
  totalClasses: number;
  classesWithIssues: number;
}> {
  console.warn('[DEPRECATED] examinationPricingSyncService.validateBatchFinancialConsistency called — this service has no known callers and is scheduled for removal.');
  
  try {
    const batch = await examinationBatchService.getBatch(batchId);
    
    if (!batch || !batch.classes) {
      return {
        isConsistent: false,
        issues: [{ classId: 'BATCH', issue: 'Batch not found or has no classes', severity: 'error' }],
        totalClasses: 0,
        classesWithIssues: 1
      };
    }
    
    const issues: Array<{ classId: string; issue: string; severity: 'error' | 'warning' }> = [];
    
    for (const cls of batch.classes) {
      // Check for missing required fields
      if (cls.expected_fee_per_learner === undefined || cls.expected_fee_per_learner === null) {
        issues.push({ classId: cls.id, issue: 'Missing expected_fee_per_learner', severity: 'error' });
      }
      
      if (cls.final_fee_per_learner === undefined || cls.final_fee_per_learner === null) {
        issues.push({ classId: cls.id, issue: 'Missing final_fee_per_learner', severity: 'error' });
      }
      
      if (cls.live_total_preview === undefined || cls.live_total_preview === null) {
        issues.push({ classId: cls.id, issue: 'Missing live_total_preview', severity: 'error' });
      }
      
      // Check for data consistency
      if (cls.final_fee_per_learner && cls.live_total_preview && cls.number_of_learners) {
        const expectedTotal = cls.final_fee_per_learner * cls.number_of_learners;
        const variance = Math.abs(expectedTotal - cls.live_total_preview);
        
        if (variance > 0.01) {
          issues.push({
            classId: cls.id,
            issue: `Live total mismatch: expected ${expectedTotal.toFixed(2)}, got ${cls.live_total_preview.toFixed(2)}`,
            severity: 'warning'
          });
        }
      }
    }
    
    return {
      isConsistent: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      totalClasses: batch.classes.length,
      classesWithIssues: new Set(issues.map(i => i.classId)).size
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      isConsistent: false,
      issues: [{ classId: 'BATCH', issue: errorMessage, severity: 'error' }],
      totalClasses: 0,
      classesWithIssues: 1
    };
  }
}
