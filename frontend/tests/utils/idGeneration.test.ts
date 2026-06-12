import { describe, expect, it } from 'vitest';
import { CompanyConfig } from '../../types';
import {
  generateLocalId,
  generateNumericAccountNumber,
  generateOpaqueId,
  generateSequentialId,
} from '../../utils/idGeneration';

describe('idGeneration', () => {
  it('uses UUID-backed local ids when available', () => {
    expect(generateLocalId('local')).toBe('local-mock-uuid-1234');
  });

  it('creates opaque prefixed ids for local-only records', () => {
    expect(generateOpaqueId('TXN', { randomLength: 4 })).toMatch(/^TXN-\d+-[a-z0-9]{4}$/);
  });

  it('preserves shared sequential numbering rules', () => {
    const config = {
      transactionSettings: {
        numbering: {
          shared: {
            prefix: '',
            startNumber: 7,
            padding: 3,
            resetInterval: 'Never',
          },
        },
      },
    } as CompanyConfig;

    expect(generateSequentialId('customer', [], config)).toBe('CUST-007');
  });

  it('creates fixed-length numeric account numbers without a leading zero', () => {
    expect(generateNumericAccountNumber()).toMatch(/^[1-9]\d{7}$/);
  });
});
