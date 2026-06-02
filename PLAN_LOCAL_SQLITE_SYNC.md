# Implementation Plan: Local SQLite ↔ Supabase Sync Architecture

## Architecture Goal

```
LOCAL COMPUTER (each device)
┌─────────────────────────────┐
│  SQLite (primary local DB)  │
│  via backend Node.js server │
│  ─ or ─                     │
│  PGlite (Postgres in WASM)  │
│  via browser                │
└──────────┬──────────────────┘
           │ sync (bi-directional)
           ▼
┌─────────────────────────────┐
│  Supabase Cloud (Postgres)  │
│  Central source of truth    │
└──────────┬──────────────────┘
           │ sync
           ▼
  Other devices sync too
```

---

## Netlify Deployment & Backend Dependency

### Yes — the backend becomes mandatory

If you make backend SQLite the **primary** store (Phases 1-2), the Node.js server **must be running** for the app to work. After deploying the frontend to Netlify:

```
User's browser → Netlify (serves frontend HTML/JS/CSS)
               → localhost:3000 (user must also run backend)
               → Supabase (sync happens via backend)
```

The frontend `VITE_API_URL` would point to `http://localhost:3000` — this works because the user's browser can reach their own machine's localhost.

### Three deployment models

| Model | Frontend | Backend | Netlify? | Use case |
|-------|----------|---------|----------|----------|
| **A: Netlify + local backend** | Netlify CDN | User runs Node.js locally | ✅ Yes | Your current setup |
| **B: Fully local (Electron)** | Bundled with Electron | Embedded | ❌ No | Desktop app distribution |
| **C: No backend (future)** | Netlify CDN | None needed | ✅ Yes | Once PGlite sync is production-ready |

**Model A** is what your architecture already supports — you serve the frontend from Netlify, and the user runs `node backend/index.cjs` locally. The plan below upgrades this model.

**Model C** would eliminate the backend entirely (using PGlite in the browser + Electric sync to Supabase) — but PGlite's sync plugin is currently **alpha** (read-only from server, no local writes back yet), so it's not ready for production.

### Current app already needs backend for some features

Looking at your codebase, the backend is already required for:
- Examination pricing engine (`backend/services/pricingEngine.cjs`)
- Document generation (`backend/services/documentService.cjs`)
- License validation (`backend/services/licenseService.cjs`)
- Backups (`backend/services/backupService.cjs`)

Making backend SQLite primary just formalizes this dependency rather than treating the backend as optional.

### If you want fully serverless (no local backend)

Skip Phase 1-3. Instead:
- **Keep IndexedDB as primary** (current approach)
- **Improve the sync service** to use incremental sync, conflict resolution, and Supabase Realtime subscriptions
- The frontend syncs directly from IndexedDB → Supabase and Supabase → IndexedDB
- The backend remains optional for business logic that requires it

This avoids the migration entirely and gives you multi-device sync faster. The tradeoff is IndexedDB remains the local store instead of SQLite.

---

## Current State Assessment

| Component | Current | Target |
|-----------|---------|--------|
| **Frontend primary store** | IndexedDB (70+ stores, `idb` library) | Backend SQLite API or PGlite |
| **Backend store** | SQLite (~30 tables, secondary) | SQLite (primary, all entities) |
| **Sync to Supabase** | Manual push/pull from IndexedDB | Sync from SQLite → Supabase |
| **Offline support** | Excellent (IndexedDB in-browser) | Via local backend or PGlite |
| **Conflict resolution** | None (last write wins) | CRDT or timestamp-based |
| **Real-time multi-device** | None | Via Supabase Realtime |

---

## Key Technology Decision

Based on research (May 2026):

| Technology | Bidirectional Sync | Production Ready | Cost | Complexity |
|-----------|-------------------|-----------------|------|------------|
| **PowerSync** | ✅ Full | ✅ Yes | $49/mo or self-host | Medium |
| **Zero (Rocicorp)** | ✅ Full | ✅ GA Mar 2026 | Free open-source | Medium |
| **ElectricSQL + PGlite** | ⚠️ PGlite sync alpha (no local writes back yet) | ⚠️ Server-side CRDT ready | Free open-source | Medium |
| **Upgrade existing backend SQLite** | ✅ Full | ✅ Already running | Free | High (manual work) |

### ⚡ Recommended Approach

**Two-phase strategy:**

1. **Phase 1 (immediate)**: Backend SQLite becomes primary — most pragmatic, uses existing infrastructure, minimal new tech
2. **Phase 2 (future)**: Evaluate PowerSync or Zero for built-in sync once requirements stabilize

