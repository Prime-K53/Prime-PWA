import { describe, expect, it } from 'vitest';
import { isMarketAdjustmentActive } from '../../utils/marketAdjustmentUtils';

describe('marketAdjustmentUtils', () => {
  it('treats boolean, numeric, and string active flags consistently', () => {
    expect(isMarketAdjustmentActive({ active: true } as any)).toBe(true);
    expect(isMarketAdjustmentActive({ active: 1 as any } as any)).toBe(true);
    expect(isMarketAdjustmentActive({ active: '1' as any } as any)).toBe(true);
    expect(isMarketAdjustmentActive({ isActive: 'true' as any } as any)).toBe(true);
    expect(isMarketAdjustmentActive({ is_active: 'yes' as any } as any)).toBe(true);
    expect(isMarketAdjustmentActive({ active: false } as any)).toBe(false);
    expect(isMarketAdjustmentActive({ active: 0 as any } as any)).toBe(false);
    expect(isMarketAdjustmentActive({ isActive: 'false' as any } as any)).toBe(false);
  });

  it('defaults missing active flags to active', () => {
    expect(isMarketAdjustmentActive({ id: 'adj-1' } as any)).toBe(true);
    expect(isMarketAdjustmentActive(undefined)).toBe(true);
  });
});
