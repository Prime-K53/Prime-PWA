/// <reference types="vite/client" />

declare module "*.ttf" {
  const content: string;
  export default content;
}

interface ElectronReadPdfResult {
  success: boolean;
  data?: number[];
  size?: number;
  path?: string;
  error?: string;
}

interface ElectronWritePdfResult {
  success: boolean;
  path?: string;
  error?: string;
}

interface ElectronCleanupPdfResult {
  success: boolean;
  error?: string;
}

interface Window {
  Buffer: any;
  module?: { exports: Record<string, unknown> };
  electronAPI?: {
    getBackendUrl?: () => Promise<string>;
    backendOrigin?: string;
    log?: (payload: { message: string; [key: string]: unknown }) => void;
    readPdfFile?: (filePath: string) => Promise<ElectronReadPdfResult>;
    writeTempPdf?: (data: number[], filename?: string) => Promise<ElectronWritePdfResult>;
    cleanupTempPdf?: (filePath: string) => Promise<ElectronCleanupPdfResult>;
    generatePdf?: (type: string, data: unknown, config?: unknown) => Promise<{ success: boolean; path?: string; size?: number; error?: string }>;
    getPdfPreviewUrl?: (tempFilePath: string) => string;
    openPdfWithSystemViewer?: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  };
  __TAURI_INTERNALS__?: Record<string, unknown>;
  getApiUrl?: (path: string) => Promise<string>;
  API_BASE_URL?: string;
  BASE_URL?: string;
  BACKEND_ORIGIN?: string;
  isElectron?: boolean;
}
