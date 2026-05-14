import type { PlatformAPI } from '../services/platform';

interface ElectronAPI {
  getBackendUrl: () => Promise<string>;
  backendOrigin: string;
  log: (payload: { message: string; [key: string]: unknown }) => void;
  readPdfFile: (filePath: string) => Promise<{
    success: boolean;
    data?: number[];
    size?: number;
    path?: string;
    error?: string;
  }>;
  writeTempPdf: (data: number[], filename?: string) => Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;
  cleanupTempPdf: (filePath: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  generatePdf: (type: string, data: unknown, config?: unknown) => Promise<{
    success: boolean;
    path?: string;
    size?: number;
    error?: string;
  }>;
  getPdfPreviewUrl: (tempFilePath: string) => string;
  openPdfWithSystemViewer: (filePath: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    __TAURI_INTERNALS__?: Record<string, unknown>;
  }
}

declare module '../services/platform' {
  interface PlatformAPI {}
}

export type { ElectronAPI };
export {};

