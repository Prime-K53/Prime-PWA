import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

export type PlatformType = 'tauri' | 'electron' | 'browser';

export interface PlatformLogPayload {
  message: string;
  level?: string;
  [key: string]: unknown;
}

export interface PlatformReadPdfResult {
  success: boolean;
  data?: number[];
  size?: number;
  path?: string;
  error?: string;
}

export interface PlatformWritePdfResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface PlatformCleanupPdfResult {
  success: boolean;
  error?: string;
}

export interface PlatformOpenPdfResult {
  success: boolean;
  error?: string;
}

export interface PlatformAPI {
  getBackendUrl: () => Promise<string>;
  log: (payload: PlatformLogPayload) => void;
  readPdfFile: (filePath: string) => Promise<PlatformReadPdfResult>;
  writeTempPdf: (data: number[], filename?: string) => Promise<PlatformWritePdfResult>;
  cleanupTempPdf: (filePath: string) => Promise<PlatformCleanupPdfResult>;
  openPdfWithSystemViewer: (filePath: string) => Promise<PlatformOpenPdfResult>;
  getPdfPreviewUrl: (filePath: string) => string | null;
}

let platformType: PlatformType | null = null;
let cachedApi: PlatformAPI | null = null;

export function detectPlatform(): PlatformType {
  if (platformType) return platformType;

  if (typeof window !== 'undefined' && typeof (window as any).__TAURI_INTERNALS__ !== 'undefined') {
    platformType = 'tauri';
  } else if (typeof window !== 'undefined' && typeof (window as any).electronAPI?.writeTempPdf === 'function') {
    platformType = 'electron';
  } else {
    platformType = 'browser';
  }

  return platformType;
}

export function isTauri(): boolean {
  return detectPlatform() === 'tauri';
}

export function isElectron(): boolean {
  return detectPlatform() === 'electron';
}

export function isDesktop(): boolean {
  return isTauri() || isElectron();
}

function createTauriAPI(): PlatformAPI {
  return {
    getBackendUrl: async () => {
      try {
        return await invoke<string>('get_backend_url');
      } catch {
        return '';
      }
    },

    log: (payload: PlatformLogPayload) => {
      const level = payload.level || 'INFO';
      console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](
        `[${level}] ${payload.message}`,
        payload,
      );
    },

    readPdfFile: async (filePath: string): Promise<PlatformReadPdfResult> => {
      try {
        const data = await invoke<number[]>('read_pdf_file', { path: filePath });
        return { success: true, data, size: data.length };
      } catch (err: any) {
        return { success: false, error: err?.toString() || 'Failed to read PDF file' };
      }
    },

    writeTempPdf: async (data: number[], filename?: string): Promise<PlatformWritePdfResult> => {
      try {
        const path = await invoke<string>('write_temp_pdf', { data, filename: filename || null });
        return { success: true, path };
      } catch (err: any) {
        return { success: false, error: err?.toString() || 'Failed to write temp PDF' };
      }
    },

    cleanupTempPdf: async (filePath: string): Promise<PlatformCleanupPdfResult> => {
      try {
        await invoke('cleanup_temp_pdf', { path: filePath });
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.toString() || 'Failed to cleanup temp PDF' };
      }
    },

    openPdfWithSystemViewer: async (filePath: string): Promise<PlatformOpenPdfResult> => {
      try {
        await invoke('open_pdf_system', { path: filePath });
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.toString() || 'Failed to open PDF' };
      }
    },

    getPdfPreviewUrl: (filePath: string): string | null => {
      if (!filePath) return null;
      try {
        return convertFileSrc(filePath);
      } catch {
        const normalized = filePath.replace(/\\/g, '/');
        return `file:///${normalized.startsWith('/') ? normalized.slice(1) : normalized}`;
      }
    },
  };
}

