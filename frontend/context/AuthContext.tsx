import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole, UserGroup, PasswordPolicy, CompanyConfig, AuditLogEntry, SystemAlert, Reminder } from '../types';
import { MOCK_USERS, INITIAL_USER_GROUPS, AVAILABLE_PERMISSIONS } from '../constants';
import { generateNextId } from '../utils/helpers';
import { dbService } from '../services/db';
import { DEFAULT_PRICING_SETTINGS } from '../services/pricingRoundingService';
import { syncDocumentNumberSeriesConfig } from '../services/documentNumberService';
import { publishSystemAlert } from '../services/systemAlertService';
import { isPasswordProtectionEnabled, normalizeSecuritySettings, withNormalizedSecurityConfig } from '../utils/securitySettings';
import { DEFAULT_SHARED_NUMBERING_RULE, normalizeCompanyNumberingConfig } from '../utils/numbering';
import { hydrateCompanyPdfAssets } from '../utils/companyAssetUtils';

interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
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
  
  notify: (message: string, type: 'success' | 'error' | 'info') => void;
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

export const hashPassword = async (text: string): Promise<string> => {
  if (!text) return '';
  
  // Fallback for non-secure contexts (http/IP) where crypto.subtle is unavailable
  if (!window.isSecureContext || !crypto.subtle) {
    // Non-secure context detected. Using insecure fallback hash.
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return 'insecure_' + Math.abs(hash).toString(16);
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

const PASSWORD_BYPASS_USER_ID = 'USR-PASSWORD-BYPASS';

const isPasswordBypassSession = (value?: Partial<User> | null) =>
  Boolean((value as any)?.bypassAuth || (value as any)?.authMode === 'password_bypass' || value?.id === PASSWORD_BYPASS_USER_ID);

const buildPasswordBypassSession = (config: CompanyConfig, users: User[]): User => {
  const preferredAdmin = users.find(candidate => candidate.isSuperAdmin || candidate.role === 'Admin');
  const sessionTimeoutMinutes = Math.max(5, Number(normalizeSecuritySettings(config).sessionTimeoutMinutes) || 120);
  const tokenExpiry = new Date(Date.now() + (sessionTimeoutMinutes * 60 * 1000)).toISOString();

  return {
    id: PASSWORD_BYPASS_USER_ID,
    username: 'open-access',
    fullName: 'Open Access',
    name: config.companyName?.trim() || preferredAdmin?.fullName || preferredAdmin?.name || 'Open Access',
    email: config.email || preferredAdmin?.email || 'open-access@prime-erp.local',
    role: 'Admin',
    status: 'Active',
    active: true,
    isSuperAdmin: true,
    securityLevel: 'Elevated',
    groupIds: ['GRP-ADMIN'],
    tokenExpiry,
    bypassAuth: true,
    authMode: 'password_bypass'
  } as User;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [requiresSetup, setRequiresSetup] = useState<boolean>(false);

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [userGroups, setUserGroups] = useState<UserGroup[]>(INITIAL_USER_GROUPS);
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy>({ minLength: 8, requireSpecialChar: true, requireNumber: true, expirationDays: 90 });
  
  const defaultCompanyConfig: CompanyConfig = {
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
          defaultExamBomId: 'BOM-EXAM-STD'
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
          allowFutureDating: true,
          numbering: {
            shared: { ...DEFAULT_SHARED_NUMBERING_RULE }
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
              defaultPaymentMethod: 'Cash'
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
        enabled: false,
        apiUrl: '',
        apiKey: '',
        autoSyncEnabled: false,
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

  const [companyConfig, setCompanyConfig] = useState<CompanyConfig>(() => withNormalizedSecurityConfig(defaultCompanyConfig));

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

    // Sync user to sessionStorage for API auth bypass
    if (user) {
      sessionStorage.setItem('nexus_user', JSON.stringify(user));
    } else {
      sessionStorage.removeItem('nexus_user');
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user]);

  useEffect(() => {
    const loadInitData = async () => {
      // Failsafe timeout to prevent indefinite loading screen
      const failsafe = setTimeout(() => {
        if (!isInitialized) {
          // Initialization taking too long, forcing completion
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
        const savedSession = sessionStorage.getItem('nexus_user');
        if (savedSession) {
          try {
            const parsed = JSON.parse(savedSession);
            const expiry = parsed?.tokenExpiry ? new Date(parsed.tokenExpiry).getTime() : 0;
            if (isPasswordBypassSession(parsed) || (expiry && expiry > Date.now())) {
              restoredSession = parsed;
            } else {
              sessionStorage.removeItem('nexus_user');
            }
          } catch {
            sessionStorage.removeItem('nexus_user');
          }
        }

        // 2. Load essential data
        const [u, groups] = await Promise.all([
            dbService.getAll<User>('users'),
            dbService.getAll<UserGroup>('userGroups')
        ]);
        
        setAllUsers(u);
        setUserGroups(groups);
        const effectiveConfig = withNormalizedSecurityConfig(parsedConfig || defaultCompanyConfig);
        const hasCompanyData = Boolean(parsedConfig?.companyName?.trim());
        const hasUsers = u.length > 0;
        const initializedFlag = localStorage.getItem('nexus_initialized') === 'true';
        const setupComplete = hasCompanyData && hasUsers;

        if (setupComplete && !initializedFlag) {
          localStorage.setItem('nexus_initialized', 'true');
        }
        if (!setupComplete) {
          sessionStorage.removeItem('nexus_user');
          setUser(null);
        } else if (!isPasswordProtectionEnabled(effectiveConfig)) {
          const activeSession = restoredSession && !isPasswordBypassSession(restoredSession)
            ? restoredSession
            : buildPasswordBypassSession(effectiveConfig, u);
          setUser(activeSession);
        } else if (restoredSession && !isPasswordBypassSession(restoredSession)) {
          setUser(restoredSession);
        } else {
          sessionStorage.removeItem('nexus_user');
          setUser(null);
        }
        setRequiresSetup(!setupComplete);

        // 3. Fetch non-critical data in parallel
        const [logs, storedAlerts, storedReminders] = await Promise.all([
            dbService.getAll<AuditLogEntry>('auditLogs'),
            dbService.getAll<SystemAlert>('alerts'),
            dbService.getAll<Reminder>('reminders')
        ]);

        setAuditLogs(logs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setAlerts(storedAlerts.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setReminders(storedReminders.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

        // 4. Run Integrity Check
        const integrity = await dbService.checkIntegrity();
        if (!integrity.healthy) {
            console.error("[Auth] Database Integrity Issues:", integrity.issues);
        }

        dbService.setSyncListener((status) => {
            setDbSyncStatus(status);
            if (status === 'connected') setLastSyncTime(new Date().toISOString());
        });

        // Initialize workspace directory if company name exists
        if (parsedConfig?.companyName) {
            try {
                await (window as any).api?.system?.initializeWorkspace(parsedConfig.companyName);
            } catch (wsErr) {
                console.warn("[Auth] Workspace initialization skipped:", wsErr);
            }
        }

        // Initialization complete
      } catch (err) {
        console.error("[Auth] Critical system initialization failure:", err);
      } finally {
        clearTimeout(failsafe);
        setIsInitialized(true);
      }

      // Schedule Auto-Backup (Once per session/day)
      const lastBackup = localStorage.getItem('prime_erp_backup_date');
      const oneDay = 24 * 60 * 60 * 1000;
      if (!lastBackup || (Date.now() - new Date(lastBackup).getTime() > oneDay)) {
          dbService.performAutoBackup();
      }
    };
    loadInitData();
  }, []);

  const notify = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setNotification({ id: Date.now().toString(), message, type });
  }, []);

  const clearNotification = useCallback(() => {
    setNotification(null);
  }, []);

  const addAuditLog = useCallback(async (params: AuditParams) => {
    const entry: AuditLogEntry = {
        id: `LOG-${Date.now()}-${Math.floor(Math.random()*1000)}`,
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
        const passwordProtectionEnabled = isPasswordProtectionEnabled(companyConfig);
        // login attempt
        const dbUsers = await dbService.getAll<User>('users');
        // Found users in DB

        if (!passwordProtectionEnabled) {
            const bypassSession = buildPasswordBypassSession(withNormalizedSecurityConfig(companyConfig), dbUsers);
            setUser(bypassSession);
            sessionStorage.setItem('nexus_user', JSON.stringify(bypassSession));
            return 'SUCCESS';
        }
        
        const foundUser = dbUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!foundUser) {
            // User not found
            return 'INVALID';
        }
        
        if (foundUser.status !== 'Active') {
            // User is not active
            return 'INVALID';
        }

        if (!foundUser.password || !password) {
            return 'INVALID';
        }

        const hashedInput = await hashPassword(password);
        const expectedPassword = isStoredHash(foundUser.password) ? foundUser.password : await hashPassword(foundUser.password);
        if (foundUser.password !== expectedPassword) {
            await dbService.put('users', { ...foundUser, password: expectedPassword });
        }
        if (expectedPassword !== hashedInput) {
            // Password mismatch
            return 'INVALID';
        }

        if (foundUser.mfaEnabled) {
            if (!mfaCode) return 'MFA_REQUIRED';
            if (mfaCode.length !== 6) return 'INVALID';
        }

        const sessionTimeoutMinutes = Math.max(5, Number(companyConfig?.securitySettings?.sessionTimeoutMinutes) || 120);
        const sessionDuration = sessionTimeoutMinutes * 60 * 1000;
        const sessionUser = { 
            ...foundUser, 
            tokenExpiry: new Date(Date.now() + sessionDuration).toISOString() 
        };

        setUser(sessionUser);
        sessionStorage.setItem('nexus_user', JSON.stringify(sessionUser));
        
        // Login successful
        
        // Audit log in background
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
  }, [addAuditLog, companyConfig, requiresSetup]);

  const logout = useCallback(() => {
    if (user) {
        addAuditLog({
            action: 'LOGIN',
            entityType: 'User',
            entityId: user.id,
            details: `User ${user.username} logged out.`
        });
        const passwordProtectionEnabled = isPasswordProtectionEnabled(companyConfig);
        if (!passwordProtectionEnabled && !requiresSetup) {
            const bypassSession = buildPasswordBypassSession(withNormalizedSecurityConfig(companyConfig), allUsers);
            setUser(bypassSession);
            sessionStorage.setItem('nexus_user', JSON.stringify(bypassSession));
            return;
        }
        setUser(null);
        sessionStorage.removeItem('nexus_user');
    }
  }, [user, addAuditLog, companyConfig, requiresSetup, allUsers]);

  const checkPermission = useCallback((permissionId: string) => {
    if (!user) return false;
    // Admin role, SuperAdmin flag, or 'admin' username should bypass all permission checks
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
    const normalizedPassword = u.password
      ? (isStoredHash(u.password) ? u.password : await hashPassword(u.password))
      : '';
    const userData = {
      ...u,
      id: u.id || generateNextId('USR', allUsers, companyConfig),
      password: normalizedPassword
    };
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
    const passwordProtectionEnabled = isPasswordProtectionEnabled(normalizedConfig);
    if (!passwordProtectionEnabled) {
      const bypassSession = buildPasswordBypassSession(normalizedConfig, allUsers);
      if (!user || isPasswordBypassSession(user)) {
        setUser(bypassSession);
        sessionStorage.setItem('nexus_user', JSON.stringify(bypassSession));
      }
    } else if (isPasswordBypassSession(user)) {
      setUser(null);
      sessionStorage.removeItem('nexus_user');
    }
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

    // Initialize local workspace on Desktop
    try {
      const { api } = await import('../services/api');
      await api.system.initializeWorkspace(normalizedConfig.companyName);
      console.log('Local workspace initialized successfully.');
    } catch (err) {
      console.warn('Failed to initialize local workspace:', err);
    }

    if (isPasswordProtectionEnabled(normalizedConfig)) {
      setUser(null);
      sessionStorage.removeItem('nexus_user');
    } else {
      const bypassSession = buildPasswordBypassSession(normalizedConfig, updatedUsers);
      setUser(bypassSession);
      sessionStorage.setItem('nexus_user', JSON.stringify(bypassSession));
    }
  };

  const setFinancialYear = (year: number) => setActiveFinancialYear(year);

  const addReminder = useCallback(async (text: string, date?: string) => {
      const r: Reminder = { id: `REM-${Date.now()}`, text, date: date || new Date().toISOString(), completed: false };
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
