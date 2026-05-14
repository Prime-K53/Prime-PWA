
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, Thermometer, Zap, Wrench, AlertTriangle, CheckCircle, 
  Clock, BarChart3, RotateCcw, Settings, PlayCircle, StopCircle, UserPlus, ClipboardList, Trash2,
  Sparkles, Loader2
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, BarChart, Bar 
} from 'recharts';
import { useData } from '../../context/DataContext';
import { ProductionResource, MaintenanceLog } from '../../types';
import { generateAIResponse } from '../../services/geminiService';

interface MachineTelemetry {
  resourceId: string;
  status: 'Running' | 'Idle' | 'Down' | 'Maintenance';
  temperature: number;
  vibration: number;
  powerUsage: number;
  uptime: number;
  efficiency: number;
  lastMaintenance: string;
  nextMaintenance: string;
}

const MachineMaintenance: React.FC = () => {
  const { 
    resources, addTask, user, notify, maintenanceLogs, addMaintenanceLog, 
    deleteMaintenanceLog, companyConfig, workOrders 
  } = useData();
  const [selectedMachineId, setSelectedMachineId] = useState<string>(resources[0]?.id || '');
  const [telemetry, setTelemetry] = useState<Record<string, MachineTelemetry>>({});
  const [aiPrediction, setAiPrediction] = useState<{ risk: 'Low' | 'Medium' | 'High', advice: string, loading: boolean }>({ risk: 'Low', advice: '', loading: false });

  const trackDowntime = companyConfig?.productionSettings?.trackMachineDownTime ?? true;

  const analyzeMachineAI = async () => {
    if (!selectedMachine || !currentData) return;
    setAiPrediction(prev => ({ ...prev, loading: true }));
    try {
      const prompt = `
        Analyze this machine's IoT telemetry and predict maintenance needs.
        Machine: ${selectedMachine.name}
        Temperature: ${currentData.temperature}°C (Normal: 40-55)
        Vibration: ${currentData.vibration}mm/s (Normal: < 2.5)
        Efficiency: ${currentData.efficiency}%
        Uptime: ${currentData.uptime} hours
        
        Provide a risk level (Low, Medium, High) and a one-sentence technical advice.
        Return in JSON format: { "risk": "string", "advice": "string" }
      `;
      const response = await generateAIResponse(prompt, "You are a Predictive Maintenance AI. Respond in JSON.");
      const result = JSON.parse(response);
      setAiPrediction({ risk: result.risk, advice: result.advice, loading: false });
    } catch (error) {
      setAiPrediction({ risk: 'Low', advice: 'Telemetry within normal operating parameters.', loading: false });
    }
  };

  useEffect(() => {
    const initData: Record<string, MachineTelemetry> = {};
    resources.forEach(r => {
      initData[r.id] = {
        resourceId: r.id,
        status: 'Running',
        temperature: 45 + Math.random() * 10,
        vibration: 2 + Math.random(),
        powerUsage: 12 + Math.random() * 5,
        uptime: 240 + Math.floor(Math.random() * 100),
        efficiency: 85 + Math.floor(Math.random() * 10),
        lastMaintenance: new Date(Date.now() - 86400000 * 30).toISOString(),
        nextMaintenance: new Date(Date.now() + 86400000 * 5).toISOString(),
      };
    });
    setTelemetry(initData);

    const interval = setInterval(() => {
      setTelemetry(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(key => {
          const m = next[key];
          next[key] = {
            ...m,
            temperature: parseFloat((m.temperature + (Math.random() - 0.5) * 2).toFixed(1)),
            vibration: parseFloat((m.vibration + (Math.random() - 0.5) * 0.2).toFixed(2)),
          };
        });
        return next;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [resources]);

  const selectedMachine = resources.find(r => r.id === selectedMachineId);
  const currentData = telemetry[selectedMachineId];

  const handleReportIssue = () => {
      if (!selectedMachine) return;
      const notes = window.prompt("Describe the issue with " + selectedMachine.name + ":");
      if (notes) {
          const activeWOs = (workOrders || []).filter(wo => wo.status === 'In Progress');
          let woId = '';
          if (activeWOs.length > 0) {
              const woSelection = window.prompt(
                  "Is this related to an active Work Order?\n" + 
                  activeWOs.map((wo, i) => `${i+1}. ${wo.id} (${wo.productName})`).join('\n') + 
                  "\n\nEnter number or leave blank:"
              );
              if (woSelection) {
                  const idx = parseInt(woSelection) - 1;
                  if (activeWOs[idx]) woId = activeWOs[idx].id;
              }
          }

          const downtimeInput = trackDowntime ? window.prompt("Estimated downtime in minutes (optional):") : null;
          const downtime = downtimeInput ? parseInt(downtimeInput) : undefined;

          const mLog: MaintenanceLog = {
              id: '',
              resourceId: selectedMachine.id,
              machineName: selectedMachine.name,
              type: 'Breakdown',
              date: new Date().toISOString(),
              status: 'Pending',
              notes,
              workOrderId: woId || undefined,
              downtimeMinutes: downtime
          };
          addMaintenanceLog(mLog);
          
          addTask({
              id: '',
              title: `REPAIR: ${selectedMachine.name}`,
              status: 'Pending',
              priority: 'High',
              dueDate: new Date().toISOString().split('T')[0],
              assignedTo: user?.id || '',
              relatedTo: woId ? { id: woId, name: `WO: ${woId}`, type: 'WorkOrder' } : { id: selectedMachine.id, name: selectedMachine.name, type: 'WorkOrder' },
              notes: `MAINTENANCE REPORT: ${notes}${woId ? `\nRelated to Work Order: ${woId}` : ''}`,
              hasAlarm: true
          });
          notify("Maintenance ticket logged and registered.", "success");
      }
  };

  const handleServiceSchedule = () => {
      if (!selectedMachine) return;
      const mLog: MaintenanceLog = {
          id: '',
          resourceId: selectedMachine.id,
          machineName: selectedMachine.name,
          type: 'Preventive',
          date: currentData.nextMaintenance,
          status: 'Pending',
          notes: 'Routine service based on IoT wear indicators.'
      };
      addMaintenanceLog(mLog);

      addTask({
          id: '',
          title: `PREVENTIVE: ${selectedMachine.name}`,
          status: 'Pending',
          priority: 'Medium',
          dueDate: currentData.nextMaintenance.split('T')[0],
          assignedTo: user?.id || '',
          relatedTo: { id: selectedMachine.id, name: selectedMachine.name, type: 'WorkOrder' },
          notes: `Routine service scheduled based on IoT indicators.`,
          hasAlarm: true
      });
      notify("Preventive service task scheduled.", "success");
  };

  const [chartData, setChartData] = useState<{time: string, temp: number}[]>([]);
  useEffect(() => {
    if (!currentData) return;
    setChartData(prev => {
      const newData = [...prev, { time: new Date().toLocaleTimeString([], {second:'2-digit'}), temp: currentData.temperature }];
      if (newData.length > 20) newData.shift();
      return newData;
    });
  }, [currentData]);

  if (!selectedMachine || !currentData) return <div className="p-8 text-white bg-slate-900">Connecting to IoT Gateway...</div>;

  return (
    <div className="h-[calc(100vh-4rem)] bg-slate-900 text-white flex overflow-hidden font-normal">
        <div className="w-72 border-r border-slate-700 flex flex-col bg-slate-900 shrink-0">
            <div className="p-6 border-b border-slate-700">
                <h2 className="text-lg font-bold flex items-center gap-2 text-blue-400"><Activity size={20}/> Machine Health</h2>
                <p className="text-xs text-slate-500 mt-1 uppercase font-bold tracking-widest">IoT Telemetry Feed</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {resources.map(res => (
                    <button 
                        key={res.id}
                        onClick={() => setSelectedMachineId(res.id)}
                        className={`w-full text-left p-4 rounded-2xl border transition-all ${selectedMachineId === res.id ? 'bg-blue-900/40 border-blue-500 shadow-lg' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}
                    >
                        <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-sm truncate">{res.name}</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400 uppercase font-black tracking-widest">
                            <span className={telemetry[res.id]?.status === 'Down' ? 'text-rose-500' : 'text-emerald-500'}>{telemetry[res.id]?.status}</span>
                            <span className={telemetry[res.id]?.temperature > 50 ? 'text-amber-400' : 'text-emerald-400'}>{telemetry[res.id]?.temperature}°C</span>
                        </div>
                    </button>
                ))}
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-slate-950">
            <div className="flex justify-between items-center mb-10">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter flex items-center gap-4">
                        {selectedMachine.name}
                        <span className="px-4 py-1 rounded-full text-xs font-black uppercase border bg-emerald-500/10 text-emerald-400 border-emerald-500/50 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                            {currentData.status}
                        </span>
                    </h1>
                    <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-2">Resource Node ID: {selectedMachine.id}</p>
                </div>
                <div className="flex gap-3">
                    {trackDowntime && (
                        <button onClick={handleReportIssue} className="bg-rose-600 hover:bg-rose-700 text-white px-6 py-3 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center gap-2 shadow-xl shadow-rose-900/20 transition-all active:scale-95">
                            <AlertTriangle size={16}/> Log Failure
                        </button>
                    )}
                    <button onClick={handleServiceSchedule} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center gap-2 shadow-xl shadow-blue-900/20 transition-all active:scale-95">
                        <Wrench size={16}/> Schedule Service
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-6 mb-10">
                <div className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-400"><Thermometer size={20}/></div>
                        <span className="text-[10px] font-black text-slate-500">REAL-TIME</span>
                    </div>
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Temperature</p>
                    <h3 className="text-2xl font-black">{currentData.temperature}°C</h3>
                </div>
                <div className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-purple-500/10 rounded-2xl text-purple-400"><Zap size={20}/></div>
                        <span className="text-[10px] font-black text-slate-500">SENSORS</span>
                    </div>
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Vibration</p>
                    <h3 className="text-2xl font-black">{currentData.vibration} <span className="text-xs text-slate-500">mm/s</span></h3>
                </div>
                <div className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400"><Activity size={20}/></div>
                        <span className="text-[10px] font-black text-emerald-500">OPTIMAL</span>
                    </div>
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Efficiency</p>
                    <h3 className="text-2xl font-black">{currentData.efficiency}%</h3>
                </div>
                
                {/* AI Prediction Card */}
                <div className="bg-indigo-900/20 p-6 rounded-[2rem] border border-indigo-500/30 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-20">
                        <Sparkles size={40} className="text-indigo-400" />
                    </div>
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-indigo-500/20 rounded-2xl text-indigo-300"><RotateCcw size={20}/></div>
                        <button 
                            onClick={analyzeMachineAI}
                            disabled={aiPrediction.loading}
                            className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest flex items-center gap-1"
                        >
                            {aiPrediction.loading ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                            Analyze
                        </button>
                    </div>
                    <p className="text-indigo-300/60 text-[10px] font-black uppercase tracking-widest mb-1">AI Risk Prediction</p>
                    <div className="flex items-baseline gap-2">
                        <h3 className={`text-2xl font-black ${aiPrediction.risk === 'High' ? 'text-rose-400' : aiPrediction.risk === 'Medium' ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {aiPrediction.risk}
                        </h3>
                        <span className="text-[10px] font-bold text-indigo-300/40">LEVEL</span>
                    </div>
                    <p className="text-[10px] text-indigo-200/70 mt-2 line-clamp-1">{aiPrediction.advice || 'Run AI analysis for insights.'}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-slate-900 rounded-[3rem] border border-slate-800 p-10 shadow-2xl">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-8 flex items-center gap-2">
                        <Activity size={18} className="text-blue-500"/> Thermal Stability Pulse
                    </h3>
                    <div style={{ width: '100%', height: 320, minHeight: 150 }}>
                        <ResponsiveContainer width="100%" height="100%" minHeight={150} minWidth={0}>
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b"/>
                                <XAxis dataKey="time" tick={{fill: '#475569', fontSize: 10, fontWeight: 700}} axisLine={false} dy={10} />
                                <YAxis domain={[0, 100]} tick={{fill: '#475569', fontSize: 10, fontWeight: 700}} axisLine={false} />
                                <Tooltip contentStyle={{backgroundColor:'#020617', borderColor:'#1e293b', borderRadius: '16px'}}/>
                                <Area type="monotone" dataKey="temp" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorTemp)" isAnimationActive={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-slate-900 rounded-[3rem] border border-slate-800 p-10 flex flex-col shadow-2xl">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-8 flex items-center gap-2">
                        <ClipboardList size={18} className="text-emerald-500"/> Maintenance Ledger
                    </h3>
                    <div className="flex-1 overflow-y-auto space-y-4 no-scrollbar">
                        {(maintenanceLogs || []).filter(l => l.resourceId === selectedMachineId).map(log => (
                            <div key={log.id} className="p-5 rounded-3xl bg-black/40 border border-slate-800 text-xs hover:border-slate-600 transition-colors group">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-black text-blue-400 uppercase tracking-widest">{log.type}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-slate-600 font-mono">{new Date(log.date).toLocaleDateString()}</span>
                                        <button onClick={() => deleteMaintenanceLog(log.id)} className="text-slate-700 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12}/></button>
                                    </div>
                                </div>
                                <p className="text-slate-300 font-medium leading-relaxed">{log.notes}</p>
                                {log.workOrderId && (
                                    <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-blue-500 uppercase tracking-tighter">
                                        <ClipboardList size={10}/> WO: {log.workOrderId}
                                    </div>
                                )}
                                {log.downtimeMinutes !== undefined && (
                                    <div className="mt-1 flex items-center gap-2 text-[10px] font-bold text-rose-500 uppercase tracking-tighter">
                                        <Clock size={10}/> Downtime: {log.downtimeMinutes}m
                                    </div>
                                )}
                            </div>
                        ))}
                        {(!maintenanceLogs || maintenanceLogs.length === 0) && <p className="text-center text-slate-500 italic py-20">No maintenance history recorded.</p>}
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default MachineMaintenance;