---

## Phase 1: Backend SQLite as Primary Store (Weeks 1-4)

### Step 1.1: Complete Backend Schema (Week 1)

**What**: Add all missing SQLite tables that exist in IndexedDB but not in backend

**File to modify**: `backend/db.cjs`

**Missing tables to add** (from frontend `NexusDB` interface in `frontend/services/db.ts`):

```
accounts, ledger, expenses, income, payrollRuns, payslips,
batches (production), workOrders, workCenters, resources,
resourceAllocations, bom, bomTemplates, marketAdjustments,
salesOrders, quotations, jobOrders, deliveries, shipments,
warehouses, warehouseInventory, materialBatches, materialCategories,
inventoryTransactions, vatTransactions, vatReturns,
bankAccounts, bankTransactions, bankStatements, bankReconciliations,
cheques, budgets, transfers, employees, suppliers, supplierPayments,
subcontractOrders, maintenanceLogs, goodsReceipts,
examinationBatches, examinationJobs, examinationJobSubjects,
examinationInvoiceGroups, examinationRecurringProfiles,
smsCampaigns, subscribers, smsTemplates,
whatsappChats, whatsappTemplates, whatsappCampaigns,
files, settings, syncOutbox, auditLogs, alerts, reminders
```

**Action**: For each store in `frontend/services/db.ts:24-122`, create a matching SQLite table in `backend/db.cjs` with proper column types for all fields.

### Step 1.2: Create REST API Endpoints (Week 2)

**What**: Generate CRUD endpoints for ALL entity types

**Files to create**: `backend/routes/` (new files per module)

**Pattern** (example for inventory):

```javascript
// backend/routes/inventory.cjs
router.get('/api/inventory', async (req, res) => {
  db.all('SELECT * FROM inventory', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.put('/api/inventory/:id', async (req, res) => {
  // upsert pattern
});
```

**Entities to cover**: All 70+ from previous step, organized into route files:
- `routes/inventory.cjs` — items, warehouses, categories, batches, transactions
- `routes/sales.cjs` — sales, quotations, orders, exchanges, shipments
- `routes/finance.cjs` — accounts, ledger, invoices, expenses, income, budgets
- `routes/production.cjs` — batches, work orders, centers, resources
- `routes/procurement.cjs` — purchases, suppliers, goods receipts
- `routes/examination.cjs` — exam jobs, batches, subjects, schools
- `routes/hr.cjs` — employees, payroll, payslips
- `routes/banking.cjs` — bank accounts, transactions, reconciliations
- `routes/system.cjs` — settings, users, audit logs, files

**Automation suggestion**: Write a code generator that reads the TypeScript types from `frontend/types/` and generates SQLite table schemas + Express CRUD routes automatically.

### Step 1.3: Add Business Logic (Week 3)

**What**: Move critical frontend business logic to backend

**Files to move/rewrite**:

| Current frontend file | Destination |
|----------------------|-------------|
| `transactionService.ts` | `backend/services/transactionService.cjs` |
| `examinationJobService.ts` | `backend/services/examinationService.cjs` |
| `masterInventoryPricingService.ts` | `backend/services/pricingEngine.cjs` |
| `receiptCalculationService.ts` | `backend/services/receiptService.cjs` |

**Key logic to port**:
- `transactionService.processSale()` — sale creation with inventory, ledger, customer balance
- `examinationJobService.calculateExam()` — BOM + market adjustment pricing
- Sales exchange approval workflow
- Payment allocation and receipt snapshot calculation
- VAT transaction recording

---

## Phase 2: Frontend Data Layer Migration (Weeks 5-8)

### Step 2.1: Replace dbService with API calls (Week 5-6)

**What**: Convert `api.ts` from "IndexedDB-first, backend-fallback" to "backend-only"

Current pattern (in `api.ts`):
```typescript
createSale: (sale) => handle(async () => {
  await transactionService.processSale(sale);  // IndexedDB first
  try {
    const response = await apiClient.post('/sales', sale);  // then backend
    await dbService.put('sales', response.data);
  } catch (err) {
    await dbService.put('sales', sale);  // fallback to local
  }
})
```

New pattern:
```typescript
createSale: (sale) => handle(async () => {
  const response = await apiClient.post('/sales', sale);
  return response.data;
})
```

**Files to modify**:
- `frontend/services/api.ts` — rewrite ALL methods to use backend API only
- `frontend/services/transactionService.ts` — move logic to backend, keep only if offline fallback needed
- `frontend/services/examinationJobService.ts` — move to backend

