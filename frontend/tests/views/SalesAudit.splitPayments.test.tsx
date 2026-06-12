import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import SalesAudit from '../../views/reports/SalesAudit';

const mockUseData = vi.fn();

vi.mock('../../context/DataContext', () => ({
  useData: () => mockUseData()
}));

describe('SalesAudit split payment aggregation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-23T12:00:00.000Z'));
    mockUseData.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not double-count split transactions in payment method totals', () => {
    mockUseData.mockReturnValue({
      sales: [
        {
          id: 'SALE-1',
          date: '2026-02-23T08:00:00.000Z',
          totalAmount: 100,
          total: 100,
          discount: 0,
          status: 'Paid',
          items: [],
          paymentMethod: 'Split',
          payments: [
            { method: 'Cash', amount: 60 },
            { method: 'Card', amount: 40 }
          ],
          cashierId: 'USER-1'
        },
        {
          id: 'SALE-2',
          date: '2026-02-23T09:00:00.000Z',
          totalAmount: 50,
          total: 50,
          discount: 0,
          status: 'Paid',
          items: [],
          paymentMethod: 'Cash',
          payments: [{ method: 'Cash', amount: 50 }],
          cashierId: 'USER-1'
        }
      ],
      customerPayments: [],
      companyConfig: { currencySymbol: '$' },
      allUsers: [{ id: 'USER-1', name: 'Cashier One', fullName: 'Cashier One' }]
    });

    render(<SalesAudit />);

    const title = screen.getByText('Revenue by Payment Method');
    const card = title.parentElement?.parentElement as HTMLElement;

    expect(within(card).getByText('Cash')).toBeInTheDocument();
    expect(within(card).getByText('Card')).toBeInTheDocument();
    expect(within(card).getByText('$110.00')).toBeInTheDocument();
    expect(within(card).getByText('$40.00')).toBeInTheDocument();
    expect(within(card).queryByText(/^Split$/)).not.toBeInTheDocument();
  });
});
