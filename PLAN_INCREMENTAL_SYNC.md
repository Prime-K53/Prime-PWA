# Incremental Sync Implementation Plan

## Current Problem

`syncService.ts` does full-table scan + re-upload every 60s:

1. **Push**: `dbService.getAll(table)` → every record sent to Supabase via `upsert`
2. **Pull**: Supabase `.select('*')` → every record written to IndexedDB

Both sides send **everything** regardless of whether it changed.

---

## Architecture

```
Every write → dbService.put() logs to syncOutbox
                                     ↓
Push (every 10s):  syncOutbox entries → deduplicate → upsert to Supabase
                                                            ↓
Pull (every 30s):  Supabase .gte(updated_at, lastSyncAt) → write to IndexedDB
                     ↑
Supabase Realtime:  listens for remote changes → triggers pull immediately
```

---

## Implementation Steps

### Step 1: Auto-log writes to syncOutbox

**File**: `frontend/services/db.ts`

Modify `put()` and `delete()` to also write to the `syncOutbox` store:

```typescript
// Inside dbService.put(), after successful write:
if (SUPABASE_ENABLED) {
  await putToLegacyStore('syncOutbox', {
    id: `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entityId: (item as any).id,
    type: `${String(storeName)}:upsert`,
    payload: item,
    date: new Date().toISOString()
  });
}

// Inside dbService.delete(), after successful delete:
if (SUPABASE_ENABLED) {
  await putToLegacyStore('syncOutbox', {
    id: `outbox-delete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entityId: id,
    type: `${String(storeName)}:delete`,
    payload: { id },
    date: new Date().toISOString()
  });
}
```

Add a flag/import check — only log when Supabase is configured, so there's no perf impact when sync is off.

### Step 2: Rewrite pushLocalChanges — outbox-based

**File**: `frontend/services/syncService.ts`

Replace the full-table-scan push with outbox-based incremental push:

```typescript
export async function pushLocalChanges(): Promise<{ pushed: number; errors: string[] }> {
  if (!SUPABASE_ENABLED) return { pushed: 0, errors: [] };
  const session = await ensureAuth();
  if (!session) return { pushed: 0, errors: ['Not authenticated'] };

  const errors: string[] = [];
  let pushed = 0;

  // Read only the outbox entries (un-synced changes)
  const outbox = await dbService.getAll<any>('syncOutbox');
  if (outbox.length === 0) return { pushed: 0, errors: [] };

  // Deduplicate: if the same entityId was updated multiple times,
  // keep only the latest state and combine create+update
  const grouped = deduplicateOutbox(outbox);

  for (const [table, entries] of Object.entries(grouped)) {
    for (const [entityId, entry] of Object.entries(entries)) {
      try {
        if (entry.type.endsWith(':delete')) {
          const { error } = await supabase
            .from(table)
            .delete()
            .eq('id', entityId);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from(table)
            .upsert({ ...entry.payload, updated_at: new Date().toISOString() }, 
              { onConflict: 'id', ignoreDuplicates: false });
          if (error) throw error;
        }
        // Remove processed outbox entries
        await dbService.delete('syncOutbox', entry._outboxIds);
        pushed++;
      } catch (err) {
        errors.push(`${table}/${entityId}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }
  }

  localStorage.setItem('nexus_last_sync', new Date().toISOString());
  return { pushed, errors };
}
```

Deduplication helper:

```typescript
function deduplicateOutbox(outbox: any[]): Record<string, Record<string, any>> {
  const grouped: Record<string, Record<string, any>> = {};
  const sorted = [...outbox].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  for (const entry of sorted) {
    const [table, op] = entry.type.split(':');
    // entry.type looks like "inventory:upsert" or "inventory:delete"
    const tableName = table;
    if (!grouped[tableName]) grouped[tableName] = {};
    if (!grouped[tableName][entry.entityId]) {
      grouped[tableName][entry.entityId] = {
        type: entry.type,
        payload: entry.payload,
        _outboxIds: [],
      };
    }
    grouped[tableName][entry.entityId]._outboxIds.push(entry.id);

    if (op === 'delete') {
      grouped[tableName][entry.entityId].type = entry.type;
      grouped[tableName][entry.entityId].payload = entry.payload;
    } else {
      // Upsert: merge payloads (latest wins for each field)
      grouped[tableName][entry.entityId].payload = {
        ...grouped[tableName][entry.entityId].payload,
        ...entry.payload,
      };
    }
  }
  return grouped;
}
```

### Step 3: Rewrite pullRemoteChanges — timestamp-based + Realtime

**File**: `frontend/services/syncService.ts`

Replace full-table `.select('*')` with timestamp-gated query:

```typescript
export async function pullRemoteChanges(): Promise<{ pulled: number; errors: string[] }> {
  if (!SUPABASE_ENABLED) return { pulled: 0, errors: [] };
  const session = await ensureAuth();
  if (!session) return { pulled: 0, errors: ['Not authenticated'] };

  const errors: string[] = [];
  let pulled = 0;

  const lastSyncAt = localStorage.getItem('nexus_last_sync_pull');
  // If no previous sync, pull everything (first sync)
  const checkpoint = lastSyncAt || new Date(0).toISOString();

  for (const table of TABLES_TO_SYNC) {
    try {
      // Only fetch records changed since last pull
      const query = supabase
        .from(table)
        .select('*')
        .gte('updated_at', checkpoint)
        .order('updated_at', { ascending: true });

      const { data, error } = await query;
      if (error) { errors.push(`${table}: ${error.message}`); continue; }
      if (!data || data.length === 0) continue;

      for (const record of data) {
        const { updated_at, ...cleanRecord } = record;
        await dbService.put(table as any, cleanRecord);
        pulled++;
      }
    } catch (err) {
      errors.push(`${table}: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  localStorage.setItem('nexus_last_sync_pull', new Date().toISOString());
  return { pulled, errors };
}
```

### Step 4: Add Supabase Realtime subscriptions (instant remote change detection)

**File**: `frontend/services/syncService.ts`

Instead of polling every 60s, subscribe to remote changes:

```typescript
let realtimeChannels: any[] = [];

export function subscribeToRemoteChanges() {
  if (!SUPABASE_ENABLED) return;

  for (const table of TABLES_TO_SYNC) {
    const channel = supabase
      .channel(`public:${table}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        async (payload) => {
          // A remote change happened — pull just this one record
          if (payload.eventType === 'DELETE') {
            await dbService.delete(table as any, payload.old.id);
          } else {
            const { updated_at, ...record } = payload.new;
            await dbService.put(table as any, record);
          }
        }
      )
      .subscribe();

    realtimeChannels.push(channel);
  }
}
```

This replaces the periodic pull timer. Now push still happens on a timer (or on every write), but pull is instant via Realtime.

### Step 5: Sync timer — push only

**File**: `frontend/services/syncService.ts`

```typescript
const PUSH_INTERVAL_MS = 10000; // 10 seconds

export function startPeriodicPush(intervalMs = PUSH_INTERVAL_MS) {
  if (!SUPABASE_ENABLED) return;
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    if (navigator.onLine) {
      pushLocalChanges().catch(err => console.error('[Sync] Push failed:', err));
    }
  }, intervalMs);
}
```

### Step 6: Conflict resolution (LWW with version check)

**File**: `frontend/services/syncConflictResolver.ts`

```typescript
export async function resolveWriteConflict(
  table: string,
  localRecord: any,
  remoteRecord: any
): Promise<'local_wins' | 'remote_wins'> {
  // Higher version wins
  if ((localRecord.version || 0) > (remoteRecord.version || 0)) return 'local_wins';
  if ((remoteRecord.version || 0) > (localRecord.version || 0)) return 'remote_wins';

  // Same version: newer timestamp wins
  const localTime = new Date(localRecord._updatedAt || 0).getTime();
  const remoteTime = new Date(remoteRecord.updated_at || 0).getTime();

  if (localTime >= remoteTime) return 'local_wins';
  return 'remote_wins';
}
```

Modify the push to handle conflicts:

```typescript
// Before upsert, check if remote has a newer version
const { data: existing } = await supabase
  .from(table)
  .select('version, updated_at')
  .eq('id', entityId)
  .single();

