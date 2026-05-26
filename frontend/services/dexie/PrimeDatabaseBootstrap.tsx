import React, { useEffect, useRef, useState, useCallback } from 'react';
import { usePrimeDbRuntimeStore } from './zustand';
import { databaseManager } from './DatabaseManager';
import { phaseManager } from './startup/PhaseManager';
import { startupOrchestrator } from './startup/StartupOrchestrator';

const STAGE_LABELS: Record<string, string> = {
  critical: 'Initializing database...',
  dashboard: 'Loading workspace...',
  background: 'Preparing offline data...',
  complete: 'Ready',
};

interface BootstrapErrorProps {
  error: string;
  onRetry: () => void;
  onReset: () => void;
}

const BootstrapError: React.FC<BootstrapErrorProps> = ({ error, onRetry, onReset }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', padding: 32,
    fontFamily: 'system-ui, sans-serif', color: '#b91c1c',
  }}>
    <h2 style={{ marginBottom: 8 }}>Database Initialization Error</h2>
    <p style={{ marginBottom: 16, color: '#666', maxWidth: 500, textAlign: 'center' }}>{error}</p>
    <div style={{ display: 'flex', gap: 8 }}>
      <button onClick={onRetry} style={{ padding: '8px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Retry</button>
      <button onClick={onReset} style={{ padding: '8px 24px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Reset & Retry</button>
    </div>
  </div>
);

export const PrimeDatabaseBootstrap: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const lastError = usePrimeDbRuntimeStore((state) => state.lastError);
  const ready = usePrimeDbRuntimeStore((state) => state.ready);
  const migrating = usePrimeDbRuntimeStore((state) => state.migrating);
  const bootStage = usePrimeDbRuntimeStore((state) => state.bootStage);
  const progress = usePrimeDbRuntimeStore((state) => state.bootProgress);
  const disposedRef = useRef(false);
  const retryKeyRef = useRef(0);

  const handleInit = useCallback(async () => {
    disposedRef.current = false;
    usePrimeDbRuntimeStore.setState({ migrating: true, bootStage: 'critical', lastError: null });

    try {
      await databaseManager.initialize();
      usePrimeDbRuntimeStore.setState({ ready: true, bootStage: 'dashboard' });

      await phaseManager.registerCoreTasks();

      startupOrchestrator.execute().then((results) => {
        const success = results.filter((r) => r.status === 'completed').length;
        const failed = results.filter((r) => r.status === 'failed').length;
        console.debug(`[Dexie] Startup complete: ${success} succeeded, ${failed} failed`);
        usePrimeDbRuntimeStore.setState({ bootStage: 'complete', migrating: false });
      }).catch(() => {
        usePrimeDbRuntimeStore.setState({ bootStage: 'complete', migrating: false });
      });

      const handleOnline = () => usePrimeDbRuntimeStore.setState({ online: true });
      const handleOffline = () => usePrimeDbRuntimeStore.setState({ online: false });

      if (typeof window !== 'undefined') {
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
      }
    } catch (error) {
      if (!disposedRef.current) {
        usePrimeDbRuntimeStore.setState({
          ready: false, migrating: false,
          lastError: error instanceof Error ? error.message : 'Failed to initialize database.',
        });
      }
    }
  }, []);

  useEffect(() => {
    if (disposedRef.current) return;
    handleInit();
    return () => { disposedRef.current = true; };
  }, [retryKeyRef.current]);

  if (lastError && !migrating) {
    return (
      <BootstrapError
        error={lastError}
        onRetry={() => { disposedRef.current = false; retryKeyRef.current++; usePrimeDbRuntimeStore.setState({ lastError: null, migrating: true }); }}
        onReset={async () => {
          await databaseManager.reset();
          disposedRef.current = false;
          retryKeyRef.current++;
          usePrimeDbRuntimeStore.setState({ lastError: null, migrating: true });
        }}
      />
    );
  }

  if (!ready && !migrating && !lastError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#666', gap: 12 }}>
        <div>Initializing database...</div>
      </div>
    );
  }

  if (migrating || bootStage !== 'complete') {
    const label = STAGE_LABELS[bootStage] || 'Initializing...';
    const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#666', gap: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 500 }}>{label}</div>
        <div style={{ width: 240, height: 4, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: '#2563eb', borderRadius: 2, transition: 'width 0.3s ease' }} />
        </div>
        {progress.total > 0 && (
          <div style={{ fontSize: 13, color: '#9ca3af' }}>{progress.completed}/{progress.total}</div>
        )}
      </div>
    );
  }

  return <>{children}</>;
};