function createElectronAPI(): PlatformAPI {
  const electron = (window as any).electronAPI;

  return {
    getBackendUrl: async () => {
      try {
        if (typeof electron?.getBackendUrl === 'function') {
          return await electron.getBackendUrl();
        }
      } catch {}
      return electron?.backendOrigin || '';
    },

    log: (payload: PlatformLogPayload) => {
      if (typeof electron?.log === 'function') {
        electron.log(payload);
      } else {
        const level = payload.level || 'INFO';
        console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](
          `[${level}] ${payload.message}`,
          payload,
        );
      }
    },

    readPdfFile: async (filePath: string): Promise<PlatformReadPdfResult> => {
      try {
        if (typeof electron?.readPdfFile === 'function') {
          return await electron.readPdfFile(filePath);
        }
      } catch (err: any) {
        return { success: false, error: err?.toString() || 'Failed to read PDF file' };
      }
      return { success: false, error: 'electronAPI.readPdfFile not available' };
    },

    writeTempPdf: async (data: number[], filename?: string): Promise<PlatformWritePdfResult> => {
      try {
        if (typeof electron?.writeTempPdf === 'function') {
          return await electron.writeTempPdf(data, filename);
        }
      } catch (err: any) {
        return { success: false, error: err?.toString() || 'Failed to write temp PDF' };
      }
      return { success: false, error: 'electronAPI.writeTempPdf not available' };
    },

    cleanupTempPdf: async (filePath: string): Promise<PlatformCleanupPdfResult> => {
      try {
        if (typeof electron?.cleanupTempPdf === 'function') {
          return await electron.cleanupTempPdf(filePath);
        }
      } catch (err: any) {
        return { success: false, error: err?.toString() || 'Failed to cleanup temp PDF' };
      }
      return { success: false, error: 'electronAPI.cleanupTempPdf not available' };
    },

    openPdfWithSystemViewer: async (filePath: string): Promise<PlatformOpenPdfResult> => {
      try {
        if (typeof electron?.openPdfWithSystemViewer === 'function') {
          return await electron.openPdfWithSystemViewer(filePath);
        }
      } catch (err: any) {
        return { success: false, error: err?.toString() || 'Failed to open PDF' };
      }
      return { success: false, error: 'electronAPI.openPdfWithSystemViewer not available' };
    },

    getPdfPreviewUrl: (filePath: string): string | null => {
      if (!filePath) return null;
      if (typeof electron?.getPdfPreviewUrl === 'function') {
        return electron.getPdfPreviewUrl(filePath);
      }
      const normalized = filePath.replace(/\\/g, '/');
      const encoded = encodeURIComponent(normalized);
      return `prime-pdf:///${encoded}`;
    },
  };
}

function createBrowserAPI(): PlatformAPI {
  return {
    getBackendUrl: async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('backend') || 'http://localhost:3000';
      } catch {
        return 'http://localhost:3000';
      }
    },

    log: (payload: PlatformLogPayload) => {
      const level = payload.level || 'INFO';
      console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](
        `[${level}] ${payload.message}`,
        payload,
      );
    },

    readPdfFile: async (_filePath: string): Promise<PlatformReadPdfResult> => {
      return { success: false, error: 'File system not available in browser' };
    },

    writeTempPdf: async (_data: number[], _filename?: string): Promise<PlatformWritePdfResult> => {
      return { success: false, error: 'File system not available in browser' };
    },

    cleanupTempPdf: async (_filePath: string): Promise<PlatformCleanupPdfResult> => {
      return { success: true };
    },

    openPdfWithSystemViewer: async (_filePath: string): Promise<PlatformOpenPdfResult> => {
      return { success: false, error: 'System viewer not available in browser' };
    },

    getPdfPreviewUrl: (filePath: string): string | null => {
      return filePath || null;
    },
  };
}

export function getPlatformAPI(): PlatformAPI {
  if (cachedApi) return cachedApi;

  const platform = detectPlatform();
  switch (platform) {
    case 'tauri':
      cachedApi = createTauriAPI();
      break;
    case 'electron':
      cachedApi = createElectronAPI();
      break;
    default:
      cachedApi = createBrowserAPI();
      break;
  }

  return cachedApi;
}

export const platform = {
  get type(): PlatformType {
    return detectPlatform();
  },
  get isTauri(): boolean {
    return isTauri();
  },
  get isElectron(): boolean {
    return isElectron();
  },
  get isDesktop(): boolean {
    return isDesktop();
  },
  get api(): PlatformAPI {
    return getPlatformAPI();
  },
};
