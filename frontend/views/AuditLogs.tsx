import React from 'react';
import { useData } from '../context/DataContext';
import { AuditTimeline } from './shared/components/AuditTimeline';

const AuditLogs: React.FC = () => {
    const { auditLogs = [] } = useData();

    return (
        <div className="p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col font-sans">
            <AuditTimeline logs={auditLogs} />
            <div className="mt-6 flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 bg-slate-100/50 p-2 rounded-xl border border-slate-200">
                <span className="text-amber-500">🛡️</span>
                Notice: Audit logs are immutable and permanent. They cannot be modified or deleted, ensuring full regulatory compliance and non-repudiation.
            </div>
        </div>
    );
};

export default AuditLogs;
