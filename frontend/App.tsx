import React, { useEffect, useState, useRef, Suspense, lazy } from 'react';

import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Breadcrumbs from './components/Breadcrumbs';
import Toast from './components/Toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FinanceProvider } from './context/FinanceContext';
import { InventoryProvider } from './context/InventoryContext';
import { SalesProvider } from './context/SalesContext';
import { ProductionProvider } from './context/ProductionContext';
import { ProcurementProvider } from './context/ProcurementContext';
import { DataProvider, useData } from './context/DataContext';
import { useSales } from './context/SalesContext';
import { ExaminationProvider } from './context/ExaminationContext';
import { NotificationProvider } from './context/NotificationContext';
import { OrdersProvider } from './context/OrdersContext';
import { PwaInstallProvider, usePwaInstall } from './context/PwaInstallContext';
import PwaInstallBanner from './components/PwaInstallBanner';
import PwaUpdateNotification from './components/PwaUpdateNotification';
import PwaInstallPage from './views/PwaInstallPage';

import { ErrorBoundary } from './components/ErrorBoundary';
import { useDocumentStore } from './stores/documentStore.ts';
import { PreviewModal } from './views/shared/components/PDF/PreviewModal.tsx';
import { PdfWorker } from './views/shared/components/PDF/PdfWorker.tsx';
import { Bell, Loader2, Coins, X, Calculator, Menu } from 'lucide-react';
import { dbService } from './services/db';
import { PrimeDatabaseBootstrap } from './services/dexie/PrimeDatabaseBootstrap';
import Login from './views/auth/Login';
import SetupWizard from './views/auth/SetupWizard';
import { resolveAppAssetUrl } from './utils/runtime';
import { isResponsiveDebugEnabled } from './utils/debugFlags';


// Helper for lazy loading with retry logic to handle "Failed to fetch dynamically imported module" errors
// Includes a cooldown window to prevent infinite reload loops when IndexedDB initialization
// blocks the main thread and causes Vite HMR chunk load timeouts.
const lazyWithRetry = (name: string, componentImport: () => Promise<any>) =>
  lazy(async () => {
    const pageHasBeenForceRefreshed = JSON.parse(
      window.localStorage.getItem('page-has-been-force-refreshed') || 'false'
    );
    const lastRefreshAt = parseInt(window.localStorage.getItem('last-force-refresh-at') || '0', 10);
    const cooldownMs = 10000;

    try {
      const component = await componentImport();
      window.localStorage.setItem('page-has-been-force-refreshed', 'false');
      return component;
    } catch (error) {
      console.error('Lazy loading error:', {
        name,
        message: (error as any)?.message,
        stack: (error as any)?.stack,
        error
      });
      if (!pageHasBeenForceRefreshed || Date.now() - lastRefreshAt > cooldownMs) {
        // First failure or cooldown expired, try to refresh the page once
        window.localStorage.setItem('page-has-been-force-refreshed', 'true');
        window.localStorage.setItem('last-force-refresh-at', String(Date.now()));
        window.location.reload();
        throw error;
      }

      // If we already refreshed recently and it still fails, throw the error
      throw error;
    }
  });

