import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useFinance } from './FinanceContext';
import { useInventory } from './InventoryContext';
import { useProduction } from './ProductionContext';
import { useSales } from './SalesContext';
import { useProcurement } from './ProcurementContext';
import { useOrders } from './OrdersContext';
import { useExamination } from './ExaminationContext';

export const REFRESH_INTERVAL = 300_000;
export const DASHBOARD_REFRESH_INTERVAL = 60_000;

// Create context first before using it
const DataContext = createContext<any>(undefined);

// Re-export everything from this file to maintain compatibility with components importing from DataContext
// The actual Logic sits in the sub-contexts.
// This "God Context" aggregates the values defensively.

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <LegacyDataAggregator>{children}</LegacyDataAggregator>
    );
};

const LegacyDataAggregator: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const auth = useAuth();
    const finance = useFinance();
    const inventory = useInventory();
    const production = useProduction();
    const sales = useSales();
    const procurement = useProcurement();
    const orders = useOrders();
    const examination = useExamination();

    // Defensive initialization to prevent 'undefined' errors on filter/map/reduce
    const defaults = {
        invoices: [],
        orders: [],
        workOrders: [],
        customerPayments: [],
        expenses: [],
        sales: [],
        tasks: [],
        inventory: [],
        accounts: [],
        ledger: [],
        alerts: [],
        reminders: [],
        customers: [],
        suppliers: [],
        budgets: [],
        quotations: [],
        recurringInvoices: [],
        batches: [],
        examinationBatches: [],
        boms: [],
        workCenters: [],
        resources: [],
        allocations: [],
        maintenanceLogs: [],
        auditLogs: [],
        interactions: [],
        shipments: [],
        goodsReceipts: [],
        warehouses: [],
        purchases: [],
        salesExchanges: [],
        reprintJobs: [],
        vatTransactions: [],
        vatReturns: [],
        marketAdjustments: [],
    };

    // Helper to merge contexts while ensuring arrays are never null/undefined
    const mergeContexts = (...contexts: any[]) => {
        const merged = { ...defaults };
        contexts.forEach(ctx => {
            if (!ctx) return;
            Object.keys(ctx).forEach(key => {
                const val = ctx[key];
                // Only overwrite if value is not null/undefined or if it's a non-array value
                if (val !== null && val !== undefined) {
                    merged[key] = val;
                }
            });
        });
        return merged;
    };

    const combinedValue = {
        ...mergeContexts(auth, finance, inventory, production, sales, procurement, orders),
        examination,
        examinationBatches: examination?.batches || [],
        examinationJobs: examination?.jobs || [],
        examinationGroups: examination?.groups || [],
        examinationRecurringProfiles: examination?.recurringProfiles || [],
        examinationBatchLoadError: examination?.batchLoadError || null,
    };
    const refreshInFlightRef = useRef(false);
    const queuedRefreshRef = useRef(false);
    const refreshTimerRef = useRef<number | null>(null);
    const pollTimerRef = useRef<number | null>(null);
    const channelRef = useRef<BroadcastChannel | null>(null);
    const lastRefreshAtRef = useRef(0);
    const instanceIdRef = useRef(`ctx-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    const refreshAllData = useCallback(async () => {
        if (refreshInFlightRef.current) {
            queuedRefreshRef.current = true;
            return;
        }
        refreshInFlightRef.current = true;
        await Promise.allSettled([
            finance.fetchFinanceData?.(),
            sales.fetchSalesData?.(),
            inventory.fetchInventoryData?.(),
            procurement.fetchProcurementData?.(),
            production.fetchProductionData?.(),
            orders.fetchOrders?.(),
            examination.loadAllData?.()
        ]);
        lastRefreshAtRef.current = Date.now();
        refreshInFlightRef.current = false;
        if (queuedRefreshRef.current) {
            queuedRefreshRef.current = false;
            await refreshAllData();
        }
    }, [finance, sales, inventory, procurement, production, orders, examination]);

    const queueRefresh = useCallback((delayMs = 120) => {
        if (refreshTimerRef.current) {
            window.clearTimeout(refreshTimerRef.current);
        }
        refreshTimerRef.current = window.setTimeout(() => {
            refreshAllData().catch(() => undefined);
        }, delayMs);
    }, [refreshAllData]);

    const startPolling = useCallback((intervalMs = REFRESH_INTERVAL) => {
        if (pollTimerRef.current) {
            window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
        }
        pollTimerRef.current = window.setInterval(() => {
            const isFresh = Date.now() - lastRefreshAtRef.current < 2000;
            if (!isFresh) {
                refreshAllData().catch(() => undefined);
            }
        }, intervalMs);
    }, [refreshAllData]);

    const stopPolling = useCallback(() => {
        if (!pollTimerRef.current) return;
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleLocalDataChange = (event: Event) => {
            const customEvent = event as CustomEvent<{ source?: string }>;
            if (customEvent.detail?.source && customEvent.detail.source === instanceIdRef.current) return;
            queueRefresh(80);
        };

        const handleStorageChange = (event: StorageEvent) => {
            if (event.key !== 'primeerp:data-changed') return;
            queueRefresh(120);
        };

        window.addEventListener('primeerp:data-changed', handleLocalDataChange as EventListener);
        window.addEventListener('storage', handleStorageChange);

        if (typeof BroadcastChannel !== 'undefined') {
            channelRef.current = new BroadcastChannel('primeerp-data-sync');
            channelRef.current.onmessage = (messageEvent) => {
                const payload = messageEvent.data || {};
                if (payload.source && payload.source === instanceIdRef.current) return;
                if (payload.type === 'data-changed') {
                    queueRefresh(80);
                }
            };
        }

        // Polling is now managed by individual modules via useModuleRefresh hook
        // startPolling();

        return () => {
            window.removeEventListener('primeerp:data-changed', handleLocalDataChange as EventListener);
            window.removeEventListener('storage', handleStorageChange);
            if (refreshTimerRef.current) {
                window.clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }
            stopPolling();
            if (channelRef.current) {
                channelRef.current.close();
                channelRef.current = null;
            }
        };
    }, [queueRefresh, refreshAllData, startPolling, stopPolling]);

    return (
        <DataContext.Provider value={{
            ...(combinedValue as any),
            ...examination,
            refreshAllData,
            startPolling,
            stopPolling
        } as any}>
            {children}
        </DataContext.Provider>
    );
}

export const useData = () => {
    const context = useContext(DataContext);
    if (!context) {
        throw new Error('useData must be used within a DataProvider (Legacy Aggregator)');
    }
    return context;
};
