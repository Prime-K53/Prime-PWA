import { supabase } from './supabaseClient';
import { dbService } from './db';

const SUPABASE_ENABLED = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_ANON_KEY &&
  import.meta.env.VITE_SUPABASE_URL !== 'https://placeholder.supabase.co'
);

const SYNC_INTERVAL_MS = 60000;
let syncTimer: ReturnType<typeof setInterval> | null = null;

const TABLES_TO_SYNC = [
  'users', 'userGroups', 'products', 'warehouses', 'customers', 'suppliers',
  'sales', 'invoices', 'purchases', 'accounts', 'ledgerEntries',
  'auditLogs', 'settings', 'reminders',
  'workCenters', 'workOrders', 'productionBatches', 'productionResources',
  'salesOrders', 'quotations',
];

function getEmailForUser(username: string, domain = 'prime-erp.local'): string {
  if (username.includes('@')) return username;
  return `${username}@${domain}`;
}

async function ensureAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data: { session: newSession } } = await supabase.auth.refreshSession();
    return newSession;
  }
  return session;
}

export async function pushLocalChanges(): Promise<{ pushed: number; errors: string[] }> {
  if (!SUPABASE_ENABLED) return { pushed: 0, errors: [] };
  
  const session = await ensureAuth();
  if (!session) return { pushed: 0, errors: ['Not authenticated'] };

  const errors: string[] = [];
  let pushed = 0;

  for (const table of TABLES_TO_SYNC) {
    try {
      const records = await dbService.getAll<any>(table);
      if (records.length === 0) continue;

      const { error } = await supabase
        .from(table)
        .upsert(
          records.map(r => ({
            ...r,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'id', ignoreDuplicates: false }
        );

      if (error) {
        errors.push(`${table}: ${error.message}`);
      } else {
        pushed += records.length;
      }
    } catch (err) {
      errors.push(`${table}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  if (pushed > 0) {
    localStorage.setItem('nexus_last_sync', new Date().toISOString());
  }

  return { pushed, errors };
}

export async function pullRemoteChanges(): Promise<{ pulled: number; errors: string[] }> {
  if (!SUPABASE_ENABLED) return { pulled: 0, errors: [] };

  const session = await ensureAuth();
  if (!session) return { pulled: 0, errors: ['Not authenticated'] };

  const errors: string[] = [];
  let pulled = 0;

  for (const table of TABLES_TO_SYNC) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) {
        errors.push(`${table}: ${error.message}`);
        continue;
      }

      if (data && data.length > 0) {
        for (const record of data) {
          const { updated_at, ...cleanRecord } = record;
          try {
            await dbService.put(table as any, cleanRecord);
            pulled++;
          } catch (putErr) {
            errors.push(`${table}/${record.id}: ${putErr instanceof Error ? putErr.message : 'put failed'}`);
          }
        }
      }
    } catch (err) {
      errors.push(`${table}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  if (pulled > 0) {
    localStorage.setItem('nexus_last_sync', new Date().toISOString());
  }

  return { pulled, errors };
}

export async function fullSync(): Promise<{ pulled: number; pushed: number; errors: string[] }> {
  const pushResult = await pushLocalChanges();
  const pullResult = await pullRemoteChanges();
  return {
    pulled: pullResult.pulled,
    pushed: pushResult.pushed,
    errors: [...pushResult.errors, ...pullResult.errors]
  };
}

export function startPeriodicSync(intervalMs = SYNC_INTERVAL_MS) {
  if (!SUPABASE_ENABLED) return;
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    if (navigator.onLine) {
      fullSync().catch(err => console.error('[Sync] Periodic sync failed:', err));
    }
  }, intervalMs);
  fullSync().catch(err => console.error('[Sync] Initial sync failed:', err));
}

export function stopPeriodicSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