// Lazy loaded views
const Dashboard = lazyWithRetry('./views/Dashboard', () => import('./views/Dashboard'));
const Inventory = lazyWithRetry('./views/Inventory', () => import('./views/Inventory'));
const Purchases = lazyWithRetry('./views/Purchases', () => import('./views/Purchases'));
const Suppliers = lazyWithRetry('./views/purchases/Suppliers', () => import('./views/purchases/Suppliers'));
const GoodsReceived = lazyWithRetry('./views/purchases/GoodsReceived', () => import('./views/purchases/GoodsReceived'));
const POS = lazyWithRetry('./views/POS', () => import('./views/POS'));
const Architect = lazyWithRetry('./views/Architect', () => import('./views/Architect'));
const WorkOrders = lazyWithRetry('./views/production/WorkOrders', () => import('./views/production/WorkOrders'));
const Scheduler = lazyWithRetry('./views/production/Scheduler', () => import('./views/production/Scheduler'));
const ShopFloor = lazyWithRetry('./views/production/ShopFloor', () => import('./views/production/ShopFloor'));
const ShopFloorKiosk = lazyWithRetry('./views/production/ShopFloorKiosk', () => import('./views/production/ShopFloorKiosk'));
const GangRunEstimator = lazyWithRetry('./views/production/GangRunEstimator', () => import('./views/production/GangRunEstimator'));
const MRP = lazyWithRetry('./views/production/MRP', () => import('./views/production/MRP'));
const MachineMaintenance = lazyWithRetry('./views/production/MachineMaintenance', () => import('./views/production/MachineMaintenance'));
const ExaminationHub = lazyWithRetry('./views/examination/ExaminationHub', () => import('./views/examination/ExaminationHub'));
const ExaminationBatchForm = lazyWithRetry('./views/examination/ExaminationBatchForm', () => import('./views/examination/ExaminationBatchForm'));
const ExaminationBatchDetail = lazyWithRetry('./views/examination/ExaminationBatchDetail', () => import('./views/examination/ExaminationBatchDetail'));
const ExaminationJobForm = lazyWithRetry('./views/examination/ExaminationJobForm', () => import('./views/examination/ExaminationJobForm'));
const InvoiceGroupManager = lazyWithRetry('./views/examination/InvoiceGroupManager', () => import('./views/examination/InvoiceGroupManager'));
const RecurringProfiles = lazyWithRetry('./views/examination/RecurringProfiles', () => import('./views/examination/RecurringProfiles'));
const ExaminationPrinting = lazyWithRetry('./views/production/ExaminationPrinting', () => import('./views/production/ExaminationPrinting'));
const Subcontracting = lazyWithRetry('./views/purchases/Subcontracting', () => import('./views/purchases/Subcontracting'));
const Expenses = lazyWithRetry('./views/accounts/Expenses', () => import('./views/accounts/Expenses'));
const IncomeView = lazyWithRetry('./views/accounts/Income', () => import('./views/accounts/Income'));
const ChartOfAccounts = lazyWithRetry('./views/accounts/ChartOfAccounts', () => import('./views/accounts/ChartOfAccounts'));
const FinancialReports = lazyWithRetry('./views/accounts/FinancialReports', () => import('./views/accounts/FinancialReports'));
const Reconciliation = lazyWithRetry('./views/accounts/Reconciliation', () => import('./views/accounts/Reconciliation'));
const Budgets = lazyWithRetry('./views/accounts/Budgets', () => import('./views/accounts/Budgets'));
const Banking = lazyWithRetry('./views/accounts/Banking', () => import('./views/accounts/Banking'));
const Transfers = lazyWithRetry('./views/accounts/Transfers', () => import('./views/accounts/Transfers'));
const Payroll = lazyWithRetry('./views/accounts/Payroll', () => import('./views/accounts/Payroll'));
const AuditLogs = lazyWithRetry('./views/AuditLogs', () => import('./views/AuditLogs'));
const Forecasting = lazyWithRetry('./views/Forecasting', () => import('./views/Forecasting'));
const SupplyChainHub = lazyWithRetry('./views/SupplyChainHub', () => import('./views/SupplyChainHub'));
const IndustrialHub = lazyWithRetry('./views/IndustrialHub', () => import('./views/IndustrialHub'));
const RevenueHub = lazyWithRetry('./views/RevenueHub', () => import('./views/RevenueHub'));
const RevenueDashboard = lazyWithRetry('./views/reports/RevenueDashboard', () => import('./views/reports/RevenueDashboard'));
const SalesFlowHub = lazyWithRetry('./views/SalesFlowHub', () => import('./views/SalesFlowHub'));
const SalesExchanges = lazyWithRetry('./views/sales/SalesExchanges', () => import('./views/sales/SalesExchanges'));
const LeadBoard = lazyWithRetry('./views/sales/LeadBoard', () => import('./views/sales/LeadBoard'));
const SalesOrdersView = lazyWithRetry('./views/sales/SalesOrders', () => import('./views/sales/SalesOrders'));
const ProcurementHub = lazyWithRetry('./views/ProcurementHub', () => import('./views/ProcurementHub'));
const CustomersHub = lazyWithRetry('./views/CustomersHub', () => import('./views/CustomersHub'));
const FiscalReportsHub = lazyWithRetry('./views/FiscalReportsHub', () => import('./views/FiscalReportsHub'));
const InternalToolsHub = lazyWithRetry('./views/InternalToolsHub', () => import('./views/InternalToolsHub'));
const Payments = lazyWithRetry('./views/sales/Payments', () => import('./views/sales/Payments'));
const Orders = lazyWithRetry('./views/sales/Orders', () => import('./views/sales/Orders'));
const JobTickets = lazyWithRetry('./views/sales/JobTickets', () => import('./views/sales/JobTickets'));
const Clients = lazyWithRetry('./views/sales/Clients', () => import('./views/sales/Clients'));
const ShippingManager = lazyWithRetry('./views/sales/ShippingManager', () => import('./views/sales/ShippingManager'));
const Tasks = lazyWithRetry('./views/Tasks', () => import('./views/Tasks'));
const Reports = lazyWithRetry('./views/Reports', () => import('./views/Reports'));
const Settings = lazyWithRetry('./views/Settings', () => import('./views/Settings'));
const ChatApp = lazyWithRetry('./views/apps/ChatApp', () => import('./views/apps/ChatApp'));
const UserManagement = lazyWithRetry('./views/admin/UserManagement', () => import('./views/admin/UserManagement'));
const ProfileActivity = lazyWithRetry('./views/admin/ProfileActivity', () => import('./views/admin/ProfileActivity'));
const BOMRecipes = lazyWithRetry('./views/production/BOMRecipes', () => import('./views/production/BOMRecipes'));
const DataImport = lazyWithRetry('./views/admin/DataImport', () => import('./views/admin/DataImport'));
const MigrationHealthDashboard = lazyWithRetry('./views/admin/MigrationHealthDashboard', () => import('./views/admin/MigrationHealthDashboard'));
const GlobalSearch = lazyWithRetry('./views/GlobalSearch', () => import('./views/GlobalSearch'));
const ChequeManager = lazyWithRetry('./views/tools/ChequeManager', () => import('./views/tools/ChequeManager'));
const VatView = lazyWithRetry('./views/vat/VatView', () => import('./views/vat/VatView'));
const BarcodePrinter = lazyWithRetry('./views/tools/BarcodePrinter', () => import('./views/tools/BarcodePrinter'));
const MarketAdjustments = lazyWithRetry('./views/tools/MarketAdjustments', () => import('./views/tools/MarketAdjustments'));
const SmartPricing = lazyWithRetry('./views/tools/SmartPricing', () => import('./views/tools/SmartPricing'));
const SmartOperationsHub = lazyWithRetry('./views/SmartOperationsHub', () => import('./views/SmartOperationsHub'));
const MarketingMessages = lazyWithRetry('./views/tools/MarketingMessages', () => import('./views/tools/MarketingMessages'));
const AIAssistant = lazyWithRetry('./views/tools/AIAssistant', () => import('./views/tools/AIAssistant'));