### Step 2.2: Add Offline Queue (Week 7)

**What**: Keep working when backend is unavailable

The current `offlineQueueManager.ts` already handles offline queuing. Adapt it to queue HTTP requests instead of IndexedDB writes.

**File to modify**: `frontend/services/apiClient.ts`

```typescript
// Intercept failed requests and queue them
apiClient.interceptors.response.use(
  response => response,
  async error => {
    if (!error.response && navigator.onLine === false) {
      await queueOfflineMutation({
        entityId: error.config.data?.id,
        operation: mapMethodToOperation(error.config.method),
        request: { url: error.config.url, method: error.config.method },
        payload: error.config.data,
      });
      return { data: { queued: true, ...error.config.data } };
    }
    return Promise.reject(error);
  }
);
```

### Step 2.3: Remove IndexedDB (Week 8)

**What**: Once all data flows through backend, remove IndexedDB dependency

**Files to remove**:
- `frontend/services/db.ts` — entire file (1094 lines)
- `frontend/services/dexie/` — entire directory (Dexie bridge)
- `frontend/services/productionDb.ts`
- `frontend/services/examinationDb.ts`
- `frontend/services/offlineDb.ts`

**Dependencies to remove from `frontend/package.json`**:
- `idb`
- `dexie`
- `dexie-react-hooks`

**Migration concern**: All Zustand stores that use `dbService` need updating:

```typescript
// Before (inventoryStore.ts)
const items = await dbService.getAll<Item>('inventory');

// After
const response = await apiClient.get('/api/inventory');
const items = response.data;
```

**Scope**: ~20-30 store files, dozens of components directly using `dbService`.

---

## Phase 3: Sync Layer (Weeks 9-10)

### Step 3.1: Supabase Schema Alignment (Week 9)

**What**: Ensure Supabase schema matches new backend SQLite schema

**File**: `supabase-migration.sql` — update to include all new tables

**Migration script**: Create `scripts/sync-schema.cjs` that:
1. Reads backend SQLite schema
2. Generates equivalent Supabase/PostgreSQL DDL
3. Applies to Supabase via `supabase db push` or REST API

### Step 3.2: Rewrite Sync Service (Week 9)

**What**: Change sync source from IndexedDB to backend SQLite

**File to rewrite**: `frontend/services/syncService.ts`

Current: reads from `dbService.getAll(table)` (IndexedDB)
New: reads from `apiClient.get('/api/sync/push')` (backend SQLite)

```typescript
// New approach — backend handles the sync logic
export async function pushLocalChanges(): Promise<SyncResult> {
  // Backend reads from SQLite, pushes to Supabase
  const { data } = await apiClient.post('/api/sync/push', {
    lastSyncAt: localStorage.getItem('nexus_last_sync')
  });
  return data;
}

export async function pullRemoteChanges(): Promise<SyncResult> {
  // Backend pulls from Supabase, writes to SQLite
  const { data } = await apiClient.post('/api/sync/pull', {
    lastSyncAt: localStorage.getItem('nexus_last_sync')
  });
  return data;
}
```

**New backend endpoints** (`backend/routes/sync.cjs`):

```javascript
// POST /api/sync/push
router.post('/api/sync/push', async (req, res) => {
  const lastSync = req.body.lastSyncAt;
  const tables = [...ALL_TABLES];
  
  for (const table of tables) {
    const rows = await getAllChangedSince(table, lastSync);
    if (rows.length > 0) {
      await supabase.from(table).upsert(rows, { onConflict: 'id' });
    }
  }
  res.json({ pushed: totalPushed, errors: [] });
});

// POST /api/sync/pull
router.post('/api/sync/pull', async (req, res) => {
  const lastSync = req.body.lastSyncAt;
  const tables = [...ALL_TABLES];
  
  for (const table of tables) {
    const { data } = await supabase
      .from(table)
      .select('*')
      .gte('updated_at', lastSync);
    
    for (const row of data) {
      upsertIntoLocalSQLite(table, row);
    }
  }
  res.json({ pulled: totalPulled, errors: [] });
});
```

### Step 3.3: Conflict Resolution (Week 10)

**Strategy**: **Last-Writer-Wins (LWW) with vector clocks**

**Implementation**:

1. Add `updated_at` timestamp + `version` integer to every table (both local and Supabase)
2. On sync conflict:
   - Higher `version` wins
   - Same version: later `updated_at` wins
   - Log conflict to `sync_conflict_log` table for audit

**Add to all tables**:
```sql
ALTER TABLE inventory ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));
ALTER TABLE inventory ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE inventory ADD COLUMN synced_at TEXT;
```

