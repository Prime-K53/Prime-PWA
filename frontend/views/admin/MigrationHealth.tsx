import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Database, Activity, Shield, AlertTriangle, CheckCircle, XCircle,
  ArrowLeft, Server, HardDrive, RefreshCw, Layers, FileText,
  BarChart3, Clock, Users, Wrench, Settings, Truck, BookOpen,
  DollarSign, TrendingUp, Box, Cpu
} from 'lucide-react';
import { databaseManager } from '../../services/dexie/DatabaseManager';
import { dexieBridge } from '../../services/dexie/bridge';
import { checkIntegrity, findOrphans } from '../../services/dexie/utils/integrity';
import { validateSchema } from '../../services/dexie/utils/validation';
import { dexieQueueCoordinator } from '../../services/dexie/queue-coordinator';
import { usePrimeDbRuntimeStore, getStorageEstimate } from '../../services/dexie/zustand';
import { TABLE_DEFINITIONS, ALL_TABLES, type Domain } from '../../services/dexie/schema-types';

const DOMAIN_ICONS: Record<Domain, React.ReactNode> = {
  core: <Cpu size={14} />,
  finance: <DollarSign size={14} />,
  inventory: <Box size={14} />,
  production: <Wrench size={14} />,
  examination: <BookOpen size={14} />,
  analytics: <TrendingUp size={14} />,
  sync: <RefreshCw size={14} />,
  system: <Settings size={14} />,
};

const DOMAIN_COLORS: Record<Domain, string> = {
  core: 'bg-slate-100 text-slate-600',
  finance: 'bg-emerald-100 text-emerald-700',
  inventory: 'bg-amber-100 text-amber-700',
  production: 'bg-indigo-100 text-indigo-700',
  examination: 'bg-rose-100 text-rose-700',
  analytics: 'bg-cyan-100 text-cyan-700',
  sync: 'bg-violet-100 text-violet-700',
  system: 'bg-gray-100 text-gray-600',
};

const StatCard: React.FC<{ label: string; value: string | number; icon: React.ReactNode; color?: string }> = ({ label, value, icon, color }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
    <div className="flex items-center gap-3 mb-3">
      <div className={`p-2 rounded-lg ${color || 'bg-blue-100 text-blue-600'}`}>{icon}</div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{label}</p>
    </div>
    <p className="text-2xl font-black text-slate-900">{value}</p>
  </div>
);