const BusinessHealthReport = lazyWithRetry('./views/reports/BusinessHealthReport', () => import('./views/reports/BusinessHealthReport'));
// VATReport removed

const PwaUpdateNotificationWrapper: React.FC = () => {
  const { updateAvailable, applyUpdate, dismissUpdate } = usePwaInstall();
  if (!updateAvailable) return null;
  return <PwaUpdateNotification onUpdate={applyUpdate} onDismiss={dismissUpdate} />;
};

const PageLoader = () => (
  <div className="h-full w-full flex flex-col items-center justify-center bg-slate-50/50 backdrop-blur-sm">
    <div className="relative">
      <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
      </div>
    </div>
    <p className="mt-4 text-sm font-medium text-slate-500 animate-pulse">Loading module...</p>
  </div>
);

const ProtectedRoute: React.FC<{ permission: string, children: React.ReactNode }> = ({ permission, children }) => {
  const { checkPermission } = useAuth();
  if (!checkPermission(permission)) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
        <div className="p-8 rounded-3xl bg-white/50 backdrop-blur-md text-center max-w-md border border-white shadow-soft">
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">Access Restricted</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">You don't have the required permission <code>{permission}</code> to view this module.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
};

const ReminderMonitor: React.FC = () => {
  const { notify, addAlert, reminders } = useAuth();
  const notifiedTasks = useRef<Set<string>>(new Set());

  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      (reminders || []).forEach((task: any) => {
        if (task.hasAlarm && task.reminderDate && !notifiedTasks.current.has(task.id)) {
          const reminderTime = new Date(task.reminderDate);
          if (reminderTime <= now && now.getTime() - reminderTime.getTime() < 5 * 60 * 1000) {
            notify(`TASK ALERT: ${task.text || task.title}`, 'info');

            addAlert({
              id: `ALERT-${task.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              message: `Task Due: ${task.text || task.title}. Details: ${task.notes || 'N/A'}`,
              type: 'System',
              date: new Date().toISOString(),
              severity: 'Medium'
            });

            notifiedTasks.current.add(task.id);
          }
        }
      });
    };

    const interval = setInterval(checkReminders, 30000);
    return () => clearInterval(interval);
  }, [reminders, notify, addAlert]);

  return null;
};

const ResponsiveDebugUtility: React.FC = () => {
  const isDev = isResponsiveDebugEnabled();
  const [width, setWidth] = useState(() => window.innerWidth);
  const [breakpoint, setBreakpoint] = useState(() => {
    if (window.innerWidth <= 767) return 'mobile';
    if (window.innerWidth <= 1024) return 'tablet';
    if (window.innerWidth <= 1439) return 'desktop';
    return 'wide';
  });

  useEffect(() => {
    if (!isDev) return;
    const getBreakpoint = (nextWidth: number) => {
      if (nextWidth <= 767) return 'mobile';
      if (nextWidth <= 1024) return 'tablet';
      if (nextWidth <= 1439) return 'desktop';
      return 'wide';
    };

    const handleResize = () => {
      const nextWidth = window.innerWidth;
      const nextBreakpoint = getBreakpoint(nextWidth);
      setWidth(nextWidth);
      setBreakpoint((current) => {
        if (current !== nextBreakpoint) {
          console.info(`[ResponsiveDebug] breakpoint ${current} -> ${nextBreakpoint} (${nextWidth}px)`);
        }
        return nextBreakpoint;
      });
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [isDev]);

  if (!isDev) return null;

  return (
    <div className="fixed bottom-3 right-3 z-[10001] rounded-lg bg-slate-900/90 text-white px-3 py-2 shadow-lg backdrop-blur-sm pointer-events-none">
      <div className="text-[10px] font-bold uppercase tracking-wider">{breakpoint}</div>
      <div className="text-xs font-semibold leading-none mt-1">{width}px</div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  const location = useLocation();
  const { companyConfig, isOnline } = useAuth();
  const {
    isOpen,
    data,
    filePreview,
    type,
    closePreview
  } = useDocumentStore();
  const {
    isPosModalOpen,
    setIsPosModalOpen
  } = useSales();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const theme = companyConfig?.appearance?.theme || 'Light';
    const density = companyConfig?.appearance?.density || 'Comfortable';
    const radius = companyConfig?.appearance?.borderRadius || 'Medium';

    // Apply Theme
    if (theme === 'Dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'Light') {
      document.documentElement.classList.remove('dark');
    } else if (theme === 'System') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }

    // Apply Density
    if (density === 'Compact') {
      document.documentElement.classList.add('density-compact');
    } else {
      document.documentElement.classList.remove('density-compact');
    }

    // Apply Border Radius
    document.documentElement.classList.remove('radius-none', 'radius-small', 'radius-medium', 'radius-large', 'radius-full');
    document.documentElement.classList.add(`radius-${radius.toLowerCase()}`);

  }, [companyConfig?.appearance]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      dbService.triggerSync(true);
    };

    // Seed pricing templates on startup


    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    // Table responsiveness is now handled via CSS in index.css
    // avoid manual DOM manipulation that interferes with React
  }, []);

  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  return (
    <div className="app-layout-scroll">
      <div className="app-layout-frame flex h-screen bg-[var(--dashboard-bg)] overflow-hidden transition-colors duration-200">
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close Sidebar"
        />
      )}
      <ReminderMonitor />
      <Sidebar
        isOpen={sidebarOpen}
        toggle={() => setSidebarOpen(!sidebarOpen)}
        isCollapsed={sidebarCollapsed}
        toggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="app-content-shell flex-1 flex flex-col h-full min-w-0 transition-all duration-300">
        {/* Offline banner removed - this is an offline desktop app with embedded backend */}
        <div className="px-3 sm:px-6 pb-2 pt-3 sm:pt-6 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              className="md:hidden p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open Sidebar"
            >
              <Menu size={18} />
            </button>
            <div className="flex-1 min-w-0 overflow-hidden">
              <Breadcrumbs />
            </div>
          </div>
        </div>
        <main className="app-content-scroll flex-1 min-h-0 overflow-auto relative custom-scrollbar">

          <Toast />
          <PwaInstallBanner />
          <PwaUpdateNotificationWrapper />
          <ResponsiveDebugUtility />

          {/* Global PDF Preview Layer */}
          {(data || filePreview) && (
            <PreviewModal
              isOpen={isOpen}
              onClose={closePreview}
              file={filePreview}
              type={type}
              data={data}
            />
          )}

          {/* Global POS Modal Layer */}
          {isPosModalOpen && (
            <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-6xl h-full rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
                      <Coins size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-800 tracking-tight">Terminal POS</h2>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Live Transaction Interface</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsPosModalOpen(false)}
                    className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-600 transition-all active:scale-90"
                  >
                    <X size={24} />
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <ProtectedRoute permission="sales.pos">
                    <Suspense fallback={<PageLoader />}>
                      <POS />
                    </Suspense>
                  </ProtectedRoute>
                </div>
              </div>
            </div>
          )}



          <div className="h-full w-full min-w-0 min-h-full">
            <Suspense fallback={<PageLoader />}>
                <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/install" element={<PwaInstallPage />} />
                <Route path="/search" element={<GlobalSearch />} />

                {/* Hierarchical Redirects */}
                <Route path="/inventory" element={<Navigate to="/supply-chain/inventory" replace />} />
                <Route path="/purchases" element={<Navigate to="/procurement/bills" replace />} />
                <Route path="/purchases/grn" element={<Navigate to="/supply-chain/grn" replace />} />
                <Route path="/purchases/subcontracting" element={<Navigate to="/procurement/subcontracting" replace />} />
                <Route path="/pos" element={<Navigate to="/sales-flow/pos" replace />} />
                <Route path="/sales/quotations" element={<Navigate to="/sales-flow/quotations" replace />} />
                <Route path="/sales/invoices" element={<Navigate to="/sales-flow/invoices" replace />} />
                <Route path="/sales/shipping" element={<Navigate to="/supply-chain/shipping" replace />} />
                <Route path="/sales/subscriptions" element={<Navigate to="/sales-flow/subscriptions" replace />} />
                <Route path="/sales/receipts" element={<Navigate to="/sales-flow/payments" replace />} />
                <Route path="/sales-flow/receipts" element={<Navigate to="/sales-flow/payments" replace />} />
                <Route path="/sales-flow/commissions" element={<Navigate to="/revenue/sales-audit" replace />} />
                <Route path="/sales-flow/sms" element={<Navigate to="/internal-tools/chat" replace />} />
                <Route path="/reports/statements" element={<Navigate to="/revenue/contacts" replace />} />
                <Route path="/accounts/chart" element={<Navigate to="/accounts/chart-of-accounts" replace />} />
                <Route path="/revenue/dashboard" element={<ProtectedRoute permission="reports.view"><RevenueDashboard /></ProtectedRoute>} />
                <Route path="/revenue/sales-audit" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />
                <Route path="/revenue/margin-performance" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />
                <Route path="/revenue/rounding-analytics" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />
                <Route path="/revenue/contacts" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />
                <Route path="/revenue/auditor" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />
                <Route path="/revenue/intel" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />

                <Route path="/revenue/health" element={<ProtectedRoute permission="reports.view"><BusinessHealthReport /></ProtectedRoute>} />
                <Route path="/production/work-orders" element={<Navigate to="/industrial/work-orders" replace />} />
                <Route path="/production/scheduler" element={<Navigate to="/industrial/scheduler" replace />} />
                <Route path="/production/shop-floor" element={<Navigate to="/industrial/shop-floor" replace />} />
                <Route path="/production/kiosk" element={<Navigate to="/industrial/kiosk" replace />} />
                <Route path="/production/mrp" element={<Navigate to="/industrial/mrp" replace />} />
                <Route path="/production/examination-printing" element={<Navigate to="/examination/batches" replace />} />
                
                <Route path="/accounts/expenses" element={<Navigate to="/procurement/expenses" replace />} />
                <Route path="/accounts/reconciliation" element={<Navigate to="/fiscal-reports/reconciliation" replace />} />
                <Route path="/accounts/budgets" element={<Navigate to="/fiscal-reports/budgets" replace />} />
                <Route path="/accounts/financials" element={<Navigate to="/fiscal-reports/financials" replace />} />
                <Route path="/tools/cheques" element={<Navigate to="/internal-tools/cheques" replace />} />
                <Route path="/tools/barcodes" element={<Navigate to="/internal-tools/barcodes" replace />} />
                <Route path="/admin/import" element={<Navigate to="/internal-tools/import" replace />} />
                <Route path="/apps/chat" element={<Navigate to="/internal-tools/chat" replace />} />

                <Route path="/supply-chain" element={<SupplyChainHub />} />
                <Route path="/supply-chain/inventory" element={<Inventory />} />
                <Route path="/industrial" element={<IndustrialHub />} />
                <Route path="/revenue" element={<RevenueHub />} />
                <Route path="/customers" element={<CustomersHub />} />
                <Route path="/sales-flow" element={<SalesFlowHub />} />
                <Route path="/procurement" element={<ProcurementHub />} />
                <Route path="/fiscal-reports" element={<FiscalReportsHub />} />
                <Route path="/vat" element={<ProtectedRoute permission="accounts.view"><VatView /></ProtectedRoute>} />
                <Route path="/internal-tools" element={<InternalToolsHub />} />
                <Route path="/supply-chain/grn" element={<GoodsReceived />} />
                <Route path="/supply-chain/shipping" element={<ProtectedRoute permission="sales.view"><ShippingManager /></ProtectedRoute>} />
                <Route path="/supply-chain/forecasting" element={<Forecasting />} />
                <Route path="/industrial/work-orders" element={<ProtectedRoute permission="production.view"><WorkOrders /></ProtectedRoute>} />
                <Route path="/industrial/scheduler" element={<ProtectedRoute permission="production.view"><Scheduler /></ProtectedRoute>} />
                <Route path="/industrial/shop-floor" element={<ProtectedRoute permission="production.view"><ShopFloor /></ProtectedRoute>} />
                <Route path="/industrial/kiosk" element={<ProtectedRoute permission="production.view"><ShopFloorKiosk /></ProtectedRoute>} />
                <Route path="/industrial/mrp" element={<ProtectedRoute permission="production.view"><MRP /></ProtectedRoute>} />
                <Route path="/industrial/bom-recipes" element={<ProtectedRoute permission="production.view"><BOMRecipes /></ProtectedRoute>} />
                <Route path="/sales-flow/pos" element={<ProtectedRoute permission="sales.pos"><POS /></ProtectedRoute>} />
                <Route path="/sales-flow/quotations" element={<ProtectedRoute permission="sales.view"><Orders /></ProtectedRoute>} />
                <Route path="/sales-flow/orders" element={<ProtectedRoute permission="sales.view"><Orders /></ProtectedRoute>} />
                <Route path="/sales-flow/invoices" element={<ProtectedRoute permission="sales.view"><Orders /></ProtectedRoute>} />
                <Route path="/sales-flow/subscriptions" element={<ProtectedRoute permission="sales.view"><Orders /></ProtectedRoute>} />
                <Route path="/sales-flow/exchanges" element={<ProtectedRoute permission="sales.view"><SalesExchanges /></ProtectedRoute>} />
                <Route path="/sales-flow/leads" element={<ProtectedRoute permission="sales.view"><LeadBoard /></ProtectedRoute>} />
                <Route path="/sales-flow/sales-orders" element={<ProtectedRoute permission="sales.view"><SalesOrdersView /></ProtectedRoute>} />
                <Route path="/sales-flow/job-tickets" element={<ProtectedRoute permission="sales.view"><JobTickets /></ProtectedRoute>} />
                <Route path="/sales-flow/tasks" element={<Tasks />} />
                <Route path="/sales-flow/customers" element={<Navigate to="/sales-flow/clients" replace />} />
                <Route path="/sales-flow/clients" element={<ProtectedRoute permission="sales.view"><Clients /></ProtectedRoute>} />
                <Route path="/procurement/bills" element={<Purchases />} />
                <Route path="/procurement/suppliers" element={<ProtectedRoute permission="procurement.view"><Suppliers /></ProtectedRoute>} />
                <Route path="/procurement/subcontracting" element={<Subcontracting />} />
                <Route path="/procurement/expenses" element={<ProtectedRoute permission="accounts.view"><Expenses /></ProtectedRoute>} />
                <Route path="/fiscal-reports/financials" element={<ProtectedRoute permission="accounts.view"><FinancialReports /></ProtectedRoute>} />
                <Route path="/fiscal-reports/reconciliation" element={<ProtectedRoute permission="accounts.view"><Reconciliation /></ProtectedRoute>} />
                <Route path="/fiscal-reports/budgets" element={<ProtectedRoute permission="accounts.view"><Budgets /></ProtectedRoute>} />
                <Route path="/fiscal-reports/vat" element={<Navigate to="/fiscal-reports" replace />} />
                <Route path="/internal-tools/cheques" element={<ChequeManager />} />
                <Route path="/internal-tools/barcodes" element={<BarcodePrinter />} />
                <Route path="/internal-tools/import" element={<DataImport />} />
                <Route path="/smart-operations" element={<SmartOperationsHub />} />
                <Route path="/smart-operations/ai" element={<AIAssistant />} />
                <Route path="/smart-operations/adjustments" element={<MarketAdjustments />} />
                <Route path="/smart-operations/pricing" element={<SmartPricing />} />
                <Route path="/smart-operations/messages" element={<MarketingMessages />} />

                <Route path="/reports" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />
                <Route path="/audit" element={<AuditLogs />} />
                <Route path="/admin/users" element={<ProtectedRoute permission="admin.users"><UserManagement /></ProtectedRoute>} />
                <Route path="/admin/profile" element={<ProfileActivity />} />
                <Route path="/admin/migration-health" element={<ProtectedRoute permission="admin.settings"><MigrationHealthDashboard /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute permission="admin.settings"><Settings /></ProtectedRoute>} />
                <Route path="/accounts/income" element={<ProtectedRoute permission="accounts.view"><IncomeView /></ProtectedRoute>} />
                <Route path="/accounts/banking" element={<ProtectedRoute permission="accounts.view"><Banking /></ProtectedRoute>} />
                <Route path="/accounts/transfers" element={<ProtectedRoute permission="accounts.view"><Transfers /></ProtectedRoute>} />
                <Route path="/accounts/payroll" element={<ProtectedRoute permission="accounts.view"><Payroll /></ProtectedRoute>} />
                <Route path="/accounts/chart-of-accounts" element={<ProtectedRoute permission="accounts.view"><ChartOfAccounts /></ProtectedRoute>} />
                <Route path="/industrial/maintenance" element={<ProtectedRoute permission="production.view"><MachineMaintenance /></ProtectedRoute>} />
                <Route path="/industrial/gang-run" element={<ProtectedRoute permission="production.view"><GangRunEstimator /></ProtectedRoute>} />
                <Route path="/industrial/exams" element={<Navigate to="/industrial" replace />} />
                <Route path="/examination" element={<Navigate to="/examination/batches" replace />} />
                <Route path="/examination/batches" element={<ProtectedRoute permission="production.view"><ExaminationHub /></ProtectedRoute>} />
                <Route path="/examination/batches/new" element={<ProtectedRoute permission="production.view"><ExaminationBatchForm /></ProtectedRoute>} />
                <Route path="/examination/batches/:id" element={<ProtectedRoute permission="production.view"><ExaminationBatchDetail /></ProtectedRoute>} />
                <Route path="/examination/jobs/new" element={<ProtectedRoute permission="production.view"><ExaminationJobForm /></ProtectedRoute>} />
                <Route path="/examination/jobs/:id" element={<ProtectedRoute permission="production.view"><ExaminationJobForm /></ProtectedRoute>} />
                <Route path="/examination/groups" element={<ProtectedRoute permission="production.view"><InvoiceGroupManager /></ProtectedRoute>} />
                <Route path="/examination/recurring" element={<ProtectedRoute permission="production.view"><RecurringProfiles /></ProtectedRoute>} />
                <Route path="/sales-flow/payments" element={<ProtectedRoute permission="sales.view"><Payments /></ProtectedRoute>} />
                <Route path="/procurement/payments" element={<ProtectedRoute permission="procurement.view"><Payments /></ProtectedRoute>} />
                <Route path="/sales" element={<Navigate to="/sales-flow" replace />} />
                <Route path="/production" element={<Navigate to="/industrial" replace />} />
                <Route path="/accounts" element={<Navigate to="/fiscal-reports" replace />} />
                <Route path="/admin" element={<Navigate to="/settings" replace />} />
                <Route path="/architect" element={<Architect />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
          </Suspense>
          </div>
        </main>
      </div>
      </div>
    </div>
  );
};

const RootNavigator: React.FC = () => {
  const { user, isInitialized, requiresSetup } = useAuth();
  const [isResetting, setIsResetting] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    const handleDbBlocked = () => {
      setDbError("Database access blocked by another tab. Please close other instances of Prime ERP and refresh this page.");
    };
    window.addEventListener('nexus-db-blocked', handleDbBlocked);
    return () => window.removeEventListener('nexus-db-blocked', handleDbBlocked);
  }, []);

  const handleFactoryReset = async () => {
    if (window.confirm("CRITICAL: This will delete ALL local data and reset the system. Continue?")) {
      setIsResetting(true);
      try {
        await dbService.factoryReset();
        window.location.reload();
      } catch (err) {
        alert("Reset failed: " + (err instanceof Error ? err.message : "Unknown error"));
        setIsResetting(false);
      }
    }
  };

  if (!isInitialized || isResetting) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#F5F7F9] overflow-hidden">
        {/* Decorative Background Accents */}
        <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px] animate-pulse" />
        <div className="fixed bottom-0 left-0 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[120px] animate-pulse delay-700" />
        
        <div className="flex flex-col items-center gap-8 relative z-10">
          {/* Logo & Spinner Container */}
          <div className="relative">
            <div className="w-24 h-24 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <img src={resolveAppAssetUrl('/pwa-icon-192x192.png')} alt="Prime ERP" className="w-14 h-14 rounded-2xl shadow-lg shadow-blue-200 animate-pulse-subtle" />
            </div>
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tight animate-fade-in">
              Prime <span className="text-blue-600">ERP</span> System
            </h1>
            <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] animate-pulse">
              {isResetting ? "Resetting System Data..." : dbError || "Initializing Secure Environment..."}
            </p>
          </div>

          {/* Loading Progress */}
          <div className="w-64 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full animate-progress-indeterminate"></div>
          </div>

          {dbError && (
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95"
            >
              Refresh Page
            </button>
          )}

          {!isResetting && !dbError && (
            <button
              onClick={handleFactoryReset}
              className="mt-8 px-4 py-2 text-[10px] font-black text-slate-300 hover:text-red-500 uppercase tracking-[0.2em] transition-all border border-transparent hover:border-red-100 hover:bg-red-50 rounded-lg"
            >
              System Maintenance
            </button>
          )}
        </div>
      </div>
    );
  }

  if (requiresSetup) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/setup" element={<SetupWizard />} />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      </Suspense>
    );
  }

  if (!user) {
    return (
      <PwaInstallProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/install" element={<PwaInstallPage />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </PwaInstallProvider>
    );
  }

  return (
    <PwaInstallProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="*" element={<AppLayout />} />
        </Routes>
      </Suspense>
    </PwaInstallProvider>
  );
};

const App: React.FC = () => {
  // PDF worker mode: headless window for off-thread PDF generation
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  if (urlParams.get('worker') === 'true') {
    return <PdfWorker />;
  }

  return (
    <HashRouter>
      <ErrorBoundary>
        <PrimeDatabaseBootstrap>
          <NotificationProvider>
            <AuthProvider>
              <FinanceProvider>
                <InventoryProvider>
                  <ProductionProvider>
                    <ExaminationProvider>
                      <ProcurementProvider>
                        <SalesProvider>
                          <OrdersProvider>
                            <DataProvider>
                                <RootNavigator />
                              </DataProvider>
                          </OrdersProvider>
                        </SalesProvider>
                      </ProcurementProvider>
                    </ExaminationProvider>
                  </ProductionProvider>
                </InventoryProvider>
              </FinanceProvider>
            </AuthProvider>
          </NotificationProvider>
        </PrimeDatabaseBootstrap>
      </ErrorBoundary>
    </HashRouter>
  );
};

export default App;
