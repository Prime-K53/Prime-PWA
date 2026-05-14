export const config = {
  // Database
  dbName: import.meta.env.VITE_DB_NAME || 'PrimeERP',
  dbVersion: parseInt(import.meta.env.VITE_DB_VERSION || '27'),
  
  // Mode
  offlineMode: import.meta.env.VITE_OFFLINE_MODE !== 'false',
  
  // Business constants
  tonerMgPerSheet: parseInt(import.meta.env.VITE_TONER_MG || '20'),
  
  // API
  apiBaseUrl: import.meta.env.VITE_API_URL || 'https://prime-erp-system.onrender.com',
  
  // Features
  enableMultiCurrency: import.meta.env.VITE_ENABLE_MULTI_CURRENCY === 'true',
  enableWorkflowAutomation: import.meta.env.VITE_ENABLE_WORKFLOW === 'true',
  
  // Pagination
  defaultPageSize: 25,
  maxPageSize: 100,
  
  // Currency
  defaultCurrency: import.meta.env.VITE_DEFAULT_CURRENCY || 'USD',
  currencyDecimalPlaces: 2,
  
  // Session
  sessionTimeoutMinutes: parseInt(import.meta.env.VITE_SESSION_TIMEOUT || '480'),
  
  // File upload
  maxFileSizeMB: parseInt(import.meta.env.VITE_MAX_FILE_SIZE || '10'),
  
  // Notifications
  notificationDurationMs: 5000,
};
