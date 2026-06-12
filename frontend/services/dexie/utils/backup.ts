import { databaseManager } from '../DatabaseManager';
import { ALL_TABLES } from '../schema-types';

export interface BackupData {
  version: string;
  exportedAt: string;
  tables: Record<string, unknown[]>;
  metadata: {
    recordCount: number;
    tableCount: number;
  };
}

export class BackupService {
  async createBackup(): Promise<BackupData> {
    const db = await databaseManager.getDatabase();
    const tables: Record<string, unknown[]> = {};
    let totalRecords = 0;

    for (const tableName of ALL_TABLES) {
      const table = (db as any)[tableName] as import('dexie').Table<any, string> | undefined;
      if (!table) continue;
      const rows = await table.toArray();
      tables[tableName] = rows;
      totalRecords += rows.length;
    }

    return {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      tables,
      metadata: { recordCount: totalRecords, tableCount: Object.keys(tables).length },
    };
  }

  async restoreBackup(backup: BackupData): Promise<{ restored: number; errors: string[] }> {
    const db = await databaseManager.getDatabase();
    const errors: string[] = [];
    let restored = 0;

    for (const [tableName, rows] of Object.entries(backup.tables)) {
      const table = (db as any)[tableName] as import('dexie').Table<any, string> | undefined;
      if (!table) {
        errors.push(`Table '${tableName}' not found`);
        continue;
      }

      try {
        await table.clear();
        if (rows.length > 0) {
          await table.bulkPut(rows);
          restored += rows.length;
        }
      } catch (error) {
        errors.push(`Failed to restore '${tableName}': ${error}`);
      }
    }

    return { restored, errors };
  }

  async exportToJson(): Promise<string> {
    const backup = await this.createBackup();
    return JSON.stringify(backup, null, 2);
  }

  async importFromJson(json: string): Promise<{ restored: number; errors: string[] }> {
    const backup = JSON.parse(json) as BackupData;
    return this.restoreBackup(backup);
  }
}

export const backupService = new BackupService();