**Backend merge logic**:
```javascript
function resolveConflict(localRow, remoteRow) {
  if (localRow.version > remoteRow.version) return localRow;
  if (remoteRow.version > localRow.version) return remoteRow;
  // Same version — newer timestamp wins
  return new Date(localRow.updated_at) > new Date(remoteRow.updated_at)
    ? localRow : remoteRow;
}
```

---

## Phase 4: Cleanup & Optimization (Weeks 11-12)

### Step 4.1: Remove Legacy Code

- Remove `Dexie` bridge (`frontend/services/dexie/`)
- Remove `offlineDb.ts`
- Remove `productionDb.ts`, `examinationDb.ts`
- Remove `db.ts` (the core IndexedDB layer)
- Update all imports across the codebase

### Step 4.2: Performance Optimization

- Add SQLite indexes on frequently queried columns
- Add pagination to all GET endpoints
- Implement connection pooling for SQLite (use `better-sqlite3` for sync API instead of `sqlite3` async)
- Add data compression for sync payloads

### Step 4.3: Testing

- **Unit tests**: Backend route handlers, sync logic, conflict resolution
- **Integration tests**: Full flow (frontend → backend → SQLite → sync → Supabase → pull)
- **E2E tests**: Multi-device scenario with Cypress/Playwright

---

## Phase 5 (Future): Evaluate Modern Sync Engines

Once the SQLite-backend architecture is stable, evaluate:

### Option A: PowerSync
**When**: When real-time multi-device sync is critical
**Cost**: $49/mo or self-host
**Benefit**: Built-in WAL-based sync, no custom sync code
**Migration**: Replace custom sync endpoints with PowerSync SDK

### Option B: Zero (Rocicorp)
**When**: When you want open-source query-driven sync
**Cost**: Free (open-source)
**Benefit**: Only syncs data your queries need, GA since March 2026
**Migration**: Define TypeScript queries + mutators, Zero syncs to Supabase

### Option C: Wait for PGlite Sync Maturity
**When**: When `@electric-sql/pglite-sync` supports bidirectional sync (currently alpha, read-only from server)
**Benefit**: Full Postgres in browser, Electric's CRDT conflict resolution
**Migration**: Replace IndexedDB with PGlite, add Electric sync service

---

## Effort Summary

| Phase | Tasks | Estimated Effort | Dependencies |
|-------|-------|-----------------|--------------|
| **1.1** Complete backend schema | Add ~40 missing tables | 3-5 days | None |
| **1.2** Create REST API | Build CRUD for all entities | 5-10 days | 1.1 |
| **1.3** Migrate business logic | Port transaction services | 5-7 days | 1.2 |
| **2.1** Replace dbService calls | Rewrite api.ts + stores | 5-10 days | 1.2 |
| **2.2** Offline queue | Adapt apiClient.ts | 2-3 days | 2.1 |
| **2.3** Remove IndexedDB | Clean up files + deps | 2-3 days | 2.1 |
| **3.1** Supabase schema | Align with SQLite schema | 2 days | 1.1 |
| **3.2** Rewrite sync service | New backend sync endpoints | 3-5 days | 3.1 |
| **3.3** Conflict resolution | Version tracking + merge | 2-3 days | 3.2 |
| **4.1** Remove legacy code | File cleanup | 2-3 days | 2.3 |
| **4.2** Performance | Indexes, pagination | 2-3 days | 1.2 |
| **4.3** Testing | Unit + integration + E2E | 5-7 days | All above |
| **Total** | | **~38-64 days** | |

---

## Risk Matrix

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Data loss during sync | High | Medium | Keep IndexedDB as fallback during Phase 1-2 |
| Performance regression (HTTP vs IndexedDB) | Medium | High | Add caching layer, pagination |
| Business logic bugs when porting | High | Medium | Comprehensive test suite before/after migration |
| Offline fails when backend is down | High | Medium | Keep offline queue, but add local caching |
| Schema drift between SQLite and Supabase | Medium | Medium | Automated schema sync script |
| User data in IndexedDB becomes inaccessible | High | Low | Export/migration tool from IndexedDB to backend |

---

## Migration Safety

During migration (Phases 1-2), the system should run in **dual-write mode**:

```
All writes → IndexedDB (existing) AND Backend API (new)
All reads  → IndexedDB (existing) with backend as fallback
```

This ensures zero data loss. Once backend is verified stable, flip to:

```
All writes → Backend API (primary) with IndexedDB as fallback
All reads  → Backend API
```

Then remove IndexedDB entirely in Phase 4.