const StatusBadge: React.FC<{ healthy: boolean }> = ({ healthy }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${healthy ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
    {healthy ? <CheckCircle size={10} /> : <XCircle size={10} />}
    {healthy ? 'Healthy' : 'Issues'}
  </span>
);

const MigrationHealth: React.FC = () => {
  const navigate = useNavigate();
  const runtime = usePrimeDbRuntimeStore();

  const [dbHealth, setDbHealth] = useState<{ healthy: boolean; tables: number } | null>(null);
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({});
  const [integrity, setIntegrity] = useState<{ healthy: boolean; issues: any[] } | null>(null);
  const [orphans, setOrphans] = useState<any[]>([]);
  const [schemaResult, setSchemaResult] = useState<any>(null);
  const [queueMetrics, setQueueMetrics] = useState<any>(null);
  const [storageEstimate, setStorageEstimate] = useState<{ quota?: number; usage?: number }>({});
  const [migrationState, setMigrationState] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [health, counts, integrityResult, orphanList, schema, queue, storage, db] = await Promise.all([
        dexieBridge.checkHealth(),
        loadTableCounts(),
        checkIntegrity(),
        findOrphans(),
        validateSchema(),
        dexieQueueCoordinator.getMetrics(),
        getStorageEstimate(),
        databaseManager.getDatabase(),
      ]);

      setDbHealth(health);
      setTableCounts(counts);
      setIntegrity(integrityResult);
      setOrphans(orphanList);
      setSchemaResult(schema);
      setQueueMetrics(queue);

      if (storage.quota !== undefined || storage.usage !== undefined) {
        setStorageEstimate(storage);
      }

      const migrationDoc = await db.settings.get('system:legacy-migration-complete');
      if (migrationDoc) {
        setMigrationState((migrationDoc as any).value);
      }
    } catch (err) {
      console.error('MigrationHealth: error loading data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadTableCounts = async (): Promise<Record<string, number>> => {
    try {
      const db = await databaseManager.getDatabase();
      const counts: Record<string, number> = {};
      for (const tableName of ALL_TABLES) {
        const table = (db as any)[tableName];
        if (table) {
          try { counts[tableName] = await table.count(); } catch { counts[tableName] = -1; }
        }
      }
      return counts;
    } catch {
      return {};
    }
  };

  const formatBytes = (bytes: number | null | undefined) => {
    if (bytes == null) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const totalDocs = Object.values(tableCounts).reduce((sum, c) => sum + Math.max(0, c), 0);

  const collectionRoutes = [
    { legacy: 'inventory', enterprise: 'products', route: 'shadow-write' },
    { legacy: 'customers', enterprise: 'customers', route: 'rxdb' },
    { legacy: 'suppliers', enterprise: 'suppliers', route: 'shadow-write' },
    { legacy: 'invoices', enterprise: 'invoices', route: 'shadow-write' },
    { legacy: 'workCenters', enterprise: 'workCenters', route: 'rxdb' },
    { legacy: 'resources', enterprise: 'productionResources', route: 'rxdb' },
    { legacy: 'auditLogs', enterprise: 'auditLogs', route: 'rxdb' },
    { legacy: 'examinationBatchNotifications', enterprise: 'notifications', route: 'rxdb' },
  ];

  const routeColor = (route: string) => {
    switch (route) {
      case 'rxdb': return 'text-emerald-600 bg-emerald-100';
      case 'shadow-write': return 'text-amber-600 bg-amber-100';
      case 'dual-read': return 'text-blue-600 bg-blue-100';
      default: return 'text-slate-600 bg-slate-100';
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col font-sans">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors border border-slate-200 bg-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Database className="text-cyan-600" size={24} /> Migration Health
            </h1>
            <p className="text-sm text-slate-500 mt-1">RxDB Phase 2 cutover diagnostics and collection health</p>
          </div>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={24} className="animate-spin text-cyan-500" />
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Loading diagnostics...</p>
          </div>
        </div>
      )}

      {!loading && (
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-1">
          {/* Overview Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <StatCard label="Total Documents" value={totalDocs.toLocaleString()} icon={<FileText size={16} />} color="bg-blue-100 text-blue-600" />
            <StatCard label="DB Tables" value={ALL_TABLES.length} icon={<Layers size={16} />} color="bg-purple-100 text-purple-600" />
            <StatCard label="Queue Items" value={queueMetrics?.total ?? 0} icon={<BarChart3 size={16} />} color="bg-amber-100 text-amber-600" />
            <StatCard label="Storage Used" value={formatBytes(storageEstimate.usage)} icon={<HardDrive size={16} />} color="bg-cyan-100 text-cyan-600" />
            <StatCard label="Storage Quota" value={formatBytes(storageEstimate.quota)} icon={<Server size={16} />} color="bg-slate-100 text-slate-600" />
            <StatCard label="Boot Stage" value={runtime.bootStage} icon={<Activity size={16} />} color="bg-indigo-100 text-indigo-600" />
          </div>

          {/* Database Health */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server size={16} className="text-slate-400" />
                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-widest">Database Health</h3>
              </div>
              <StatusBadge healthy={dbHealth?.healthy ?? false} />
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Connected</p>
                <p className="text-sm font-bold text-slate-800 mt-1">{dbHealth?.healthy ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">DB Driver</p>
                <p className="text-sm font-bold text-slate-800 mt-1">Dexie.js</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Enterprise Tables</p>
                <p className="text-sm font-bold text-slate-800 mt-1">{dbHealth?.tables ?? 0}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Leader</p>
                <p className="text-sm font-bold text-slate-800 mt-1">{runtime.leader ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </div>

          {/* Collection Routes */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <Layers size={16} className="text-slate-400" />
              <h3 className="font-bold text-slate-700 text-sm uppercase tracking-widest">Collection Route Map</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left p-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Legacy Store</th>
                    <th className="text-left p-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Enterprise Collection</th>
                    <th className="text-left p-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Route Mode</th>
                    <th className="text-right p-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Documents</th>
                  </tr>
                </thead>
                <tbody>
                  {collectionRoutes.map((cr) => (
                    <tr key={cr.legacy} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="p-3 font-mono text-xs text-slate-600">{cr.legacy}</td>
                      <td className="p-3 font-mono text-xs text-slate-800">{cr.enterprise}</td>
                      <td className="p-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${routeColor(cr.route)}`}>
                          {cr.route}
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-slate-800">{tableCounts[cr.enterprise]?.toLocaleString() ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Table Statistics by Domain */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <BarChart3 size={16} className="text-slate-400" />
              <h3 className="font-bold text-slate-700 text-sm uppercase tracking-widest">Table Statistics by Domain</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left p-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Domain</th>
                    <th className="text-left p-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Table</th>
                    <th className="text-right p-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Documents</th>
                    <th className="text-center p-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(TABLE_DEFINITIONS).map(([tableName, def]) => {
                    const count = tableCounts[tableName];
                    const schemaValid = schemaResult?.tables?.[tableName]?.valid !== false;
                    return (
                      <tr key={tableName} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${DOMAIN_COLORS[def.domain]}`}>
                            {DOMAIN_ICONS[def.domain]}
                            {def.domain}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-xs text-slate-800">{tableName}</td>
                        <td className="p-3 text-right font-bold text-slate-800">
                          {count != null && count >= 0 ? count.toLocaleString() : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="p-3 text-center">
                          <StatusBadge healthy={schemaValid} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Queue Metrics */}
          {queueMetrics && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                <BarChart3 size={16} className="text-slate-400" />
                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-widest">Queue Metrics</h3>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">By Status</p>
                  <div className="space-y-1.5">
                    {Object.entries(queueMetrics.byStatus || {}).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between">
                        <span className="text-xs font-mono text-slate-600">{status}</span>
                        <span className="text-xs font-bold text-slate-800">{(count as number).toLocaleString()}</span>
                      </div>
                    ))}
                    {Object.keys(queueMetrics.byStatus || {}).length === 0 && (
                      <p className="text-xs text-slate-400">No items</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">By Priority</p>
                  <div className="space-y-1.5">
                    {Object.entries(queueMetrics.byPriority || {}).map(([priority, count]) => (
                      <div key={priority} className="flex items-center justify-between">
                        <span className="text-xs font-mono text-slate-600">{priority}</span>
                        <span className="text-xs font-bold text-slate-800">{(count as number).toLocaleString()}</span>
                      </div>
                    ))}
                    {Object.keys(queueMetrics.byPriority || {}).length === 0 && (
                      <p className="text-xs text-slate-400">No items</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Integrity Check */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-slate-400" />
                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-widest">Data Integrity</h3>
              </div>
              <StatusBadge healthy={integrity?.healthy ?? true} />
            </div>
            <div className="p-4">
              {integrity && integrity.issues.length > 0 ? (
                <div className="space-y-2">
                  {integrity.issues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-red-50 border border-red-100">
                      <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-red-700">{issue.table} / {issue.id}</p>
                        <p className="text-[11px] text-red-600">{issue.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <CheckCircle size={16} className="text-emerald-500" />
                  No integrity issues found
                </div>
              )}
              {orphans.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Orphan Records</p>
                  {orphans.map((o, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-100">
                      <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-amber-700">{o.table} / {o.id}</p>
                        <p className="text-[11px] text-amber-600">{o.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Migration Status */}
          {migrationState && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                <Activity size={16} className="text-slate-400" />
                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-widest">Legacy Migration</h3>
              </div>
              <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status</p>
                  <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    migrationState.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                    migrationState.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {migrationState.status}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Started</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">{new Date(migrationState.startedAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Completed</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">
                    {migrationState.completedAt ? new Date(migrationState.completedAt).toLocaleString() : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Collections Migrated</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">{Object.keys(migrationState.collections || {}).length}</p>
                </div>
              </div>
              {migrationState.warnings && migrationState.warnings.length > 0 && (
                <div className="px-4 pb-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Warnings</p>
                  <div className="space-y-1">
                    {migrationState.warnings.map((w: string, i: number) => (
                      <p key={i} className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle size={10} /> {w}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Storage */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <HardDrive size={16} className="text-slate-400" />
              <h3 className="font-bold text-slate-700 text-sm uppercase tracking-widest">IndexedDB Storage</h3>
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Persistent Storage</p>
                <p className="text-sm font-bold text-slate-800 mt-1">{runtime.persistenceGranted ? 'Granted' : 'Not Requested'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Usage</p>
                <p className="text-sm font-bold text-slate-800 mt-1">{formatBytes(storageEstimate.usage)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Quota</p>
                <p className="text-sm font-bold text-slate-800 mt-1">{formatBytes(storageEstimate.quota)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Usage %</p>
                <p className="text-sm font-bold text-slate-800 mt-1">
                  {storageEstimate.usage != null && storageEstimate.quota != null && storageEstimate.quota > 0
                    ? `${((storageEstimate.usage / storageEstimate.quota) * 100).toFixed(1)}%`
                    : 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MigrationHealth;
