export interface PricingAdjustmentInput {
  id?: string;
  name?: string;
  display_name?: string;
  type?: string;
  value?: number;
  percentage?: number;
  sort_order?: number;
}

export interface PricingSettingsInput {
  paper_unit_cost?: number;
  toner_unit_cost?: number;
  conversion_rate?: number;
  adjustment_rate?: number; // percentage as decimal, e.g. 0.70
  profit_margin?: number;    // percentage as decimal, e.g. 0.385
  constants?: {
    toner_pages_per_unit?: number;
  };
  active_adjustments?: PricingAdjustmentInput[];
}

export interface PricingSubjectInput {
  pages?: number;
  extra_copies?: number;
}

export interface PricingClassInput {
  id?: string;
  class_name?: string;
  number_of_learners?: number;
  subjects?: PricingSubjectInput[];
  is_manual_override?: number | boolean;
  manual_cost_per_learner?: number | null;
}

export interface PricingBatchInput {
  classes?: PricingClassInput[];
}

export interface ClassPricingResult {
  classId: string;
  className: string;
  learners: number;
  totalSheets: number;
  totalPages: number;
  totalBomCost: number;
  totalAdjustments: number;
  totalCost: number;
  expectedFeePerLearner: number;
  finalFeePerLearner: number;
  liveTotalPreview: number;
}

export interface BatchPricingResult {
  classes: ClassPricingResult[];
}

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const roundUpTo50 = (value: number): number => {
  const safeValue = Number(value) || 0;
  // Rule: round the learner fee up to the next clean 50.
  // Example: 2,080 → 2,100; 1,274 → 1,250
  return Math.ceil(safeValue / 50) * 50;
};

const normalizeAdjustmentType = (value: string | undefined) => {
  const type = String(value || '').toUpperCase();
  if (type === 'FIXED') return 'FIXED';
  return 'PERCENTAGE';
};

export const calculateSubjectConsumptionForLearners = (
  subject: PricingSubjectInput | null | undefined,
  learnersInput: number
) => {
  const learners = Math.max(1, Math.floor(Number(learnersInput) || 0));
  const pages = Math.max(1, Math.floor(Number(subject?.pages) || 0));
  const extraCopies = Math.max(0, Math.floor(Number(subject?.extra_copies) || 0));
  const copies = learners + extraCopies;
  const totalSheets = Math.ceil(pages / 2) * copies;
  const totalPages = pages * copies;
  return {
    pages,
    extraCopies,
    copies,
    totalSheets,
    totalPages
  };
};

export const calculateExaminationBatchPricing = (
  batch: PricingBatchInput | null | undefined,
  settings: PricingSettingsInput | null,
  activeAdjustments: PricingAdjustmentInput[]
): BatchPricingResult => {
  if (!batch || !settings) {
    return { classes: [] };
  }

  const conversionRate = Math.max(1, Number(settings.conversion_rate) || 500);
  const tonerPagesPerUnit = Math.max(1, Number(settings.constants?.toner_pages_per_unit) || 20000);
  const effectiveAdjustments = activeAdjustments.length > 0
    ? activeAdjustments
    : (settings.active_adjustments || []);

  const classes = (batch.classes || []).map((cls, index) => {
    const learners = Math.max(1, Math.floor(Number(cls.number_of_learners) || 0));
    let totalSheets = 0;
    let totalPages = 0;

    for (const subject of cls.subjects || []) {
      const consumption = calculateSubjectConsumptionForLearners(subject, learners);
      totalSheets += consumption.totalSheets;
      totalPages += consumption.totalPages;
    }

    const paperQty = totalSheets / conversionRate;
    const tonerQty = totalPages / tonerPagesPerUnit;
    const paperCost = roundMoney(paperQty * (Number(settings.paper_unit_cost) || 0));
    const tonerCost = roundMoney(tonerQty * (Number(settings.toner_unit_cost) || 0));
    const totalBomCost = roundMoney(paperCost + tonerCost);

    // 1. Compute adjustedCost = BOM + (BOM * adjustmentRate)
    const explicitAdjustmentRate = Number(settings.adjustment_rate ?? 0);
    const sumOfAdjustments = (effectiveAdjustments || []).reduce((sum, adj) => {
      const val = Number(adj.percentage ?? adj.value ?? 0);
      return sum + (normalizeAdjustmentType(adj.type) === 'PERCENTAGE' ? val / 100 : 0);
    }, 0);
    
    const totalFixedAdjustments = (effectiveAdjustments || []).reduce((sum, adj) => {
      if (normalizeAdjustmentType(adj.type) === 'FIXED') {
        const val = Number(adj.value) || 0;
        return sum + roundMoney(val * totalPages);
      }
      return sum;
    }, 0);

    const effectiveAdjustmentRate = explicitAdjustmentRate || sumOfAdjustments;
    const adjustedCost = totalBomCost + (totalBomCost * effectiveAdjustmentRate) + totalFixedAdjustments;

    // 2. Compute rawTotal = adjustedCost * (1 + profitMargin)
    // Profit margin must be applied after adjustments, not directly on BOM.
    const profitMargin = Number(settings.profit_margin ?? 0);
    const rawTotal = adjustedCost * (1 + profitMargin);

    // 3. Compute rawFeePerLearner = rawTotal / learners
    // Ensure floating point precision up to 2 decimal places before rounding.
    const rawFeePerLearner = learners > 0 ? roundMoney(rawTotal / learners) : 0;

    // 4. Apply the standard examination round-up rule.
    const roundedFeePerLearner = roundUpTo50(rawFeePerLearner);

    const expectedFeePerLearner = roundedFeePerLearner;
    const roundedExpectedTotal = roundMoney(expectedFeePerLearner * learners);
    const totalCost = roundedExpectedTotal;
    const totalAdjustments = roundMoney(totalCost - totalBomCost);

    const hasManualOverride = Boolean(Number(cls.is_manual_override || 0)) && cls.manual_cost_per_learner != null;
    const finalFeePerLearner = hasManualOverride
      ? Number(cls.manual_cost_per_learner)
      : expectedFeePerLearner;
    const liveTotalPreview = roundMoney(finalFeePerLearner * learners);

    return {
      classId: cls.id || `class-${index + 1}`,
      className: cls.class_name || `Class ${index + 1}`,
      learners,
      totalSheets,
      totalPages,
      totalBomCost,
      totalAdjustments,
      totalCost,
      expectedFeePerLearner,
      finalFeePerLearner,
      liveTotalPreview
    };
  });

  return { classes };
};
