import { describe, expect, it } from 'vitest';
import { calculateSellingPrice } from '../../src/utils/pricing/pricingEngine';
import {
  applyProductPriceRounding,
  DEFAULT_PRICING_SETTINGS,
} from '../../services/pricingRoundingService';

describe('frontend pricing engine', () => {
  it('uses the shared product rounding rules for manual base prices', async () => {
    const companyConfig = {
      pricingSettings: {
        ...DEFAULT_PRICING_SETTINGS,
        defaultMethod: 'ALWAYS_UP_50',
      },
    } as any;

    (window.localStorage.getItem as any).mockImplementation((key: string) => {
      if (key === 'nexus_company_config') {
        return JSON.stringify(companyConfig);
      }
      return null;
    });

    const expected = applyProductPriceRounding({
      calculatedPrice: 8701,
      companyConfig,
      trackAnalytics: false,
    });

    const result = await calculateSellingPrice({
      baseCost: 100,
      basePrice: 8701,
      quantity: 1,
      context: 'POS',
    });

    expect(result.unitPrice).toBe(expected.roundedPrice);
    expect(result.totalPrice).toBe(expected.roundedPrice);
  });

  it('normalizes adjustment snapshots with calculated amounts', async () => {
    const result = await calculateSellingPrice({
      baseCost: 50,
      basePrice: 100,
      quantity: 1,
      adjustments: [
        {
          name: 'Fuel',
          type: 'PERCENTAGE',
          value: 10,
        } as any,
      ],
      context: 'POS',
    });

    expect(result.adjustmentSnapshots[0]).toMatchObject({
      name: 'Fuel',
      type: 'PERCENTAGE',
      value: 10,
      calculatedAmount: 5,
    });
  });
});
