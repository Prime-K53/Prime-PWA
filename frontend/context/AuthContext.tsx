import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole, UserGroup, PasswordPolicy, CompanyConfig, AuditLogEntry, SystemAlert, Reminder } from '../types';
import { INITIAL_USER_GROUPS, AVAILABLE_PERMISSIONS } from '../constants';
import { generateNextId } from '../utils/helpers';
import { dbService } from '../services/db';
import { DEFAULT_PRICING_SETTINGS } from '../services/pricingRoundingService';
import { syncDocumentNumberSeriesConfig } from '../services/documentNumberService';
import { publishSystemAlert } from '../services/systemAlertService';
import { isPasswordProtectionEnabled, normalizeSecuritySettings, withNormalizedSecurityConfig } from '../utils/securitySettings';
import { DEFAULT_SHARED_NUMBERING_RULE, normalizeCompanyNumberingConfig } from '../utils/numbering';
import { hydrateCompanyPdfAssets } from '../utils/companyAssetUtils';
import { supabase } from '../services/supabaseClient';

const SUPABASE_ENABLED = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_ANON_KEY &&
  import.meta.env.VITE_SUPABASE_URL !== 'https://placeholder.supabase.co'
);

interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface AuditParams {
    action: AuditLogEntry['action'];
    entityType: string;
    entityId: string;
    details: string;
    oldValue?: any;
    newValue?: any;
    reason?: string;
}

interface AuthContextType {
  user: User | null;
  allUsers: User[];
  userGroups: UserGroup[];
  passwordPolicy: PasswordPolicy;
  companyConfig: CompanyConfig;
  requiresSetup: boolean;
  notification: Notification | null;
  auditLogs: AuditLogEntry[];
  alerts: SystemAlert[];
  isInitialized: boolean;
  activeFinancialYear: number;
  reminders: Reminder[];
  isOnline: boolean;
  dbSyncStatus: 'idle' | 'connected' | 'syncing' | 'error' | 'restricted';
  lastSyncTime: string | null;
  
  notify: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  clearNotification: () => void;
  login: (username: string, password?: string, mfaCode?: string) => Promise<'SUCCESS' | 'INVALID' | 'MFA_REQUIRED' | 'EXPIRED'>;
  logout: () => void;
  checkPermission: (permissionId: string) => boolean;
  validatePasswordStrength: (password: string) => { valid: boolean; errors: string[] };
  
  manageUser: (user: User) => Promise<void>;
  deleteUser: (id: string) => void;
  manageUserGroup: (group: UserGroup) => void;
  deleteUserGroup: (id: string) => void;
  updatePasswordPolicy: (policy: PasswordPolicy) => void;
  updateCompanyConfig: (config: CompanyConfig) => void;
  
  addAuditLog: (params: AuditParams) => void;
  addAlert: (alert: SystemAlert) => void;
  dismissAlert: (id: string) => void;
  clearAlerts: () => void;
  resetSystem: () => Promise<void>;
  completeSetup: (config: CompanyConfig, adminUser: User) => Promise<void>;
  setFinancialYear: (year: number) => void;

  addReminder: (text: string, dueDate?: string) => void;
  toggleReminder: (id: string) => void;
  deleteReminder: (id: string) => void;
  
