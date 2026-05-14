import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { dbService } from '../services/db';
import { AuditLogEntry } from '../types';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Explicitly declare props to satisfy TypeScript in some environments
  public readonly props: Readonly<ErrorBoundaryProps>;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
    this.state = {
      hasError: false,
      error: null
    };
  }

  public state: ErrorBoundaryState;

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public async componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    
    try {
      const savedUser = sessionStorage.getItem('nexus_user');
      const user = savedUser ? JSON.parse(savedUser) : null;
      
      const logEntry: AuditLogEntry = {
        id: `CRASH-${Date.now()}`,
        date: new Date().toISOString(),
        action: 'SYSTEM_CRASH',
        entityType: 'Application',
        entityId: 'Frontend',
        details: `CRITICAL ERROR: ${error.message}`,
        userId: user?.username || 'system',
        userRole: user?.role || 'System',
        newValue: {
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          url: window.location.href,
          userAgent: navigator.userAgent,
          screen: `${window.innerWidth}x${window.innerHeight}`,
          timestamp: Date.now()
        }
      };
      
      await dbService.put('auditLogs', logEntry);
    } catch (logErr) {
      console.error('Failed to log error to audit logs:', logErr);
    }
  }

  private handleClearCache = async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (let registration of registrations) {
        await registration.unregister();
      }
      
      const cacheNames = await caches.keys();
      for (let name of cacheNames) {
        await caches.delete(name);
      }
      
      window.location.reload();
    } catch (err) {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md w-full bg-white rounded-xl shadow-xl p-8 text-center border border-slate-200">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">System Error</h1>
            <p className="text-slate-500 mb-6">
              The application encountered an unexpected error. Please try refreshing the page or clearing the cache.
            </p>
            <div className="bg-slate-100 p-4 rounded-lg text-left mb-6 overflow-auto max-h-32 border border-slate-200">
                <code className="text-xs text-slate-700 font-mono break-all">
                    {this.state.error?.message || 'Unknown Error'}
                </code>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
              >
                <RefreshCw size={18} /> Reload Application
              </button>
              <button
                onClick={this.handleClearCache}
                className="w-full bg-slate-100 text-slate-600 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
              >
                Clear Cache & Restart
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}