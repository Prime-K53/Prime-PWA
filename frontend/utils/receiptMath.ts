/**
 * @deprecated Legacy helper retained for backward compatibility only.
 * New receipt generation should use `services/receiptCalculationService.ts`.
 */

interface Invoice {
  id: string;
  amount: number;
}

interface ReceiptFormattingResult {
  formattedAmountPaid: string;
  formattedTotalInvoiced: string;
  formattedWalletCredit: string;
  walletCredit: number;
  invoiceIdList: string;
  hasOverpayment: boolean;
  remainingBalance: number;
}

/**
 * Transforms raw payment data into formatted strings and calculates overpayments.
 * 
 * @param {number} amountPaid - The total amount received from the customer.
 * @param {Invoice[]} invoices - Array of invoice objects being paid.
 * @param {string} currencySymbol - The currency symbol to use (default '$').
 * @returns {ReceiptFormattingResult}
 */
export function formatReceiptData(
  amountPaid: number,
  invoices: Invoice[],
  currencySymbol: string = '$'
): ReceiptFormattingResult {
  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.amount, 0);
  const walletCredit = Math.max(0, amountPaid - totalInvoiced);
  const remainingBalance = Math.max(0, totalInvoiced - amountPaid);
  const invoiceIdList = invoices.map(inv => inv.id).join(', ');

  const formatCurrency = (val: number) => 
    `${currencySymbol}${val.toLocaleString(undefined, { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;

  return {
    formattedAmountPaid: formatCurrency(amountPaid),
    formattedTotalInvoiced: formatCurrency(totalInvoiced),
    formattedWalletCredit: formatCurrency(walletCredit),
    walletCredit,
    invoiceIdList,
    hasOverpayment: walletCredit > 0,
    remainingBalance
  };
}