  connectDbSync: () => Promise<void>;
  manualDownloadBackup: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getEmailForUser(username: string, domain = 'prime-erp.local'): string {
  if (username.includes('@')) return username;
  return `${username}@${domain}`;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [requiresSetup, setRequiresSetup] = useState<boolean>(false);

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [userGroups, setUserGroups] = useState<UserGroup[]>(INITIAL_USER_GROUPS);
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy>({ minLength: 8, requireSpecialChar: true, requireNumber: true, expirationDays: 90 });
  
  const defaultCompanyConfig = {
      companyName: 'Prime ERP', 
      country: 'Malawi', 
      addressLine1: 'Main Street', 
      city: 'Dedza', 
      phone: '0884 528 222', 
      email: 'info@primeerp.com', 
      currencySymbol: 'K',
      monthlyRevenueTarget: 50000,
      financialYearStart: 'January',
      fiscalYearEndMonth: 'December',
      dateFormat: 'DD/MM/YYYY',
      decimalPlaceAmount: 2,
      decimalPlaceQuantity: 2,
      currencyFormat: 'Symbol First',
      timezone: 'Africa/Blantyre',
      languageCode: 'en-MW',
      templateStyle: 'Modern',
      fontStyle: 'Inter',
      showCompanyHeader: true,
      showCompanyLogo: true,
      appearance: {
          theme: 'Light',
          glassmorphism: false,
          density: 'Comfortable',
          borderRadius: 'Medium',
          enableAnimations: true,
          sidebarStyle: 'Full'
      },
      inventorySettings: {
          valuationMethod: 'AVCO',
          allowNegativeStock: false,
          autoBarcode: true,
          trackBatches: true,
          trackSerialNumbers: false,
          defaultWarehouseId: 'WH-MAIN',
          lowStockAlerts: true
      },
      productionSettings: {
          autoConsumeMaterials: false,
          requireQAApproval: false,
          allowOverproduction: false,
          trackMachineDownTime: true,
          showKioskSummary: true,
          defaultWorkCenterId: 'WC-MAIN',
          defaultExamBomId: 'BOM-EXAM-STD',
          finishingOptions: []
      },
      enabledModules: {
          manufacturing: true,
          loyalty: true,
          accounting: true,
          payroll: true,
          crm: true,
          multiWarehouse: true
      },
      glMapping: {
          defaultSalesAccount: '4000',
          defaultInventoryAccount: '1200',
          defaultCOGSAccount: '5000',
          accountsReceivable: '1100',
          accountsPayable: '2000',
          cashDrawerAccount: '1000',
          bankAccount: '1050',
          salesReturnAccount: '4100',
          customerDepositAccount: '2200',
          otherIncomeAccount: '4900',
           defaultExpenseAccount: '6100',
           defaultLaborWagesAccount: '6300',
           retainedEarningsAccount: '3000'
      },
      transactionSettings: {
          allowBackdating: true,
          backdatingLimitDays: 30,
          allowPartialFulfillment: true,
          voidingWindowHours: 24,
          enforceCreditLimit: 'None',
          defaultPaymentTermsDays: 30,
          quotationExpiryDays: 30,
          autoPrintReceipt: true,
          quickItemEntry: true,
          defaultPOSWarehouse: 'WH-MAIN',
          posDefaultCustomer: '',
          allowFutureDating: true,
          numbering: {
            shared: { ...DEFAULT_SHARED_NUMBERING_RULE }
          },
          approvalThresholds: {},
          paymentDetails: {
            bankAccounts: [],
            mobileMoneyAccounts: []
          },
          pos: {
              allowReturns: true,
              requireCustomer: false,
              enableShortcuts: true,
              showItemImages: true,
              gridColumns: 5,
              photocopyPrice: 0,
              typePrintingPrice: 0,
              staplePrice: 0,
              allowDiscounts: true,
              showCategoryFilters: true,
              receiptFooter: '',
              defaultPaymentMethod: 'Cash',
              photocopyCostPerPage: 0,
              typePrintingCostPerPage: 0,
              showShortcutHints: true,
              shortcutLabels: { F1: '', F2: '', F3: '', F10: '' }
          }
      },
      pricingSettings: { ...DEFAULT_PRICING_SETTINGS },
      integrationSettings: {
        externalApis: [],
        webhooks: []
      },
      invoiceTemplates: {
        engine: 'Standard',
        accentColor: '#3b82f6',
        companyNameFontSize: 18,
        bodyFontSize: 12,
        fontFamily: 'Helvetica',
        logoWidth: 140,
        showCompanyLogo: true,
        showPaymentTerms: true,
        showDueDate: true,
        showOutstandingAndWalletBalances: false
      },
      cloudSync: {
        enabled: SUPABASE_ENABLED,
        apiUrl: import.meta.env.VITE_SUPABASE_URL || '',
        apiKey: '',
        autoSyncEnabled: true,
        syncIntervalMinutes: 15
      },
      securitySettings: {
        ...normalizeSecuritySettings()
      },
      security: {
        passwordRequired: true,
        enforceComplexity: true
      },
      roundingRules: {
        method: 'Nearest',
        precision: 2
      },
      notificationSettings: {
        customerActivityNotifications: true,
        smsGatewayEnabled: false,
        emailGatewayEnabled: false
      },
      backupFrequency: 'Daily'
  };

  const [companyConfig, setCompanyConfig] = useState<CompanyConfig>(() => withNormalizedSecurityConfig(defaultCompanyConfig as any));

  const [notification, setNotification] = useState<Notification | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [activeFinancialYear, setActiveFinancialYear] = useState<number>(new Date().getFullYear());
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [dbSyncStatus, setDbSyncStatus] = useState<'idle' | 'connected' | 'syncing' | 'error' | 'restricted'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(localStorage.getItem('nexus_last_sync'));

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const syncSupabaseUserToLocal = useCallback(async (supabaseUser: import('@supabase/supabase-js').User): Promise<User | null> => {
    try {
      const localUsers = await dbService.getAll<User>('users');
      const match = localUsers.find(u => u.email === supabaseUser.email || u.id === supabaseUser.id);
      if (match) {
        return { ...match, id: supabaseUser.id, tokenExpiry: undefined };
      }
      const supabaseProfile: User = {
        id: supabaseUser.id,
        username: supabaseUser.user_metadata?.username || supabaseUser.email?.split('@')[0] || 'user',
        fullName: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'User',
        name: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'User',
        email: supabaseUser.email || '',
        role: (supabaseUser.user_metadata?.role || 'User') as UserRole,
        status: 'Active',
        active: true,
        isSuperAdmin: supabaseUser.user_metadata?.is_super_admin === true,
        securityLevel: 'Standard',
        groupIds: supabaseUser.user_metadata?.group_ids || ['GRP-USER'],
        authMode: 'supabase'
      };
      await dbService.put('users', supabaseProfile);
      return supabaseProfile;
    } catch {
      const fallback: User = {
        id: supabaseUser.id,
        username: supabaseUser.email?.split('@')[0] || 'user',
        fullName: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'User',
        name: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'User',
        email: supabaseUser.email || '',
        role: 'User',
        status: 'Active',
        active: true,
        isSuperAdmin: false,
        securityLevel: 'Standard',
        groupIds: ['GRP-USER'],
        authMode: 'supabase'
      };
      return fallback;
    }
  }, []);

  useEffect(() => {
    const loadInitData = async () => {
      const failsafe = setTimeout(() => {
        if (!isInitialized) {
          setIsInitialized(true);
        }
      }, 25000);

      try {
        const savedConfig = localStorage.getItem('nexus_company_config');
        let parsedConfig: CompanyConfig | null = null;
        if (savedConfig) {
          try {
            const rawConfig = JSON.parse(savedConfig);
            parsedConfig = withNormalizedSecurityConfig(normalizeCompanyNumberingConfig({
              ...defaultCompanyConfig,
              ...rawConfig,
              pricingSettings: {
                ...DEFAULT_PRICING_SETTINGS,
                ...(rawConfig?.pricingSettings || {})
              }
            }));
            parsedConfig = await hydrateCompanyPdfAssets(parsedConfig);
            setCompanyConfig(parsedConfig);
            localStorage.setItem('nexus_company_config', JSON.stringify(parsedConfig));
          } catch (err) {
            console.error("[Auth] Failed to parse company config:", err);
          }
        }

        let restoredSession: User | null = null;

        if (SUPABASE_ENABLED) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
              const profile = await syncSupabaseUserToLocal(session.user);
              if (profile) restoredSession = profile;
            }
          } catch {
            await supabase.auth.signOut();
          }
        } else {
          const raw = sessionStorage.getItem('nexus_user');
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              const expiry = parsed?.tokenExpiry ? new Date(parsed.tokenExpiry).getTime() : 0;
              if (expiry && expiry > Date.now()) {
                restoredSession = parsed;
              } else {
                sessionStorage.removeItem('nexus_user');
              }
            } catch {
              sessionStorage.removeItem('nexus_user');
            }
          }
        }

