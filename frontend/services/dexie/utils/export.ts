import { DatabaseManagerFactory } from '../DatabaseManagerFactory';
import { ALL_TABLES } from '../schema-types';

export interface ExportOptions {
  tables?: string[];
  format: 'json' | 'csv';
  filter?: (tableName: string, row: Record<string, unknown>) => boolean;
}

export interface ImportOptions {
  clearExisting: boolean;
  validate: boolean;
}

export class DataExportService {
  async exportData(options: ExportOptions): Promise<Record<string, unknown[]>> {
    const tables = options.tables || ALL_TABLES;
    const result: Record<string, unknown[]> = {};

    for (const tableName of tables) {
      const table = await DatabaseManagerFactory.getTable(tableName).catch(() => null);
      if (!table) continue;
      const rows = await table.toArray();
      if (options.filter) {
        result[tableName] = rows.filter((row) => options.filter(tableName, row as Record<string, unknown>));
      } else {
        result[tableName] = rows;
      }
    }

    return result;
  }

  async importData(data: Record<string, unknown[]>, options: ImportOptions): Promise<{ imported: number; errors: string[] }> {
    let imported = 0;
    const errors: string[] = [];

    for (const [tableName, rows] of Object.entries(data)) {
      const table = await DatabaseManagerFactory.getTable(tableName).catch(() => null);
      if (!table) {
        errors.push(`Table '${tableName}' not found`);
        continue;
      }

      try {
        if (options.clearExisting) {
          await table.clear();
        }
        if (rows.length > 0) {
          await table.bulkPut(rows);
          imported += rows.length;
        }
      } catch (error) {
        errors.push(`Failed to import into '${tableName}': ${error}`);
      }
    }

    return { imported, errors };
  }

  async exportAsJson(options: ExportOptions): Promise<string> {
    const data = await this.exportData(options);
    return JSON.stringify(data, null, 2);
  }
}

export const dataExportService = new DataExportService();
