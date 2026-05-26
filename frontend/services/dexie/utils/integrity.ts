import { databaseManager } from '../DatabaseManager';
import { ALL_TABLES } from '../schema-types';

export interface IntegrityIssue {
  table: string;
  type: 'missing_field' | 'invalid_type' | 'orphan_record' | 'corrupt_entry';
  id: string;
  field?: string;
  message: string;
}

export async function checkIntegrity(): Promise<{ healthy: boolean; issues: IntegrityIssue[] }> {
  const issues: IntegrityIssue[] = [];
  const db = await databaseManager.getDatabase();

  for (const tableName of ALL_TABLES) {
    const table = (db as any)[tableName] as import('dexie').Table<any, string> | undefined;
    if (!table) continue;

    try {
      const all = await table.toArray();
      for (const row of all) {
        if (!row.id) {
          issues.push({ table: tableName, type: 'missing_field', id: String(row.id || 'unknown'), field: 'id', message: 'Record missing id field' });
          continue;
        }

        if (typeof row.entityVersion !== 'undefined' && (typeof row.entityVersion !== 'number' || row.entityVersion < 0)) {
          issues.push({ table: tableName, type: 'invalid_type', id: row.id, field: 'entityVersion', message: 'Invalid entityVersion' });
        }

        if (typeof row.isDeleted === 'undefined') {
          issues.push({ table: tableName, type: 'missing_field', id: row.id, field: 'isDeleted', message: 'Missing isDeleted flag' });
        }
      }
    } catch (error) {
      issues.push({ table: tableName, type: 'corrupt_entry', id: 'unknown', message: `Failed to read table: ${error}` });
    }
  }

  return { healthy: issues.length === 0, issues };
}

export async function findOrphans(): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];
  const db = await databaseManager.getDatabase();

  try {
    const products = await db.products.toArray();
    const invoices = await db.invoices.toArray();

    for (const invoice of invoices) {
      if (invoice.customerId) {
        const customer = await db.customers.get(invoice.customerId);
        if (!customer) {
          issues.push({ table: 'invoices', type: 'orphan_record', id: invoice.id, field: 'customerId', message: `Invoice references non-existent customer: ${invoice.customerId}` });
        }
      }
    }
  } catch {}

  return issues;
}