        const [u, groups] = await Promise.all([
            dbService.getAll<User>('users'),
            dbService.getAll<UserGroup>('userGroups')
        ]);
        
        setAllUsers(u);
        setUserGroups(groups);
        const effectiveConfig = withNormalizedSecurityConfig((parsedConfig || defaultCompanyConfig) as any);
        const hasCompanyData = Boolean(parsedConfig?.companyName?.trim());
        const hasUsers = u.length > 0;
        const initializedFlag = localStorage.getItem('nexus_initialized') === 'true';
        const setupComplete = hasCompanyData && hasUsers;

        if (setupComplete && !initializedFlag) {
          localStorage.setItem('nexus_initialized', 'true');
        }
        if (!setupComplete) {
          setUser(null);
        } else if (restoredSession) {
          setUser(restoredSession);
        }
        setRequiresSetup(!setupComplete);

        const [logs, storedAlerts, storedReminders] = await Promise.all([
            dbService.getAll<AuditLogEntry>('auditLogs'),
            dbService.getAll<SystemAlert>('alerts'),
            dbService.getAll<Reminder>('reminders')
        ]);

        setAuditLogs(logs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setAlerts(storedAlerts.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setReminders(storedReminders.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

        const integrity = await dbService.checkIntegrity();
        if (!integrity.healthy) {
            console.error("[Auth] Database Integrity Issues:", integrity.issues);
        }

        dbService.setSyncListener((status) => {
            setDbSyncStatus(status);
            if (status === 'connected') setLastSyncTime(new Date().toISOString());
        });

        if (parsedConfig?.companyName) {
            try {
                await (window as any).api?.system?.initializeWorkspace(parsedConfig.companyName);
            } catch (wsErr) {
                console.warn("[Auth] Workspace initialization skipped:", wsErr);
            }
        }

        if (SUPABASE_ENABLED && setupComplete) {
          try {
            const { startPeriodicSync } = await import('../services/syncService');
            console.log("[Auth] Sync service available (data syncing to Supabase is ready)");
          } catch (syncErr) {
            console.warn("[Auth] Sync service init skipped:", syncErr);
          }
        }

      } catch (err) {
        console.error("[Auth] Critical system initialization failure:", err);
      } finally {
        clearTimeout(failsafe);
        setIsInitialized(true);
      }

      const lastBackup = localStorage.getItem('prime_erp_backup_date');
      const oneDay = 24 * 60 * 60 * 1000;
      if (!lastBackup || (Date.now() - new Date(lastBackup).getTime() > oneDay)) {
          dbService.performAutoBackup();
      }
    };
    loadInitData();
  }, []);

  useEffect(() => {
    if (!SUPABASE_ENABLED) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const profile = await syncSupabaseUserToLocal(session.user);
        if (profile) {
          setUser(profile);
          const currentUsers = await dbService.getAll<User>('users');
          setAllUsers(currentUsers);
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      } else if (event === 'TOKEN_REFRESHED') {
        if (session?.user && user) {
          const profile = await syncSupabaseUserToLocal(session.user);
          if (profile) setUser(profile);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [syncSupabaseUserToLocal, user]);

  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning') => {
    setNotification({ id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, message, type });
  }, []);

  const clearNotification = useCallback(() => {
    setNotification(null);
  }, []);

  const addAuditLog = useCallback(async (params: AuditParams) => {
    const entry: AuditLogEntry = {
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        date: new Date().toISOString(),
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        details: params.details,
        userId: user?.username || 'system',
        userRole: user?.role || 'System',
        oldValue: params.oldValue,
        newValue: params.newValue,
        reason: params.reason
    };
    setAuditLogs(prev => [entry, ...prev]);
    await dbService.put('auditLogs', entry);
  }, [user]);

  const login = useCallback(async (username: string, password?: string, mfaCode?: string): Promise<'SUCCESS' | 'INVALID' | 'MFA_REQUIRED' | 'EXPIRED'> => {
    try {
        if (requiresSetup) {
            return 'INVALID';
        }

        if (SUPABASE_ENABLED) {
          if (!password) {
            const dbUsersLocal = await dbService.getAll<User>('users');
            const localFound = dbUsersLocal.find(u => u.username.toLowerCase() === username.toLowerCase());
            if (localFound && !localFound.password) {
              setUser({ ...localFound, authMode: 'local' });
              return 'SUCCESS';
            }
            return 'INVALID';
          }
          const email = getEmailForUser(username);
          const { data: signInData, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error) {
            const dbUsersLocal = await dbService.getAll<User>('users');
            const localFound = dbUsersLocal.find(u => u.username.toLowerCase() === username.toLowerCase());
            if (localFound && localFound.password) {
              const hashPassword = async (text: string): Promise<string> => {
                if (!text) return '';
                if (!window.isSecureContext || !crypto.subtle) {
                  let hash = 0;
                  const salt = 'PrimeERP2024';
                  for (let i = 0; i < text.length; i++) {
                    const code = text.charCodeAt(i);
                    hash = ((hash << 7) - hash) + code + (salt.charCodeAt(i % salt.length) << 4);
                    hash = hash & 0x7FFFFFFF;
                  }
                  let h2 = 0;
                  for (let i = 0; i < text.length; i++) {
                    h2 = ((h2 << 5) - h2) + text.charCodeAt(i);
                    h2 = h2 & 0x7FFFFFFF;
                  }
                  return `INSECURE_${Math.abs(hash).toString(16).padStart(8, '0')}${Math.abs(h2).toString(16).padStart(8, '0')}`;
                }
                const msgBuffer = new TextEncoder().encode(text);
                const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
              };
              const isStoredHash = (value?: string) => !value ? false : value.startsWith('insecure_') || /^[a-f0-9]{64}$/i.test(value);
              const hashedInput = await hashPassword(password);
              const expectedPassword = isStoredHash(localFound.password) ? localFound.password : await hashPassword(localFound.password);
              if (expectedPassword === hashedInput) {
                setUser({ ...localFound, authMode: 'local' });
                return 'SUCCESS';
              }
            }
            return 'INVALID';
          }
          if (signInData?.user) {
            const localUsers = await dbService.getAll<User>('users');
            const match = localUsers.find(u => u.email === signInData.user!.email || u.id === signInData.user!.id);
            if (match) {
              setUser({ ...match, id: signInData.user.id, authMode: 'supabase' });
            }
          }
          return 'SUCCESS';
        }

        const dbUsers = await dbService.getAll<User>('users');
        const passwordProtectionEnabled = isPasswordProtectionEnabled(companyConfig);

        if (!passwordProtectionEnabled) {
            const fakeUser = dbUsers.find(u => u.isSuperAdmin || u.role === 'Admin') || {
              id: 'USR-LOCAL',
              username: username,
              fullName: username,
              name: username,
              email: getEmailForUser(username),
              role: 'Admin' as UserRole,
              status: 'Active' as const,
              active: true,
              isSuperAdmin: true,
              securityLevel: 'Elevated',
              groupIds: ['GRP-ADMIN'],
              authMode: 'anonymous'
            } as User;
            setUser(fakeUser);
            return 'SUCCESS';
        }
        
        const foundUser = dbUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!foundUser) {
            return 'INVALID';
        }
        
        if (foundUser.status !== 'Active') {
            return 'INVALID';
        }

        if (!foundUser.password || !password) {
            return 'INVALID';
        }

        const hashPassword = async (text: string): Promise<string> => {
          if (!text) return '';
          if (!window.isSecureContext || !crypto.subtle) {
            let hash = 0;
            const salt = 'PrimeERP2024';
            for (let i = 0; i < text.length; i++) {
              const code = text.charCodeAt(i);
              hash = ((hash << 7) - hash) + code + (salt.charCodeAt(i % salt.length) << 4);
              hash = hash & 0x7FFFFFFF;
            }
            let h2 = 0;
            for (let i = 0; i < text.length; i++) {
              h2 = ((h2 << 5) - h2) + text.charCodeAt(i);
              h2 = h2 & 0x7FFFFFFF;
            }
            return `INSECURE_${Math.abs(hash).toString(16).padStart(8, '0')}${Math.abs(h2).toString(16).padStart(8, '0')}`;
          }
          const msgBuffer = new TextEncoder().encode(text);
          const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        };

        const isStoredHash = (value?: string) => {
          if (!value) return false;
          return value.startsWith('insecure_') || /^[a-f0-9]{64}$/i.test(value);
        };

        const hashedInput = await hashPassword(password);
        const expectedPassword = isStoredHash(foundUser.password) ? foundUser.password : await hashPassword(foundUser.password);
        if (foundUser.password !== expectedPassword) {
            await dbService.put('users', { ...foundUser, password: expectedPassword });
        }
        if (expectedPassword !== hashedInput) {
            return 'INVALID';
        }

        if (foundUser.mfaEnabled) {
            if (!mfaCode) return 'MFA_REQUIRED';
            if (mfaCode.length !== 6) return 'INVALID';
        }

        setUser({ ...foundUser, authMode: 'local' });
        
        addAuditLog({
            action: 'LOGIN',
            entityType: 'User',
            entityId: foundUser.id,
            details: `User ${foundUser.username} logged in successfully.`
        }).catch(err => console.error("Failed to add login audit log:", err));

        return 'SUCCESS';
    } catch (err) {
        console.error("AuthContext: Login function error:", err);
        throw err;
    }
  }, [addAuditLog, companyConfig, requiresSetup, SUPABASE_ENABLED]);

  const logout = useCallback(() => {
    if (user) {
        addAuditLog({
            action: 'LOGIN',
            entityType: 'User',
            entityId: user.id,
            details: `User ${user.username} logged out.`
        });
        if (SUPABASE_ENABLED) {
          supabase.auth.signOut();
        }
        setUser(null);
        sessionStorage.removeItem('nexus_user');
    }
  }, [user, addAuditLog, SUPABASE_ENABLED]);

  const checkPermission = useCallback((permissionId: string) => {
    if (!user) return false;
    if (user.role === 'Admin' || user.isSuperAdmin || user.username.toLowerCase() === 'admin') return true;
    const groups = userGroups.filter(g => user.groupIds?.includes(g.id));
    return groups.some(g => g.permissions.includes(permissionId));
  }, [user, userGroups]);

  const validatePasswordStrength = useCallback((password: string) => {
    const errors: string[] = [];
    if (password.length < passwordPolicy.minLength) errors.push(`Minimum length ${passwordPolicy.minLength}`);
    if (passwordPolicy.requireNumber && !/\d/.test(password)) errors.push('Must contain a number');
    if (passwordPolicy.requireSpecialChar && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push('Must contain special character');
    return { valid: errors.length === 0, errors };
  }, [passwordPolicy]);

  const manageUser = async (u: User) => {
    const userData = { ...u, id: u.id || generateNextId('USR', allUsers, companyConfig) };

    if (SUPABASE_ENABLED && u.password) {
      const email = getEmailForUser(u.email || u.username);
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: u.password,
        options: {
          data: {
            username: u.username,
            full_name: u.fullName || u.name,
            role: u.role,
            is_super_admin: u.isSuperAdmin,
            group_ids: u.groupIds,
          }
        }
      });
      if (signUpError) {
        console.error('[Auth] Failed to create Supabase auth user:', signUpError);
      } else if (signUpData?.user) {
        try {
          await supabase.from('users').insert({
            id: signUpData.user.id,
            username: u.username || signUpData.user.email?.split('@')[0] || 'user',
            full_name: u.fullName || u.name,
            name: u.fullName || u.name,
            email: signUpData.user.email || u.email,
            role: u.role || 'User',
            is_super_admin: u.isSuperAdmin || false,
            group_ids: u.groupIds || [],
          });
        } catch (profileErr) {
          console.error('[Auth] Failed to create user profile:', profileErr);
        }
      }
    }

    await dbService.put('users', userData);
    
    setAllUsers(prev => {
      const exists = prev.some(item => item.id === userData.id);
      if (exists) {
        return prev.map(item => item.id === userData.id ? userData : item);
      }
      return [...prev, userData];
    });
    
    notify('User records synchronized', 'success');
  };

  const deleteUser = async (id: string) => {
    await dbService.delete('users', id);
    setAllUsers(prev => prev.filter(u => u.id !== id));
    notify('User account terminated', 'info');
  };

  const manageUserGroup = (group: UserGroup) => {
    const isNew = !group.id;
    const groupData = { ...group, id: group.id || generateNextId('GRP', userGroups, companyConfig) };
    setUserGroups(prev => isNew ? [...prev, groupData] : prev.map(g => g.id === groupData.id ? groupData : g));
    notify('Permission group saved', 'success');
  };

  const deleteUserGroup = (id: string) => {
    setUserGroups(prev => prev.filter(g => g.id !== id));
    notify('Permission group removed', 'info');
  };

  const updatePasswordPolicy = (policy: PasswordPolicy) => {
    setPasswordPolicy(policy);
    notify('Security policy updated', 'success');
  };

  const updateCompanyConfig = (config: CompanyConfig) => {
    const normalizedConfig: CompanyConfig = withNormalizedSecurityConfig(normalizeCompanyNumberingConfig({
      ...config,
      pricingSettings: {
        ...DEFAULT_PRICING_SETTINGS,
        ...(config.pricingSettings || {})
      }
    }));
    setCompanyConfig(normalizedConfig);
    localStorage.setItem('nexus_company_config', JSON.stringify(normalizedConfig));
    void syncDocumentNumberSeriesConfig(normalizedConfig).catch((error) => {
      console.error('Failed to sync document numbering configuration', error);
    });
    notify('System config saved', 'success');
  };

  const addAlert = useCallback(async (alert: SystemAlert) => {
    const persistedAlert = await publishSystemAlert({
      id: alert.id,
      type: alert.type,
      title: alert.title,
      message: alert.message,
      module: alert.module,
      severity: alert.severity,
      priority: alert.priority,
      actionUrl: alert.actionUrl,
      metadata: alert.metadata,
      date: alert.date,
      read: alert.read,
      readAt: alert.readAt
    });

    setAlerts(prev => [persistedAlert as any, ...prev.filter(a => a.id !== persistedAlert.id)]);
  }, []);

  const dismissAlert = useCallback(async (id: string) => {
    await dbService.delete('alerts', id);
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const clearAlerts = useCallback(async () => {
    const db = await dbService.initDB();
    const tx = db.transaction('alerts', 'readwrite');
    await tx.objectStore('alerts').clear();
    await tx.done;
    setAlerts([]);
  }, []);

  const resetSystem = async () => {
    if (SUPABASE_ENABLED) {
      await supabase.auth.signOut();
    }
    await dbService.factoryReset();
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  const completeSetup = async (config: CompanyConfig, adminUser: User) => {
    const normalizedConfig: CompanyConfig = withNormalizedSecurityConfig(normalizeCompanyNumberingConfig({
      ...defaultCompanyConfig,
      ...config,
      pricingSettings: {
        ...DEFAULT_PRICING_SETTINGS,
        ...(config.pricingSettings || {})
      }
    }));

    if (userGroups.length === 0) {
      for (const group of INITIAL_USER_GROUPS) {
        await dbService.put('userGroups', group);
      }
      setUserGroups(INITIAL_USER_GROUPS);
    }

    setCompanyConfig(normalizedConfig);
    localStorage.setItem('nexus_company_config', JSON.stringify(normalizedConfig));

    await manageUser({
      ...adminUser,
      role: 'Admin',
      status: 'Active',
      active: true,
      isSuperAdmin: true,
      groupIds: adminUser.groupIds?.length ? adminUser.groupIds : ['GRP-ADMIN']
    });
    const updatedUsers = await dbService.getAll<User>('users');
    setAllUsers(updatedUsers);
    localStorage.setItem('nexus_initialized', 'true');
    setRequiresSetup(false);
    setIsInitialized(true);

    try {
      const { api } = await import('../services/api');
      await api.system.initializeWorkspace(normalizedConfig.companyName);
    } catch (err) {
      console.warn('Failed to initialize local workspace:', err);
    }

    if (!SUPABASE_ENABLED) {
      setUser(null);
    } else {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const profile = await syncSupabaseUserToLocal(session.user);
        if (profile) setUser(profile);
      }
    }
  };

  const setFinancialYear = (year: number) => setActiveFinancialYear(year);

  const addReminder = useCallback(async (text: string, date?: string) => {
      const r: Reminder = { id: `REM-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, text, date: date || new Date().toISOString(), completed: false };
      await dbService.put('reminders', r);
      setReminders(prev => [r, ...prev]);
  }, []);

  const toggleReminder = useCallback(async (id: string) => {
      const rem = reminders.find(r => r.id === id);
      if (rem) {
          const updated = { ...rem, completed: !rem.completed };
          await dbService.put('reminders', updated);
          setReminders(prev => prev.map(r => r.id === id ? updated : r));
      }
  }, [reminders]);

  const deleteReminder = useCallback(async (id: string) => {
      await dbService.delete('reminders', id);
      setReminders(prev => prev.filter(r => r.id !== id));
  }, []);

  const connectDbSync = async () => {
      await dbService.connectToLocalFile();
  };

  const manualDownloadBackup = async () => {
      await dbService.downloadBackupManual();
  };

  const value = {
    user, allUsers, userGroups, passwordPolicy, companyConfig, requiresSetup, notification, auditLogs, alerts, isInitialized, activeFinancialYear, reminders, isOnline, dbSyncStatus, lastSyncTime,
    notify, clearNotification, login, logout, checkPermission, validatePasswordStrength,
    manageUser, deleteUser, manageUserGroup, deleteUserGroup, updatePasswordPolicy, updateCompanyConfig,
    addAuditLog, addAlert, dismissAlert, clearAlerts, resetSystem, completeSetup, setFinancialYear,
    addReminder, toggleReminder, deleteReminder, connectDbSync, manualDownloadBackup
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
