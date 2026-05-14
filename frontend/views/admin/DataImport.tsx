import React, { useState, useRef } from 'react';
import { useData } from '../../context/DataContext';
import { useInventory } from '../../context/InventoryContext';
import { 
  Upload, FileText, CheckCircle, AlertTriangle, ArrowLeft, 
  Users, Package, Download, Info, Loader2, Sparkles, 
  FileSpreadsheet, Share
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { parseCSV, exportToCSV } from '../../services/excelService';
import { generateAccountNumber, generateNextId, generateSku } from '../../utils/helpers';
import type { Item } from '../../types';

const DataImport: React.FC = () => {
  const { addCustomer, notify, customers, companyConfig } = useData();
  const { addItem, inventory } = useInventory();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [importingType, setImportingType] = useState<'Products' | 'Customers' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importStats, setImportStats] = useState<{success: number, failed: number} | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [importResults, setImportResults] = useState<{accepted: any[], rejected: any[]} | null>(null);
  const [activeResultsTab, setActiveResultsTab] = useState<'accepted' | 'rejected'>('accepted');

  const handleFileClick = (type: 'Products' | 'Customers') => {
    setImportingType(type);
    setImportStats(null);
    setPreviewData([]);
    setImportResults(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !importingType) return;

    setIsProcessing(true);
    try {
      const data = await parseCSV(file);
      setPreviewData(data);
    } catch (error) {
      notify("Failed to parse CSV file. Please check formatting.", "error");
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  const processImport = async () => {
    if (!importingType || previewData.length === 0) return;

    setIsProcessing(true);
    const accepted: any[] = [];
    const rejected: any[] = [];
    
    // Create local copies to track generated IDs during the loop
    let currentCustomers = [...customers];
    let currentInventory = [...inventory];

    try {
      for (const row of previewData) {
        try {
          if (importingType === 'Customers') {
            const name = row.Name || row.name || row.CustomerName;
            if (name) {
              const customer = {
                id: row.ID || row.id || generateNextId('customer', currentCustomers, companyConfig),
                name,
                accountNumber: row.AccountNumber || row.accountNumber || generateAccountNumber(),
                contact: row.Contact || row.Phone || row.contact || '',
                email: row.Email || row.email || '',
                address: row.Address || row.address || '',
                customerType: (row.Type || row.type || row.CustomerType) === 'Credit' ? 'Credit' : 'Retail',
                walletBalance: Number(row.WalletBalance || row.balance || 0),
                loyaltyPoints: Number(row.LoyaltyPoints || row.points || 0)
              };
              await addCustomer(customer as any);
              currentCustomers.push(customer);
              accepted.push({ ...row, status: 'Accepted', message: 'Successfully imported' });
            } else {
              rejected.push({ ...row, status: 'Rejected', message: 'Missing Name field' });
            }
          } else {
            // Products
            const name = row.Name || row.name || row.ItemName;
            if (name) {
              const category = row.Category || row.category || 'General';
              const item: Item = {
                id: row.ID || row.id || generateNextId('item', currentInventory, companyConfig),
                name,
                sku: row.SKU || row.sku || generateSku(category, currentInventory),
                price: Number(row.Price || row.price || 0),
                cost: Number(row.Cost || row.cost || 0),
                stock: Number(row.Stock || row.stock || 0),
                minStockLevel: Number(row.MinStock || row.minStock || 10),
                category: category,
                type: (row.Type || row.type || 'Product') as Item['type'],
                unit: row.Unit || row.unit || 'pcs'
              };
              await addItem(item);
              currentInventory.push(item);
              accepted.push({ ...row, status: 'Accepted', message: 'Successfully imported' });
            } else {
              rejected.push({ ...row, status: 'Rejected', message: 'Missing Name field' });
            }
          }
        } catch (err: any) {
          rejected.push({ ...row, status: 'Rejected', message: err.message || 'Unknown error' });
        }
      }

      setImportStats({ success: accepted.length, failed: rejected.length });
      setImportResults({ accepted, rejected });
      setPreviewData([]);
      notify(`Import complete: ${accepted.length} successful, ${rejected.length} skipped.`, accepted.length > 0 ? 'success' : 'error');
    } catch (error) {
      notify("Import failed unexpectedly.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportCustomers = () => {
    const data = customers.map(c => ({
      AccountNumber: c.accountNumber,
      Name: c.name,
      Contact: c.contact,
      Email: c.email || '',
      Address: c.address || '',
      CustomerType: c.customerType,
      WalletBalance: c.walletBalance || 0,
      LoyaltyPoints: c.loyaltyPoints || 0
    }));
    exportToCSV(data, `customers_export_${new Date().toISOString().split('T')[0]}`);
    notify("Customer records exported to CSV", "success");
  };

  const handleExportProducts = () => {
    const data = inventory.map(item => ({
      ID: item.id,
      Name: item.name,
      SKU: item.sku,
      Type: item.type,
      Category: item.category,
      Price: item.price,
      Cost: item.cost,
      Stock: item.stock,
      Unit: item.unit
    }));
    exportToCSV(data, `inventory_export_${new Date().toISOString().split('T')[0]}`);
    notify("Inventory records exported to CSV", "success");
  };

  return (
    <div className="p-6 max-w-5xl mx-auto font-sans animate-fadeIn h-[calc(100vh-4rem)] flex flex-col overflow-y-auto custom-scrollbar">
      <div className="flex items-center gap-4 mb-8 shrink-0">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 border border-slate-200 bg-white">
          <ArrowLeft size={20}/>
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Share className="text-blue-600" size={24}/> Data Migration Center
          </h1>
          <p className="text-sm text-slate-500 mt-1">Bulk import and export your records via CSV</p>
        </div>
      </div>

      <div className="space-y-4 pb-10">
        {/* PREVIEW SECTION */}
        {previewData.length > 0 && (
          <section className="animate-in slide-in-from-top-4 duration-500">
            <div className="bg-white rounded-2xl border border-blue-100 p-4 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Import Preview</h3>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Reviewing {previewData.length} {importingType}</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setPreviewData([])}
                    className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg font-bold text-[9px] uppercase tracking-widest hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={processImport}
                    disabled={isProcessing}
                    className="px-3 py-1 bg-blue-600 text-white rounded-lg font-bold text-[9px] uppercase tracking-widest hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-md shadow-blue-200"
                  >
                    {isProcessing ? <Loader2 size={10} className="animate-spin"/> : <CheckCircle size={10}/>}
                    Commit
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-100 bg-slate-50">
                <table className="w-full text-left text-[9px]">
                  <thead className="bg-slate-100 text-slate-500 font-black uppercase tracking-widest">
                    <tr>
                      <th className="px-2 py-1.5">#</th>
                      {Object.keys(previewData[0] || {}).slice(0, 5).map(key => (
                        <th key={key} className="px-2 py-1.5">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {previewData.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                        <td className="px-2 py-1.5 font-mono text-slate-400">{idx + 1}</td>
                        {Object.values(row).slice(0, 5).map((val: any, i) => (
                          <td key={i} className="px-2 py-1.5 font-medium text-slate-700 truncate max-w-[100px]">{val}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* IMPORT SECTION */}
        <section>
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <Upload size={14}/> Bulk Data Import
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm hover:shadow-xl transition-all group flex flex-col min-h-[220px]">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-sm">
                <Users size={28}/>
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-2">Import Customers</h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-6">
                Upload your client database via CSV. Automatically maps names, contacts, and balances.
              </p>
              <button 
                disabled={isProcessing}
                onClick={() => handleFileClick('Customers')}
                className="mt-auto w-full px-6 py-3 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-blue-600 transition-all shadow-lg disabled:opacity-50"
              >
                {isProcessing && importingType === 'Customers' ? <Loader2 size={16} className="animate-spin"/> : <Upload size={16}/>}
                Select CSV File
              </button>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm hover:shadow-xl transition-all group flex flex-col min-h-[220px]">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-sm">
                <Package size={28}/>
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-2">Import Inventory</h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-6">
                Sync your product catalog via CSV. Handles SKUs, pricing, and initial stock levels.
              </p>
              <button 
                disabled={isProcessing}
                onClick={() => handleFileClick('Products')}
                className="mt-auto w-full px-6 py-3 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-blue-600 transition-all shadow-lg disabled:opacity-50"
              >
                {isProcessing && importingType === 'Products' ? <Loader2 size={16} className="animate-spin"/> : <Upload size={16}/>}
                Select CSV File
              </button>
            </div>

            <div className="bg-slate-50 rounded-3xl border border-slate-200 p-8 shadow-inner group flex flex-col min-h-[220px]">
              <div className="w-14 h-14 rounded-2xl bg-white text-blue-600 flex items-center justify-center mb-6 group-hover:rotate-6 transition-transform shadow-md border border-slate-100">
                <FileSpreadsheet size={28}/>
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-2">Export Customers</h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-6">
                Download your complete client list as a formatted CSV file for backup or external use.
              </p>
              <button 
                onClick={handleExportCustomers}
                className="mt-auto w-full px-6 py-3 bg-white text-slate-900 border border-slate-200 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-slate-900 hover:text-white transition-all shadow-md"
              >
                <Download size={16}/>
                Export CSV Records
              </button>
            </div>

            <div className="bg-slate-50 rounded-3xl border border-slate-200 p-8 shadow-inner group flex flex-col min-h-[220px]">
              <div className="w-14 h-14 rounded-2xl bg-white text-emerald-600 flex items-center justify-center mb-6 group-hover:rotate-6 transition-transform shadow-md border border-slate-100">
                <FileSpreadsheet size={28}/>
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-2">Export Inventory</h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-6">
                Extract your entire product list with current stock levels and pricing data to CSV.
              </p>
              <button 
                onClick={handleExportProducts}
                className="mt-auto w-full px-6 py-3 bg-white text-slate-900 border border-slate-200 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-slate-900 hover:text-white transition-all shadow-md"
              >
                <Download size={16}/>
                Export CSV Records
              </button>
            </div>
          </div>
        </section>

        {/* STATUS & RULES */}
        <div className="space-y-6">
          {importStats && importResults && (
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xl animate-in zoom-in-95 duration-500">
              <div className="bg-slate-900 p-6 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><Sparkles size={80}/></div>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2 text-blue-400">
                  <CheckCircle size={16}/> Migration Summary
                </h3>
                <div className="grid grid-cols-2 gap-6 relative z-10">
                  <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Successful</p>
                      <p className="text-3xl font-black text-emerald-400">{importStats.success}</p>
                  </div>
                  <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Skipped/Failed</p>
                      <p className="text-3xl font-black text-rose-400">{importStats.failed}</p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <button 
                    onClick={() => setActiveResultsTab('accepted')}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeResultsTab === 'accepted' ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-200' : 'bg-slate-50 text-slate-400 border border-slate-100 hover:bg-slate-100'}`}
                  >
                    Accepted ({importResults.accepted.length})
                  </button>
                  <button 
                    onClick={() => setActiveResultsTab('rejected')}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeResultsTab === 'rejected' ? 'bg-rose-100 text-rose-700 border-2 border-rose-200' : 'bg-slate-50 text-slate-400 border border-slate-100 hover:bg-slate-100'}`}
                  >
                    Rejected ({importResults.rejected.length})
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50 max-h-64 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-[10px]">
                    <thead className="bg-slate-100 text-slate-500 font-black uppercase tracking-widest sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Details</th>
                        <th className="px-3 py-2">Status Message</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {(activeResultsTab === 'accepted' ? importResults.accepted : importResults.rejected).map((row, idx) => (
                        <tr key={idx} className="hover:bg-white transition-colors">
                          <td className="px-3 py-2 font-mono text-slate-400">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <div className="font-bold text-slate-800">{row.Name || row.name || 'Unknown Item'}</div>
                            <div className="text-[9px] text-slate-400 mt-0.5 font-mono">{row.SKU || row.AccountNumber || 'No Reference'}</div>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[9px] ${activeResultsTab === 'accepted' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                              {activeResultsTab === 'accepted' ? <CheckCircle size={8}/> : <AlertTriangle size={8}/>}
                              {row.message}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {(activeResultsTab === 'accepted' ? importResults.accepted : importResults.rejected).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-8 text-center text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                            No {activeResultsTab} records to display
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3">
            <Info className="text-blue-500 shrink-0" size={20}/>
            <div className="space-y-1">
              <h4 className="font-black text-blue-900 text-[10px] uppercase tracking-widest">Data Integrity Rules</h4>
              <ul className="text-xs text-blue-800 space-y-0.5 opacity-80 font-medium">
                <li>• Ensure the first row contains exact column headers.</li>
                <li>• Do not include currency symbols ($) in numeric columns.</li>
                <li>• Existing records with matching IDs will be updated.</li>
                <li>• Missing ID fields will trigger automatic system ID generation.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept=".csv" 
        onChange={handleFileChange} 
      />
    </div>
  );
};

export default DataImport;
