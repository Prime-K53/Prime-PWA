import { databaseManager } from '../DatabaseManager';
import { ALL_TABLES } from '../schema-types';

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  tables: Record<string, { valid: boolean; issues: string[] }>;
}

export async function validateSchema(): Promise<ValidationResult> {
  const db = await databaseManager.getDatabase();
  const tables: Record<string, { valid: boolean; issues: string[] }> = {};
  const globalIssues: string[] = [];
  let allValid = true;

  for (const tableName of ALL_TABLES) {
    const table = (db as any)[tableName] as import('dexie').Table<any, string> | undefined;
    if (!table) {
      globalIssues.push(`Table '${tableName}' not found`);
      allValid = false;
      continue;
    }

    const tableIssues: string[] = [];
    try {
      const count = await table.count();
      if (count > 0) {
        const sample = await table.limit(1).toArray();
        const record = sample[0];
        if (record && !record.id) {
          tableIssues.push('Records missing primary key');
        }
      }
    } catch (error) {
      tableIssues.push(`Schema validation error: ${error}`);
      allValid = false;
    }

    tables[tableName] = { valid: tableIssues.length === 0, issues: tableIssues };
    if (tableIssues.length > 0) allValid = false;
  }

  return { valid: allValid, issues: globalIssues, tables };
}
