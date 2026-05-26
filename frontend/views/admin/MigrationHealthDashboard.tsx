import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  HardDrive,
  Layers3,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { rxdbDiagnostics, type MigrationHealthDashboard as DiagnosticsDashboard } from '../../services/rxdb/diagnostics';
import { getMigrationControlPlane } from '../../services/rxdb/migration-control';
import { usePrimeDbRuntimeStore } from '../../services/rxdb/zustand';

type ControlDashboard = Awaited<ReturnType<ReturnType<typeof getMigrationControlPlane>['getDashboard']>>;

const formatBytes = (value: number | null | undefined) => {
  if (!Number.isFinite(value)) {
    return 'Unavailable';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = Number(value);
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const routeTone: Record<string, string> = {
  legacy: 'bg-slate-100 text-slate-700',
  'dual-read': 'bg-amber-100 text-amber-700',
  'shadow-write': 'bg-blue-100 text-blue-700',
  rxdb: 'bg-emerald-100 text-emerald-700'
};

const MigrationHealthDashboard: React.FC = () => {
  const navigate = useNavigate();
  const runtime = usePrimeDbRuntimeStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsDashboard | null>(null);
  const [control, setControl] = useState<ControlDashboard | null>(null);
  const [indexedDbInfo, setIndexedDbInfo] = useState<{ databaseName: string; collections: string[]; leader: boolean } | null>(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const controlPlane = getMigrationControlPlane();
      const [health, controlDashboard, indexedDb] = await Promise.all([
        rxdbDiagnostics.getHealthDashboard(),
        controlPlane.getDashboard(),
        rxdbDiagnostics.inspectIndexedDb()
      ]);

      setDiagnostics(health);
      setControl(controlDashboard);
      setIndexedDbInfo(indexedDb);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load migration diagnostics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const usagePercent = diagnostics?.storage.quotaBytes
    ? Math.min(100, Math.round(((diagnostics.storage.usageBytes || 0) / diagnostics.storage.quotaBytes) * 100))
    : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2.5 rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-3">
              <Database className="text-blue-600" size={24} />
              Migration Health Dashboard
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Live diagnostics for the hybrid RxDB migration, queue behavior, and storage reliability.
            </p>
          </div>
        </div>

        <button
          onClick={() => void load(true)}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-200 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Refresh Snapshot
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Runtime</span>
            {runtime.online ? <Wifi size={16} className="text-emerald-500" /> : <WifiOff size={16} className="text-rose-500" />}
          </div>
          <div className="mt-4 text-2xl font-black text-slate-900">{runtime.ready ? 'Ready' : 'Starting'}</div>
          <p className="mt-2 text-sm text-slate-500">
            {runtime.leader ? 'Leader tab active' : 'Follower tab'} and {runtime.online ? 'online' : 'offline'}.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Queue</span>
            <Activity size={16} className="text-blue-500" />
          </div>
          <div className="mt-4 text-2xl font-black text-slate-900">{diagnostics?.queue.total ?? 0}</div>
          <p className="mt-2 text-sm text-slate-500">
            Pending operations: {runtime.pendingOperations}. Failed: {diagnostics?.queue.byStatus.failed ?? 0}.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Storage</span>
            <HardDrive size={16} className="text-amber-500" />
          </div>
          <div className="mt-4 text-2xl font-black text-slate-900">{formatBytes(diagnostics?.storage.usageBytes)}</div>
          <p className="mt-2 text-sm text-slate-500">
            Quota: {formatBytes(diagnostics?.storage.quotaBytes)}. Persistence {runtime.persistenceGranted ? 'granted' : 'not granted'}.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Cutover</span>
            <Layers3 size={16} className="text-emerald-500" />
          </div>
          <div className="mt-4 text-2xl font-black text-slate-900">{control?.routeSummary.rxdb ?? 0}</div>
          <p className="mt-2 text-sm text-slate-500">
            RxDB primary collections. Dual-read: {control?.routeSummary['dual-read'] ?? 0}. Shadow-write: {control?.routeSummary['shadow-write'] ?? 0}.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr,0.7fr]">
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Collection Status</h2>
              <p className="mt-1 text-sm text-slate-500">Route modes, document counts, corruption signals, and migration warnings.</p>
            </div>
            {loading && <RefreshCw size={16} className="animate-spin text-slate-400" />}
          </div>

          {error ? (
            <div className="m-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.2em] text-slate-400">
                  <tr>
                    <th className="px-5 py-3 font-bold">Collection</th>
                    <th className="px-5 py-3 font-bold">Route</th>
                    <th className="px-5 py-3 font-bold">Docs</th>
                    <th className="px-5 py-3 font-bold">Deleted</th>
                    <th className="px-5 py-3 font-bold">Corruption</th>
                    <th className="px-5 py-3 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(diagnostics?.collections || []).map((collection) => (
                    <tr key={collection.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">{collection.label}</div>
                        <div className="text-xs text-slate-500 mt-1">{collection.id}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${routeTone[collection.routeMode] || 'bg-slate-100 text-slate-700'}`}>
                          {collection.routeMode}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-900">{collection.totalDocuments ?? 'n/a'}</td>
                      <td className="px-5 py-4 text-sm text-slate-600">{collection.deletedDocuments ?? 'n/a'}</td>
                      <td className="px-5 py-4">
                        <span className={`text-sm font-semibold ${collection.corruptedDocuments > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {collection.corruptedDocuments}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {collection.warnings.length > 0 ? (
                          <div className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            {collection.warnings[collection.warnings.length - 1]}
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600">
                            <CheckCircle2 size={14} />
                            Healthy
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-900">
              <ShieldCheck size={18} className="text-emerald-500" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Storage Pressure</h2>
            </div>
            <div className="mt-4 rounded-full bg-slate-100 h-3 overflow-hidden">
              <div
                className={`h-full rounded-full ${usagePercent >= 85 ? 'bg-rose-500' : usagePercent >= 65 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-slate-600">{usagePercent}% of estimated browser quota in use.</p>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Route Summary</h2>
            <div className="mt-4 space-y-3">
              {Object.entries(control?.routeSummary || {}).map(([mode, total]) => (
                <div key={mode} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-600 capitalize">{mode}</span>
                  <span className="text-lg font-black text-slate-900">{total}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">IndexedDB Inspector</h2>
            <p className="mt-2 text-sm text-slate-500">{indexedDbInfo?.databaseName || 'Unavailable'}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(indexedDbInfo?.collections || []).map((collection) => (
                <span key={collection} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {collection}
                </span>
              ))}
            </div>
            <p className="mt-4 text-sm text-slate-500">
              Leader election: {indexedDbInfo?.leader ? 'this tab owns leadership' : 'leadership is held by another tab'}.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default MigrationHealthDashboard;
