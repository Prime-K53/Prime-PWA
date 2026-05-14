import { create } from 'zustand';
import { VATConfig, VatTransaction, VatReturn } from '../types';
import { dbService } from '../services/db';
import { generateNextId } from '../utils/helpers';

interface VatState {
    config: VATConfig;
    transactions: VatTransaction[];
    returns: VatReturn[];
    isLoading: boolean;

    fetchVatData: () => Promise<void>;
    updateConfig: (config: VATConfig) => Promise<void>;
    addTransaction: (transaction: VatTransaction) => Promise<void>;
    generateReturn: (periodStart: string, periodEnd: string) => Promise<VatReturn>;
    fileReturn: (returnId: string, paymentDate?: string) => Promise<void>;
}

export const useVatStore = create<VatState>((set, get) => ({
    config: {
        enabled: true, // This will be driven by pricingMode logic but we keep it for compatibility
        pricingMode: 'VAT',
        rate: 17.5, // Default for Malawi
        filingFrequency: 'Monthly',
        defaultTaxCategory: 'Standard'
    },
    transactions: [],
    returns: [],
    isLoading: false,

    fetchVatData: async () => {
        set({ isLoading: true });
        try {
            const db = await dbService.initDB();

            const storedConfig = localStorage.getItem('nexus_company_config');
            if (storedConfig) {
                const parsed = JSON.parse(storedConfig);
                if (parsed.vat) {
                    set({ config: parsed.vat });
                }
            }

            const transactions = await db.getAll('vatTransactions');
            const returns = await db.getAll('vatReturns');
            set({ transactions, returns });
        } catch (error) {
            console.error('Failed to fetch VAT data:', error);
        } finally {
            set({ isLoading: false });
        }
    },

    updateConfig: async (config: VATConfig) => {
        // Update local state
        set({ config });

        // Update CompanyConfig in localStorage
        const storedConfig = localStorage.getItem('nexus_company_config');
        let newCompanyConfig = {};
        if (storedConfig) {
            newCompanyConfig = JSON.parse(storedConfig);
        }
        (newCompanyConfig as any).vat = config;
        localStorage.setItem('nexus_company_config', JSON.stringify(newCompanyConfig));
    },

    addTransaction: async (transaction: VatTransaction) => {
        const db = await dbService.initDB();
        await db.put('vatTransactions', transaction);
        set(state => ({ transactions: [...state.transactions, transaction] }));
    },

    generateReturn: async (periodStart: string, periodEnd: string) => {
        const { transactions } = get();

        // Filter unfiled transactions within period
        const periodTransactions = transactions.filter(t =>
            !t.isFiled &&
            t.date >= periodStart &&
            t.date <= periodEnd
        );

        const totalInput = periodTransactions
            .filter(t => t.type === 'Input')
            .reduce((sum, t) => sum + t.amount, 0);

        const totalOutput = periodTransactions
            .filter(t => t.type === 'Output')
            .reduce((sum, t) => sum + t.amount, 0);

        const newReturn: VatReturn = {
            id: generateNextId(),
            periodStart,
            periodEnd,
            totalInputTax: totalInput,
            totalOutputTax: totalOutput,
            netPayable: totalOutput - totalInput,
            status: 'Draft',
            transactions: periodTransactions.map(t => t.id)
        };

        const db = await dbService.initDB();
        await db.put('vatReturns', newReturn);
        set(state => ({ returns: [...state.returns, newReturn] }));

        return newReturn;
    },

    fileReturn: async (returnId: string, paymentDate?: string) => {
        const { returns, transactions } = get();
        const vatReturn = returns.find(r => r.id === returnId);
        if (!vatReturn) return;

        const updatedReturn: VatReturn = {
            ...vatReturn,
            status: paymentDate ? 'Paid' : 'Filed',
            filingDate: new Date().toISOString(),
            paymentDate
        };

        // Mark transactions as filed
        const db = await dbService.initDB();
        const tx = db.transaction(['vatReturns', 'vatTransactions'], 'readwrite');

        await tx.objectStore('vatReturns').put(updatedReturn);

        for (const txId of vatReturn.transactions) {
            const t = transactions.find(tr => tr.id === txId);
            if (t) {
                const updatedT = { ...t, isFiled: true, returnId };
                await tx.objectStore('vatTransactions').put(updatedT);
            }
        }

        await tx.done;

        // Refresh state
        get().fetchVatData();
    }
}));
