import { databaseManager } from './DatabaseManager';
import { repositories, type RepositoryRegistry } from './repositories';

export const getActiveConnectionCount = () => 1;

export const getEnterpriseDatabase = async () => databaseManager.getDatabase();

export const getEnterpriseRepositories = async (): Promise<RepositoryRegistry> => repositories;

export const closeEnterpriseDatabase = async () => databaseManager.close();

export const resetEnterpriseDatabase = async () => databaseManager.reset();

export const requestPersistentStorage = async (): Promise<boolean> => {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try { return await navigator.storage.persist(); } catch { return false; }
};

export const getStorageEstimate = async (): Promise<{ quota?: number; usage?: number }> => {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return { quota: undefined, usage: undefined };
  try { return await navigator.storage.estimate(); } catch { return { quota: undefined, usage: undefined }; }
};

export { repositories, type RepositoryRegistry };
