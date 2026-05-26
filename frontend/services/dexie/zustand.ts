import { create } from 'zustand';

interface DexieRuntimeState {
  ready: boolean;
  migrating: boolean;
  bootStage: 'idle' | 'critical' | 'dashboard' | 'background' | 'complete';
  leader: boolean;
  online: boolean;
  pendingOperations: number;
  persistenceGranted: boolean;
  quotaBytes: number | null;
  usageBytes: number | null;
  lastError: string | null;
  bootProgress: { stage: string; total: number; completed: number; failed: number };
}

export const usePrimeDbRuntimeStore = create<DexieRuntimeState>(() => ({
  ready: false,
  migrating: false,
  bootStage: 'idle',
  leader: true,
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  pendingOperations: 0,
  persistenceGranted: false,
  quotaBytes: null,
  usageBytes: null,
  lastError: null,
  bootProgress: { stage: 'idle', total: 0, completed: 0, failed: 0 },
}));

export const requestPersistentStorage = async (): Promise<boolean> => {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try { return await navigator.storage.persist(); } catch { return false; }
};

export const getStorageEstimate = async (): Promise<{ quota?: number; usage?: number }> => {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return { quota: undefined, usage: undefined };
  try { return await navigator.storage.estimate(); } catch { return { quota: undefined, usage: undefined }; }
};
