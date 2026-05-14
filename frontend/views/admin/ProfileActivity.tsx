import React, { useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { History as HistoryIcon, Clock, Activity, Shield, User as UserIcon, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ProfileActivity: React.FC = () => {
  const { auditLogs, user } = useData();
  const navigate = useNavigate();

  const userLogs = useMemo(() => {
    return auditLogs
      .filter((log: any) => log.userId === user?.username)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [auditLogs, user]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = userLogs.filter((l: any) => l.date.startsWith(today));
    return {
      total: userLogs.length,
      today: todayLogs.length,
      lastAction: userLogs[0]?.action || 'None'
    };
  }, [userLogs]);

  return (
    <div className="p-6 max-w-4xl mx-auto h-[calc(100vh-4rem)] flex flex-col font-sans">
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)} 
            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors border border-slate-200 bg-white"
          >
            <ArrowLeft size={20}/>
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <UserIcon className="text-blue-600" size={24}/> User Activity Profile
            </h1>
            <p className="text-sm text-slate-500 mt-1">Audit trail for @{user?.username || 'user'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 shrink-0">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Total Actions</p>
          <p className="text-3xl font-black text-slate-900">{stats.total}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Actions Today</p>
          <p className="text-3xl font-black text-blue-600">{stats.today}</p>
        </div>
        <div className="bg-slate-900 p-6 rounded-2xl shadow-xl text-white">
          <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-1">Last Logged Action</p>
          <p className="text-lg font-bold truncate">{stats.lastAction}</p>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2 shrink-0">
          <HistoryIcon size={16} className="text-slate-400"/>
          <h3 className="font-bold text-slate-700 text-sm uppercase tracking-widest">Operation History</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {userLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
              <Clock size={48} className="mb-4"/>
              <p className="font-bold uppercase tracking-widest text-xs">No activity found</p>
            </div>
          ) : (
            <div className="space-y-8 relative pl-4 border-l-2 border-slate-100 ml-2">
              {userLogs.map((log: any, i: number) => (
                <div key={log.id} className="relative">
                  <div className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-sm"></div>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-800">{log.action}</span>
                        <span className="text-[9px] font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-500 uppercase">{log.id}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl">{log.details}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] font-black text-slate-400 uppercase">{new Date(log.date).toLocaleDateString()}</p>
                      <p className="text-[10px] font-bold text-blue-600">{new Date(log.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileActivity;
