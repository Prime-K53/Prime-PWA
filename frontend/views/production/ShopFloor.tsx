
import React, { useState } from 'react';
import { 
  Play, CheckCircle, AlertTriangle, Activity, Clock, 
  Package, ShieldAlert, Trash2, History, ShieldCheck,
  ChevronRight, ArrowLeft, MoreVertical, Search, Filter,
  Settings, User, Terminal, Cpu, Info
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { WorkOrder } from '../../types';
import { OfflineImage } from '../../components/OfflineImage';
import { format } from 'date-fns';

const ShopFloor: React.FC = () => {
  const { workOrders, updateWorkOrderStatus, logProductionStep, completeWorkOrder, user, inventory, boms, notify } = useData();
  const [selectedWo, setSelectedWo] = useState<WorkOrder | null>(null);
  const [qtyInput, setQtyInput] = useState(0);
  const [noteInput, setNoteInput] = useState('');
  const [wasteReason, setWasteReason] = useState('Material Defect');
  const [selectedWasteMaterial, setSelectedWasteMaterial] = useState('');
  const [wasteDestroyed, setWasteDestroyed] = useState(false);
  const [destructionCert, setDestructionCert] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Auto-select Paper/Toner for Examinations
  React.useEffect(() => {
    if (selectedWo?.id.startsWith('WO-EXAM-')) {
        const paper = inventory.find(i => i.name.toLowerCase().includes('paper'));
        if (paper) setSelectedWasteMaterial(paper.id);
    }
  }, [selectedWo, inventory]);

  const activeJobs = workOrders.filter(wo => wo.status === 'In Progress' && (wo.productName.toLowerCase().includes(searchQuery.toLowerCase()) || wo.id.toLowerCase().includes(searchQuery.toLowerCase())));
  const queueJobs = workOrders.filter(wo => wo.status === 'Scheduled' && (wo.productName.toLowerCase().includes(searchQuery.toLowerCase()) || wo.id.toLowerCase().includes(searchQuery.toLowerCase())));

  const handleStartJob = (wo: WorkOrder) => {
      updateWorkOrderStatus(wo.id, 'In Progress');
      logProductionStep({
          id: '', workOrderId: wo.id, operationName: 'Production', timestamp: new Date().toISOString(),
          action: 'Start', operatorId: user?.username || 'Operator'
      });
      setSelectedWo({...wo, status: 'In Progress'});
  };

  const handleFinishJob = (wo: WorkOrder) => {
      if(window.confirm("Are you sure you want to finish this job? This will complete the production process.")) {
          updateWorkOrderStatus(wo.id, 'Completed');
          logProductionStep({
              id: '', workOrderId: wo.id, operationName: 'Production', timestamp: new Date().toISOString(),
              action: 'Complete', operatorId: user?.username || 'Operator'
          });
          completeWorkOrder(wo.id);
          notify("Job completed successfully!", "success");
      }
  };

  const handleLog = (type: 'Complete' | 'Log Waste') => {
      if (!selectedWo || qtyInput <= 0) return;
      
      if (type === 'Log Waste') {
          if (!selectedWasteMaterial) {
              notify("Please select the material wasted.", "error");
              return;
          }
          
          if (selectedWo.isConfidential && (!wasteDestroyed || !destructionCert)) {
              notify("Confidentiality Protocol: Verification of destruction and Certificate ID required.", "error");
              return;
          }

          const mat = inventory.find(i => i.id === selectedWasteMaterial);
          const notes = `${wasteReason}: ${qtyInput} ${mat?.unit || 'Units'} of ${mat?.name}. ${noteInput} ${destructionCert ? `[CERT: ${destructionCert}]` : ''}`;
          
          logProductionStep({
            id: '', workOrderId: selectedWo.id, operationName: 'Production', timestamp: new Date().toISOString(),
            action: 'Log Waste', qtyProcessed: qtyInput, notes, operatorId: user?.username || 'Operator',
            materialId: selectedWasteMaterial, wasteDestroyed: true
          });
          
          notify("Scrap Logged & Security Chain Verified.", "success");
      } else {
          logProductionStep({
            id: '', workOrderId: selectedWo.id, operationName: 'Production', timestamp: new Date().toISOString(),
            action: 'Complete', qtyProcessed: qtyInput, notes: noteInput, operatorId: user?.username || 'Operator'
          });

          if (selectedWo.quantityCompleted + qtyInput >= selectedWo.quantityPlanned) {
              if(window.confirm("Order Target Reached. Finalize Job?")) {
                  completeWorkOrder(selectedWo.id);
                  setSelectedWo(null);
              }
          }
      }

      setQtyInput(0);
      setNoteInput('');
      setSelectedWasteMaterial('');
      setWasteDestroyed(false);
      setDestructionCert('');
  };

  const selectedProduct = selectedWo ? inventory.find(i => i.id === selectedWo.productId) : null;
  const selectedBom = selectedWo ? boms.find(b => b.id === selectedWo.bomId) : null;

  return (
    <div className="h-[calc(100vh-4rem)] bg-white flex flex-col overflow-hidden font-sans">
      {/* Top Header */}
      <div className="h-14 border-b border-slate-100 px-6 flex items-center justify-between shrink-0 bg-white">
        <div className="flex items-center gap-3">
          {selectedWo && (
            <button 
              onClick={() => setSelectedWo(null)}
              className="p-1.5 hover:bg-slate-50 rounded-md text-slate-400 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-blue-600" />
            <h2 className="text-[13px] font-bold text-slate-900 uppercase tracking-wider">
              {selectedWo ? `Job / ${selectedWo.id}` : 'Production Hub'}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by ID or product..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-100 rounded-md text-[12px] w-64 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all"
            />
          </div>
          <div className="h-4 w-px bg-slate-100" />
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-[11px] font-bold text-slate-900 leading-none">{user?.username || 'Operator'}</p>
              <div className="flex items-center gap-1 mt-0.5 justify-end">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <p className="text-[9px] font-medium text-slate-400 uppercase tracking-tight">Terminal Active</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {!selectedWo ? (
          <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto custom-scrollbar">
            {/* Simple Stats Bar */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Active', value: activeJobs.length, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Queue', value: queueJobs.length, color: 'text-slate-600', bg: 'bg-slate-50' },
                { label: 'Confidential', value: workOrders.filter(w => w.isConfidential).length, color: 'text-rose-600', bg: 'bg-rose-50' },
                { label: 'OEE', value: '94.2%', color: 'text-emerald-600', bg: 'bg-emerald-50' }
              ].map((stat, i) => (
                <div key={i} className={`${stat.bg} p-4 rounded-lg border border-slate-100`}>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{stat.label}</p>
                  <p className={`text-xl font-black ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
              {/* Active Jobs List */}
              <div className="flex flex-col min-h-0">
                <div className="flex items-center gap-2 mb-3">
                  <Activity size={14} className="text-blue-500" />
                  <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">Active Production</h3>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {activeJobs.map(wo => (
                    <button 
                      key={wo.id}
                      onClick={() => setSelectedWo(wo)}
                      className="w-full flex items-center gap-4 bg-white p-3 border border-slate-100 rounded-lg hover:border-blue-200 hover:shadow-sm transition-all text-left group"
                    >
                      <div className="w-12 h-12 bg-slate-50 rounded border border-slate-100 overflow-hidden shrink-0">
                        <OfflineImage src={inventory.find(i => i.id === wo.productId)?.image} alt={wo.productName} className="w-full h-full object-cover"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-tight">#{wo.id}</span>
                          {wo.isConfidential && <ShieldAlert size={12} className="text-rose-500" />}
                        </div>
                        <h4 className="text-[13px] font-bold text-slate-900 truncate">{wo.productName}</h4>
                        <div className="flex items-center gap-3 mt-1.5">
                          <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500" style={{width: `${Math.min(100, (wo.quantityCompleted/wo.quantityPlanned)*100)}%`}} />
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 finance-nums">{wo.quantityCompleted}/{wo.quantityPlanned}</span>
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                    </button>
                  ))}
                  {activeJobs.length === 0 && (
                    <div className="py-12 border border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center text-slate-400">
                      <Cpu size={24} className="opacity-20 mb-2" />
                      <p className="text-[12px] italic">No active jobs</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Queue List */}
              <div className="flex flex-col min-h-0">
                <div className="flex items-center gap-2 mb-3">
                  <History size={14} className="text-slate-400" />
                  <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-widest">Manufacturing Queue</h3>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {queueJobs.map(wo => (
                    <div key={wo.id} className="flex items-center justify-between bg-white p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 bg-slate-50 rounded border border-slate-100 overflow-hidden shrink-0">
                          <OfflineImage src={inventory.find(i => i.id === wo.productId)?.image} alt={wo.productName} className="w-full h-full object-cover"/>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-bold text-slate-900 truncate">{wo.productName}</p>
                          <p className="text-[10px] font-medium text-slate-400 uppercase">Qty: {wo.quantityPlanned} • {wo.id}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleStartJob(wo)}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <Play size={10} fill="currentColor" /> Start
                      </button>
                    </div>
                  ))}
                  {queueJobs.length === 0 && (
                    <div className="py-12 border border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center text-slate-400">
                      <Clock size={24} className="opacity-20 mb-2" />
                      <p className="text-[12px] italic">Queue is clear</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* SELECTED JOB VIEW - Minimalist Focus */
          <div className="h-full flex overflow-hidden animate-in fade-in duration-300">
            {/* Left Info Panel */}
            <div className="w-80 border-r border-slate-100 bg-slate-50/30 p-6 flex flex-col overflow-y-auto custom-scrollbar">
              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-24 h-24 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden mb-4">
                  <OfflineImage src={selectedProduct?.image} alt={selectedWo.productName} className="w-full h-full object-cover" />
                </div>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded uppercase mb-2 border border-blue-100">
                  {selectedWo.id}
                </span>
                <h2 className="text-[16px] font-bold text-slate-900 leading-tight mb-2">{selectedWo.productName}</h2>
                {selectedWo.isConfidential && (
                  <div className="flex items-center gap-1.5 text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100">
                    <ShieldAlert size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-tight">Confidential</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-8">
                <div className="bg-white p-3 rounded-lg border border-slate-100 text-center">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Planned</p>
                  <p className="text-lg font-black text-slate-900 finance-nums">{selectedWo.quantityPlanned}</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-100 text-center">
                  <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mb-0.5">Done</p>
                  <p className="text-lg font-black text-blue-600 finance-nums">{selectedWo.quantityCompleted}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center text-[11px] font-bold text-slate-400 border-b border-slate-100 pb-2">
                  <span className="uppercase tracking-tight">Machine Status</span>
                  <span className="text-emerald-600">OPTIMAL</span>
                </div>
                <div className="flex justify-between items-center text-[11px] font-bold text-slate-400 border-b border-slate-100 pb-2">
                  <span className="uppercase tracking-tight">Workstation Temp</span>
                  <span className="text-slate-900">42°C</span>
                </div>
                <div className="flex justify-between items-center text-[11px] font-bold text-slate-400 border-b border-slate-100 pb-2">
                  <span className="uppercase tracking-tight">OEE Efficiency</span>
                  <span className="text-slate-900">94.2%</span>
                </div>
              </div>
            </div>

            {/* Main Action Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-white">
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div className="max-w-4xl mx-auto space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Good Units Panel */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <h3 className="text-[12px] font-bold text-emerald-600 mb-6 flex items-center gap-2 uppercase tracking-wider">
                        <CheckCircle size={16}/> Log Good Output
                      </h3>
                      <div className="flex items-center gap-4 mb-6">
                        <button onClick={() => setQtyInput(Math.max(0, qtyInput-1))} className="w-10 h-10 rounded bg-slate-100 hover:bg-slate-200 transition-colors text-slate-600 font-bold">-</button>
                        <input 
                          type="number" 
                          className="flex-1 text-center bg-transparent text-[32px] font-black border-b border-slate-100 focus:border-emerald-500 outline-none py-2 text-slate-900 finance-nums" 
                          value={qtyInput} 
                          onChange={e => setQtyInput(parseInt(e.target.value) || 0)} 
                        />
                        <button onClick={() => setQtyInput(qtyInput+1)} className="w-10 h-10 rounded bg-slate-100 hover:bg-slate-200 transition-colors text-slate-600 font-bold">+</button>
                      </div>
                      <button 
                        onClick={() => handleLog('Complete')} 
                        className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[13px] font-bold uppercase tracking-[0.15em] transition-all active:scale-[0.98] shadow-md shadow-emerald-50"
                      >
                        Log Batch
                      </button>
                    </div>

                    {/* Waste Panel */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <h3 className="text-[12px] font-bold text-rose-600 mb-6 flex items-center gap-2 uppercase tracking-wider">
                        <AlertTriangle size={16}/> Log Quality Loss
                      </h3>
                      <div className="space-y-4 mb-6">
                        <select 
                          className="w-full bg-slate-50 border border-slate-100 rounded p-2.5 text-[12px] font-bold text-slate-700 outline-none focus:border-rose-300" 
                          value={selectedWasteMaterial} 
                          onChange={e => setSelectedWasteMaterial(e.target.value)}
                        >
                          <option value="">Select Material</option>
                          {selectedWo.id.startsWith('WO-EXAM-') ? (
                            inventory.filter(i => i.name.toLowerCase().includes('paper') || i.name.toLowerCase().includes('toner')).map(i => (
                              <option key={i.id} value={i.id}>{i.name}</option>
                            ))
                          ) : (
                            selectedBom?.components.map(c => {
                              const mat = inventory.find(i => i.id === c.materialId);
                              return <option key={c.materialId} value={c.materialId}>{mat?.name}</option>
                            })
                          )}
                        </select>

                        {selectedWo.isConfidential ? (
                          <div className="space-y-3 p-3 bg-rose-50/50 rounded border border-rose-100">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" className="w-3.5 h-3.5 text-rose-600 rounded" checked={wasteDestroyed} onChange={e => setWasteDestroyed(e.target.checked)}/>
                              <span className="text-[10px] font-bold text-rose-700 uppercase">Confirmed Destruction</span>
                            </label>
                            <input 
                              type="text" 
                              placeholder="Cert ID" 
                              className="w-full bg-white border border-rose-100 rounded px-2 py-1.5 text-[11px] font-bold text-rose-900 placeholder-rose-300 finance-nums"
                              value={destructionCert}
                              onChange={e => setDestructionCert(e.target.value)}
                            />
                          </div>
                        ) : (
                          <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-100 rounded p-2.5 text-[12px] font-bold outline-none" 
                            placeholder="Reason..." 
                            value={noteInput} 
                            onChange={e => setNoteInput(e.target.value)} 
                          />
                        )}
                      </div>
                      <button 
                        onClick={() => handleLog('Log Waste')} 
                        className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[13px] font-bold uppercase tracking-[0.15em] transition-all active:scale-[0.98] shadow-md shadow-rose-50"
                      >
                        Log Loss
                      </button>
                    </div>
                  </div>

                  {/* Activity Log */}
                  <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
                      <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                        <History size={14} className="text-slate-400" /> Session Activity
                      </h3>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                      {selectedWo.logs.slice().reverse().map((log, i) => (
                        <div key={i} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded transition-colors group">
                          <div className="flex items-center gap-3">
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              log.action === 'Complete' ? 'bg-emerald-500' : 
                              log.action === 'Start' ? 'bg-blue-500' : 'bg-rose-500'
                            }`} />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-slate-900 uppercase">{log.action}</span>
                                {log.qtyProcessed && (
                                  <span className="text-[10px] font-bold text-slate-400 finance-nums">
                                    {log.qtyProcessed} units
                                  </span>
                                )}
                              </div>
                              {log.notes && <p className="text-[10px] text-slate-400 mt-0.5">{log.notes}</p>}
                            </div>
                          </div>
                          <span className="text-[10px] font-medium text-slate-300 finance-nums">{format(new Date(log.timestamp), 'HH:mm')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShopFloor;
