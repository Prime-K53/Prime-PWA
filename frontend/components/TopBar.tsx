import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, Bell, AlertTriangle, WifiOff, 
  Menu, LayoutGrid, CheckSquare, Wrench, Download, Package,
  RefreshCw, Database, CreditCard, Barcode, ChevronRight, User, Upload,
  X, CheckCircle, Trash2, Clock, Plus, Zap, Filter, MessageSquare
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useInventory } from '../context/InventoryContext';
import { useNavigate, Link } from 'react-router-dom';
import { OfflineImage } from './OfflineImage';
import { exportToCSV, parseCSV } from '../services/excelService';
import { generateAccountNumber } from '../utils/helpers';

interface TopBarProps {
    toggleSidebar: () => void;
    toggleCollapse: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ toggleSidebar, toggleCollapse }) => {
  const {
    alerts, reminders, isOnline, user, notify, dbSyncStatus, connectDbSync,
    toggleReminder, addReminder, deleteReminder, clearAlerts, dismissAlert, tasks, updateTask
  } = useData();
  const { inventory, addItem } = useInventory();
  const navigate = useNavigate();
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [quickReminder, setQuickReminder] = useState('');
  const [notificationTab, setNotificationTab] = useState<'All' | 'Alerts' | 'Reminders' | 'Tasks'>('All');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importType, setImportType] = useState<'Products' | 'Customers' | 'Items' | 'Accounts' | null>(null);
  const [showApps, setShowApps] = useState(false);
  
  const notificationRef = useRef<HTMLDivElement>(null);
  const appsMenuRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  const combinedNotifications = useMemo(() => {
    const formattedAlerts = (alerts || []).map(a => ({ ...a, type: 'Alert' as const }));
    const formattedReminders = (reminders || []).map(r => ({ ...r, type: 'Reminder' as const, message: r.text, severity: 'Low' as const }));
    
    // Add Tasks with dueDate = today
    const today = new Date().toISOString().split('T')[0];
    const formattedTasks = (tasks || []).filter(t =>
      t.dueDate === today &&
      t.status !== 'Completed'
    ).map(t => ({
      ...t,
      type: 'Task' as const,
      message: t.title,
      severity: t.priority === 'High' ? 'High' : 'Medium' as const
    }));
  
    let combined = [...formattedAlerts, ...formattedReminders, ...formattedTasks];
    
    if (notificationTab === 'Alerts') combined = combined.filter(n => n.type === 'Alert');
    if (notificationTab === 'Reminders') combined = combined.filter(n => n.type === 'Reminder');
    if (notificationTab === 'Tasks') combined = combined.filter(n => n.type === 'Task');
  
    return combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [alerts, reminders, tasks, notificationTab]);

  const unreadCount = useMemo(() => {
    const alertCount = (alerts || []).length;
    const reminderCount = (reminders || []).filter(r => !r.completed).length;
    return alertCount + reminderCount;
  }, [alerts, reminders]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) setShowNotifications(false);
      if (appsMenuRef.current && !appsMenuRef.current.contains(event.target as Node)) setShowApps(false);
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target as Node)) setShowTools(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && globalSearch.trim()) navigate(`/search?q=${encodeURIComponent(globalSearch)}`);
  };

  const handleAddQuickReminder = (e: React.FormEvent) => {
      e.preventDefault();
      if (!quickReminder.trim()) return;
      addReminder(quickReminder.trim(), new Date().toISOString());
      setQuickReminder('');
      notify("Reminder added to personal queue.", "success");
  };

  const handleExportProducts = () => {
      const data = inventory.map(item => ({ ID: item.id, Name: item.name, SKU: item.sku, Type: item.type, Category: item.category, Price: item.price, Cost: item.cost, Stock: item.stock, Unit: item.unit }));
      exportToCSV(data, 'products_export');
      setShowTools(false);
      notify("Product list exported successfully", "success");
  };

  const handleExportCustomers = () => {
      // Note: customers is usually available via context
      // This is a simplified call
      notify("Exporting customers...", "info");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !importType) return;
      try {
          const importedData = await parseCSV(file);
          if (importedData.length > 0) {
              if (importType === 'Items') {
                  importedData.forEach(item => {
                      const name = item.Name || item.name || item.ItemName;
                      if (name) {
                          addItem({
                              id: item.ID || item.id || '',
                              name: name,
                              sku: item.SKU || item.sku || '',
                              price: Number(item.Price || item.price || 0),
                              cost: Number(item.Cost || item.cost || 0),
                              stock: Number(item.Stock || item.stock || 0),
                              minStockLevel: Number(item.MinStock || item.minStock || 10),
                              category: item.Category || item.category || 'General',
                              type: (item.Type || item.type || 'Product') as any,
                              unit: item.Unit || item.unit || 'pcs'
                          });
                      }
                  });
                  notify(`Imported ${importedData.length} inventory items`, "success");
              }
          }
      } catch (error) { 
          console.error(error);
          notify("Import failed: check CSV format", "error"); 
      }
      setImportType(null);
      e.target.value = '';
  };

  return (
    <header className="h-14 px-6 flex items-center justify-between sticky top-0 z-30 border-b border-slate-200 print:hidden transition-all duration-300">
      <div className="flex items-center gap-4">
        <button 
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-50 transition-all" 
            onClick={() => {
                if (window.innerWidth < 768) {
                    toggleSidebar();
                } else {
                    toggleCollapse();
                }
            }}
            aria-label="Toggle Sidebar"
        >
            <Menu size={20}/>
        </button>

        <div className="relative hidden sm:block group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600" size={14}/>
            <input 
              type="text" 
              placeholder="e.g. INV-1001" 
              className="pl-9 pr-4 py-1.5 rounded-lg bg-slate-50 border border-slate-100 focus:bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-100 text-xs outline-none w-40 transition-all focus:w-64 font-medium h-9" 
              value={globalSearch} 
              onChange={e => setGlobalSearch(e.target.value)} 
              onKeyDown={handleSearchSubmit}
            />
        </div>
      </div>

      <div className="flex items-center gap-3 md:gap-5">
        <div className={`flex items-center justify-center w-9 h-9 rounded-lg transition-all cursor-pointer hover:bg-slate-50
            ${dbSyncStatus === 'connected' ? 'text-emerald-500' : 
              dbSyncStatus === 'syncing' ? 'text-blue-500' :
              'text-slate-300'}`}
             title={`Database Bridge: ${dbSyncStatus}`}
             onClick={connectDbSync}
        >
            {dbSyncStatus === 'syncing' ? <RefreshCw size={18} className="animate-spin"/> : <Database size={18}/>}
        </div>

        {!isOnline && (
            <div className="p-2 text-rose-500 animate-pulse" title="Offline">
                <WifiOff size={20}/>
            </div>
        )}
        
        <div className="relative" ref={toolsMenuRef}>
            <button 
                onClick={() => setShowTools(!showTools)} 
                className={`p-2 rounded-lg transition-colors ${showTools ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'hover:bg-slate-50 text-slate-500'}`}
                title="Tools"
            >
                <Wrench size={18}/>
            </button>
            {showTools && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50 animate-in fade-in zoom-in-95 origin-top-right">
                    <div className="px-4 py-2 border-b border-slate-50 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">System Tools</div>
                    <Link to="/tools/cheques" className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-xs font-medium text-slate-600 transition-colors" onClick={() => setShowTools(false)}>
                        <CreditCard size={14} className="text-blue-500"/> Cheque Manager
                    </Link>
                    <Link to="/tools/barcodes" className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-xs font-medium text-slate-600 transition-colors" onClick={() => setShowTools(false)}>
                        <Barcode size={14} className="text-indigo-500"/> Barcode Printer
                    </Link>
                    <Link to="/admin/import" className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-xs font-medium text-slate-600 transition-colors" onClick={() => setShowTools(false)}>
                        <Upload size={14} className="text-amber-500"/> Data Migration
                    </Link>
                    <div className="my-1 border-t border-slate-50"></div>
                    <button onClick={() => { setImportType('Items'); fileInputRef.current?.click(); setShowTools(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-xs font-medium text-slate-600 transition-colors">
                        <Package size={14} className="text-indigo-500"/> Import Items
                    </button>
                    <button onClick={handleExportProducts} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-xs font-medium text-slate-600 transition-colors">
                        <Download size={14} className="text-emerald-500"/> Export Items
                    </button>
                </div>
            )}
        </div>

        {/* Dedicated Notifications Panel */}
        <div className="relative" ref={notificationRef}>
            <button 
                className={`relative p-2 rounded-lg transition-all duration-300 ${showNotifications ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-slate-50 text-slate-500'}`} 
                onClick={() => setShowNotifications(!showNotifications)}
            >
                <Bell size={18}/>
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full border-2 border-white text-[9px] font-bold text-white flex items-center justify-center animate-in zoom-in">
                        {unreadCount}
                    </span>
                )}
            </button>

            {showNotifications && (
                <div className="absolute right-0 top-full mt-3 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in zoom-in-95 origin-top-right flex flex-col max-h-[500px]">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
                                <p className="text-[10px] text-slate-400 font-medium">Updates from your workspace</p>
                            </div>
                            <button onClick={() => setShowNotifications(false)} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                                <X size={16}/>
                            </button>
                        </div>
                        
                        <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                            {(['All', 'Alerts', 'Reminders', 'Tasks'] as const).map(tab => (
                                <button 
                                    key={tab}
                                    onClick={() => setNotificationTab(tab)}
                                    className={`flex-1 py-1.5 rounded-md text-[10px] font-semibold transition-all ${notificationTab === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {combinedNotifications.length === 0 ? (
                            <div className="py-12 flex flex-col items-center justify-center text-slate-300">
                                <CheckCircle size={40} className="mb-3 opacity-20"/>
                                <p className="text-xs font-medium">All caught up!</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {combinedNotifications.map((notif: any) => (
                                    <div 
                                        key={notif.id} 
                                        className={`p-4 hover:bg-slate-50 transition-colors flex gap-3 group relative
                                            ${notif.type === 'Reminder' && notif.completed ? 'opacity-50 grayscale' : ''}`}
                                    >
                                        <div className={`mt-0.5 p-2 rounded-lg h-fit shrink-0 border ${
                                            notif.type === 'Alert' 
                                                ? (notif.severity === 'High' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-blue-50 text-blue-600 border-blue-100')
                                                : (notif.completed ? 'bg-slate-50 text-slate-400 border-slate-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100')
                                        }`}>
                                            {notif.type === 'Alert' ? <AlertTriangle size={14}/> : <CheckCircle size={14}/>}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start mb-0.5">
                                                <span className={`text-[9px] font-bold uppercase tracking-wider ${
                                                    notif.type === 'Alert' ? 'text-blue-500' : 'text-emerald-600'
                                                }`}>
                                                    {notif.type}
                                                </span>
                                                <span className="text-[9px] font-medium text-slate-400">
                                                    {new Date(notif.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <p className={`text-xs font-medium text-slate-700 leading-normal ${notif.type === 'Reminder' && notif.completed ? 'line-through' : ''}`}>
                                                {notif.message || notif.text}
                                            </p>
                                            
                                           <div className="mt-2 flex gap-2">
                                               {notif.type === 'Reminder' && (
                                                   <button
                                                       onClick={() => toggleReminder(notif.id)}
                                                       className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                                                           notif.completed ? 'text-slate-500 bg-slate-100' : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                                                       }`}
                                                   >
                                                       {notif.completed ? 'Re-open' : 'Done'}
                                                   </button>
                                               )}
                                               {notif.type === 'Task' && (
                                                   <button
                                                       onClick={() => updateTask({ id: notif.id, status: notif.completed ? 'Pending' : 'Completed' })}
                                                       className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                                                           notif.completed ? 'text-slate-500 bg-slate-100' : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                                                       }`}
                                                   >
                                                       {notif.completed ? 'Re-open' : 'Done'}
                                                   </button>
                                               )}
                                               {notif.type === 'Alert' && (
                                                   <button
                                                       onClick={() => dismissAlert(notif.id)}
                                                       className="px-2 py-0.5 rounded text-[10px] font-semibold text-slate-500 bg-slate-50 hover:bg-slate-100"
                                                   >
                                                       Dismiss
                                                   </button>
                                               )}
                                               {notif.type === 'Reminder' && (
                                                   <button
                                                       onClick={() => deleteReminder(notif.id)}
                                                       className="p-1 text-slate-300 hover:text-rose-500 transition-colors ml-auto opacity-0 group-hover:opacity-100"
                                                   >
                                                       <Trash2 size={12}/>
                                                   </button>
                                               )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p-3 bg-slate-50 border-t border-slate-100 shrink-0">
                        <form onSubmit={handleAddQuickReminder} className="flex gap-2">
                            <div className="relative flex-1">
                                <Plus className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
                                <input 
                                    type="text"
                                    placeholder="e.g. Call client at 2pm"
                                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium outline-none focus:border-blue-400"
                                    value={quickReminder}
                                    onChange={e => setQuickReminder(e.target.value)}
                                />
                            </div>
                            <button 
                                type="submit"
                                disabled={!quickReminder.trim()}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:bg-slate-200"
                            >
                                Add
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>

        <div className="flex items-center gap-2 pl-2 border-l border-slate-100">
            <div className="text-right hidden sm:block">
                <p className="text-xs font-semibold text-slate-800">{user?.name || 'Admin User'}</p>
                <p className="text-[10px] text-slate-400 font-medium">{user?.role || 'Administrator'}</p>
            </div>
            <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 border border-slate-200">
                <User size={18}/>
            </div>
        </div>

        <div className="relative" ref={appsMenuRef}>
            <button className={`p-1.5 rounded-full transition-colors ${showApps ? 'bg-blue-50 text-blue-600' : 'hover:bg-slate-100 text-slate-500'}`} onClick={() => setShowApps(!showApps)}><LayoutGrid size={18}/></button>
            {showApps && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-100 p-3 z-50 animate-in fade-in zoom-in-95 origin-top-right">
                    <div className="grid grid-cols-2 gap-2">
                        <Link to="/internal-tools/chat" className="flex flex-col items-center gap-2 p-2 rounded-xl hover:bg-slate-50 transition-colors group" onClick={() => setShowApps(false)}>
                            <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                                <MessageSquare size={18}/>
                            </div>
                            <span className="text-[9px] font-black uppercase">Chat</span>
                        </Link>
                        <Link to="/sales/tasks" className="flex flex-col items-center gap-2 p-2 rounded-xl hover:bg-slate-50 transition-colors group" onClick={() => setShowApps(false)}>
                            <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                                <CheckSquare size={18}/>
                            </div>
                            <span className="text-[9px] font-black uppercase">Tasks</span>
                        </Link>
                    </div>
                </div>
            )}
        </div>
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept=".csv"
      />
    </header>
  );
};

export default TopBar;
