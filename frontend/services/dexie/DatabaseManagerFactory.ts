import { DatabaseManager } from './DatabaseManager';
import type { EnterpriseDexieDatabase } from './DatabaseManager';

export type TableAccessor = <T = Record<string, unknown>>(tableName: string) => Promise<import('dexie').Table<T, string>>;

export class DatabaseManagerFactory {
  static createAccessor(): TableAccessor {
    const manager = DatabaseManager.getInstance();
    return async <T = Record<string, unknown>>(tableName: string) => {
      const db = await manager.getDatabase();
      const table = (db as unknown as Record<string, import('dexie').Table<T, string>>)[tableName];
      if (!table) throw new Error(`Table '${tableName}' not registered in enterprise database`);
      return table;
    };
  }

  static async withTransaction<T>(
    tables: string[],
    mode: 'readonly' | 'readwrite',
    fn: (tx: import('dexie').Transaction) => Promise<T>
  ): Promise<T> {
    const manager = DatabaseManager.getInstance();
    const db = await manager.getDatabase();
    const tableInstances = tables.map((t) => (db as any)[t]);
    return db.transaction(mode, tableInstances, async (tx) => fn(tx));
  }

  static async getTable<T = Record<string, unknown>>(
    tableName: string
  ): Promise<import('dexie').Table<T, string>> {
    const manager = DatabaseManager.getInstance();
    const db = await manager.getDatabase();
    const table = (db as unknown as Record<string, import('dexie').Table<T, string>>)[tableName];
    if (!table) throw new Error(`Table '${tableName}' not registered`);
    return table;
  }
}

export type { EnterpriseDexieDatabase };