if (existing) {
  const winner = await resolveWriteConflict(table, entry.payload, existing);
  if (winner === 'remote_wins') {
    // Skip push, pull latest instead
    await pullSingleRecord(table, entityId);
    await dbService.delete('syncOutbox', entry._outboxIds);
    continue;
  }
}
```

---

## File Changes Summary

| File | Change |
|------|--------|
| `frontend/services/db.ts` | Add outbox logging to `put()` and `delete()` |
| `frontend/services/syncService.ts` | Full rewrite — outbox push + timestamp pull + Realtime subscriptions |
| `frontend/services/syncConflictResolver.ts` | **New** — conflict resolution logic |
| `frontend/config/api.js` | Add sync interval and Realtime config |

No changes needed to:
- `supabaseClient.ts` (Realtime is already configured with `eventsPerSecond: 10`)
- `offlineQueueManager.ts` (separate concern — handles offline queuing, not sync)
- Any store or component files

---

## Performance Comparison

| Metric | Current (full scan) | After (incremental) |
|--------|-------------------|-------------------|
| Push data read | ALL records from all tables | Only outbox entries (0-N) |
| Push data sent | Full table (100s of rows) | Changed rows only (0-5 typically) |
| Pull data read | ALL remote records | `.gte(lastSyncAt)` only |
| Pull writes | Every row | Changed rows only |
| Sync latency | Up to 60s (poll interval) | <5s push + instant pull (Realtime) |
| Supabase usage | High (full table every cycle) | Low (minimal queries) |
| Offline queue | Separate system | Integrated with outbox |

---

## Migration safety

1. **Existing syncOutbox data**: The current `syncOutbox` store is used only by `examinationBatchService`. The new code treats all outbox entries uniformly, so existing examination entries will be processed correctly.

2. **First sync**: On first run with no `nexus_last_sync_pull` timestamp, the pull will fetch everything (`.gte('1970-01-01T00:00:00.000Z')`). This is the same as the current behavior.

3. **Rollback**: If incremental sync fails, fall back to full-table push:
```typescript
try {
  return await pushLocalChangesIncremental();
} catch (err) {
  console.warn('[Sync] Incremental push failed, falling back to full push', err);
  return await pushLocalChangesFull();
}
```
