import { ExaminationSubject } from '../types';

export const roundCurrency = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export const roundUpToStep = (value: number, step: number) => {
  const safeValue = Number(value) || 0;
  const safeStep = Math.max(1, Math.round(Number(step) || 50));
  return Math.ceil(safeValue / safeStep) * safeStep;
};

export type EffectiveMarginLike = {
  margin_value?: number;
  margin_type?: 'percentage' | 'fixed_amount' | string;
} | null | undefined;

export const resolveMarginAmount = (baseCost: number, margin: EffectiveMarginLike) => {
  const safeBaseCost = roundCurrency(baseCost);
  const marginValue = Number(margin?.margin_value ?? 0) || 0;
  if (marginValue <= 0) return 0;

  if (String(margin?.margin_type || 'percentage').toLowerCase() === 'fixed_amount') {
    return roundCurrency(marginValue);
  }

  return roundCurrency(safeBaseCost * (marginValue / 100));
};

export const calculateLocalClassPreviewBase = (
  subjects: ExaminationSubject[],
  learners: number,
  paperUnitCost: number,
  tonerUnitCost: number,
  paperConversionRate: number,
  tonerPagesPerUnit: number,
  adjustments: any[]
) => {
  const safeLearners = Math.max(0, Math.floor(Number(learners) || 0));
  let totalSheets = 0;
  let totalPages = 0;

  (subjects || []).forEach((subject) => {
    const pagesPerPaper = Math.max(0, Math.floor(Number(subject?.pages) || 0));
    const extraCopies = Math.max(0, Math.floor(Number(subject?.extra_copies) || 0));
    const totalCopies = safeLearners + extraCopies;
    totalPages += pagesPerPaper * totalCopies;
    totalSheets += Math.ceil(pagesPerPaper / 2) * totalCopies;
  });

  const safePaperConversionRate = Math.max(1, Number(paperConversionRate) || 500);
  const safeTonerPagesPerUnit = Math.max(1, Number(tonerPagesPerUnit) || 20000);
  const paperQuantity = totalSheets / safePaperConversionRate;
  const tonerQuantity = totalPages / safeTonerPagesPerUnit;
  const paperCost = roundCurrency(paperQuantity * Math.max(0, Number(paperUnitCost) || 0));
  const tonerCost = roundCurrency(tonerQuantity * Math.max(0, Number(tonerUnitCost) || 0));
  const totalBomCost = roundCurrency(paperCost + tonerCost);

  const marketAdjustmentTotal = roundCurrency((adjustments || []).reduce((sum, adjustment) => {
    const type = String(adjustment?.type || '').toUpperCase();
    const rawValue = Number(adjustment?.value ?? adjustment?.percentage ?? 0) || 0;
    const amount = type === 'FIXED'
      ? roundCurrency(rawValue * totalPages)
      : roundCurrency(totalBomCost * (rawValue / 100));
    return sum + amount;
  }, 0));

  return {
    totalSheets,
    totalPages,
    paperQuantity,
    tonerQuantity,
    paperCost,
    tonerCost,
    totalBomCost,
    marketAdjustmentTotal
  };
};

export const calculateRoundedClassPreview = ({
  totalBomCost,
  marketAdjustmentTotal,
  learners,
  margin,
  roundingStep = 50
}: {
  totalBomCost: number;
  marketAdjustmentTotal: number;
  learners: number;
  margin?: EffectiveMarginLike;
  roundingStep?: number;
}) => {
  const safeLearners = Math.max(0, Math.floor(Number(learners) || 0));
  const safeBomCost = roundCurrency(totalBomCost);
  const safeMarketAdjustmentTotal = roundCurrency(marketAdjustmentTotal);
  const subtotalBeforeMargin = roundCurrency(safeBomCost + safeMarketAdjustmentTotal);
  const marginAmount = resolveMarginAmount(subtotalBeforeMargin, margin);
  const preRoundedTotal = roundCurrency(subtotalBeforeMargin + marginAmount);

  if (safeLearners <= 0) {
    return {
      marginAmount,
      roundingAdjustment: 0,
      totalAdjustments: safeMarketAdjustmentTotal,
      totalCost: preRoundedTotal,
      expectedFeePerLearner: 0,
      calculatedTotalCost: preRoundedTotal
    };
  }

  const rawFeePerLearner = roundCurrency(preRoundedTotal / safeLearners);
  const expectedFeePerLearner = roundUpToStep(rawFeePerLearner, roundingStep);
  const totalCost = roundCurrency(expectedFeePerLearner * safeLearners);
  const roundingAdjustment = roundCurrency(Math.max(0, totalCost - preRoundedTotal));

  return {
    marginAmount,
    marketAdjustmentTotal: safeMarketAdjustmentTotal,
    roundingAdjustment,
    totalAdjustments: roundCurrency(safeMarketAdjustmentTotal + roundingAdjustment),
    totalCost,
    expectedFeePerLearner,
    calculatedTotalCost: totalCost
  };
};
