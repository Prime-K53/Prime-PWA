/**
 * Secure preload script for Electron renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');

const resolvedBackendOrigin = (() => {
  try {
    const arg = process.argv.find((a) => a.startsWith('--prime-backend-origin='));
    return arg ? arg.split('=').slice(1).join('=') : '';
  } catch {
    return '';
  }
})();

contextBridge.exposeInMainWorld('electronAPI', {
  getBackendUrl: async () => {
    try {
      const runtime = await ipcRenderer.invoke('desktop:get-runtime');
      return runtime?.backendUrl || resolvedBackendOrigin || '';
    } catch {
      return resolvedBackendOrigin || '';
    }
  },

  backendOrigin: resolvedBackendOrigin,

  log: (payload) => {
    if (payload && typeof payload === 'object' && typeof payload.message === 'string') {
      ipcRenderer.send('renderer-log', payload);
    }
  },

  readPdfFile: async (filePath) => {
    try {
      return await ipcRenderer.invoke('desktop:read-pdf-file', filePath);
    } catch (error) {
      console.error('[Preload] Failed to read PDF:', error);
      return { error: error.message, success: false };
    }
  },

  writeTempPdf: async (data, filename) => {
    try {
      return await ipcRenderer.invoke('desktop:write-temp-pdf', data, filename);
    } catch (error) {
      console.error('[Preload] Failed to write temp PDF:', error);
      return { error: error.message, success: false };
    }
  },

  cleanupTempPdf: async (filePath) => {
    try {
      return await ipcRenderer.invoke('desktop:cleanup-temp-pdf', filePath);
    } catch (error) {
      console.error('[Preload] Failed to cleanup temp PDF:', error);
      return { error: error.message, success: false };
    }
  },

  generatePdf: async (type, data, config) => {
    try {
      return await ipcRenderer.invoke('desktop:generate-pdf', { type, data, config });
    } catch (error) {
      console.error('[Preload] PDF generation failed:', error);
      return { success: false, error: error.message, path: null };
    }
  },

  getPdfPreviewUrl: (filePath) => {
    if (!filePath) return null;
    // Convert to forward slashes for URL consistency
    const normalized = filePath.replace(/\\/g, '/');
    const encoded = encodeURIComponent(normalized);
    return `prime-pdf:///${encoded}`;
  },

  openPdfWithSystemViewer: async (filePath) => {
    try {
      return await ipcRenderer.invoke('desktop:open-pdf-system', filePath);
    } catch (error) {
      console.error('[Preload] Failed to open PDF:', error);
      return { error: error.message, success: false };
    }
  },
});
