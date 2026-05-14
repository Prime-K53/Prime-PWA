import React, { useState, useMemo, useEffect } from 'react';
import { TrendingUp, AlertTriangle, Package, Calendar, ArrowRight, BarChart3, Wallet, ArrowUpCircle, ArrowDownCircle, Coins, Calculator } from 'lucide-react';
import { useData, REFRESH_INTERVAL } from '../context/DataContext';
import { useModuleRefresh } from '../hooks/useModuleRefresh';
import { Item, Invoice, Purchase } from '../types';
import ProductForecastDetail from './inventory/components/ProductForecastDetail';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, addDays, startOfDay, isBefore, isAfter, subDays } from 'date-fns';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, ComposedChart
} from 'recharts';
import { analyzeForecastingData } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';
import { generateNextId } from '../utils/helpers';

const Forecasting: React.FC = () => {
  const { inventory, sales, batches, boms, companyConfig, purchases, addPurchase, invoices, expenses, ledger, accounts, notify, refreshAllData } = useData();
  
  // 5-minute poll + focus refresh
  useModuleRefresh(refreshAllData, { interval: REFRESH_INTERVAL });
  const currency = companyConfig.currencySymbol;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // View State
  const [activeTab, setActiveTab] = useState<'Inventory' | 'CashFlow'>('Inventory');
  const [selectedForecastItem, setSelectedForecastItem] = useState<Item | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const handleAiAnalysis = async () => {
    setIsAiLoading(true);
    try {
        const dataToAnalyze = activeTab === 'Inventory' 
            ? inventoryForecast.slice(0, 15) // Limit to top 15 critical items
            : cashFlowForecast.timeline.filter((_, i) => i % 7 === 0); // Weekly snapshots
        
        const result = await analyzeForecastingData(activeTab, dataToAnalyze);
        setAiAnalysis(result);
    } catch (error) {
        notify("Failed to analyze data", "error");
    } finally {
        setIsAiLoading(false);
    }
  };

  useEffect(() => {
    setAiAnalysis(null); // Reset analysis when tab changes
  }, [activeTab]);
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'cashflow') setActiveTab('CashFlow');
    else if (tab === 'inventory') setActiveTab('Inventory');
  }, [searchParams]);

  // --- Cash Flow Forecast Logic ---
  const cashFlowForecast = useMemo(() => {
    const today = startOfDay(new Date());
    const projectionDays = 90;
    const timeline = Array.from({ length: projectionDays }).map((_, i) => {
        const date = addDays(today, i);
        return {
            date: format(date, 'yyyy-MM-dd'),
            label: format(date, 'MMM dd'),
            inflow: 0,
            outflow: 0,
            balance: 0
        };
    });

    // 1. Starting Cash Balance
    const gl = companyConfig?.glMapping;
    const cashAccCodes = [gl?.cashDrawerAccount || '1000', gl?.bankAccount || '1050'];
    const cashAccs = (accounts || []).filter(a => cashAccCodes.includes(a.code) || cashAccCodes.includes(a.id));
    const cashAccIds = cashAccs.map(a => a.id);
    
    let currentCash = 0;
    ledger.forEach(entry => {
        const isDebitCash = cashAccIds.includes(entry.debitAccountId);
        const isCreditCash = cashAccIds.includes(entry.creditAccountId);
        if (isDebitCash) currentCash += entry.amount;
        if (isCreditCash) currentCash -= entry.amount;
    });

    // 2. Expected Inflows (AR)
    (invoices || []).filter(inv => inv.status !== 'Paid' && inv.status !== 'Cancelled').forEach(inv => {
        const dueDate = startOfDay(new Date(inv.dueDate));
        const diff = Math.max(0, Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
        const amount = inv.totalAmount - (inv.paidAmount || 0);
        
        if (diff < projectionDays) {
            timeline[diff].inflow += amount;
        } else {
            // For long-term, put at the end for now
            timeline[projectionDays - 1].inflow += amount;
        }
    });

    // 3. Expected Outflows (AP & Purchases)
    (purchases || []).filter(p => p.status !== 'Paid' && p.status !== 'Cancelled').forEach(p => {
        const dueDate = startOfDay(new Date(p.date)); // Assume 30 day terms if no due date
        dueDate.setDate(dueDate.getDate() + 30);
        const diff = Math.max(0, Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
        const amount = p.total - (p.paidAmount || 0);
        
        if (diff < projectionDays) {
            timeline[diff].outflow += amount;
        }
    });

    // 4. Recurring Monthly Expenses (Average of last 3 months)
    const threeMonthsAgo = subDays(today, 90);
    const recentExpenses = (expenses || []).filter(e => isAfter(new Date(e.date), threeMonthsAgo));
    const avgDailyExpense = recentExpenses.reduce((sum, e) => sum + e.amount, 0) / 90;

    // Calculate Running Balance
    let runningBalance = currentCash;
    timeline.forEach(day => {
        day.outflow += avgDailyExpense; // Add recurring daily burn
        runningBalance = runningBalance + day.inflow - day.outflow;
        day.balance = runningBalance;
    });

    return {
        timeline,
        currentCash,
        totalInflow: timeline.reduce((s, d) => s + d.inflow, 0),
        totalOutflow: timeline.reduce((s, d) => s + d.outflow, 0),
        minBalance: Math.min(...timeline.map(d => d.balance)),
        riskDay: timeline.find(d => d.balance < 0)
    };
  }, [ledger, invoices, purchases, expenses, accounts, companyConfig]);

  // --- List View Helpers ---
  const getForecastData = (item: any) => {
    // 1. Calculate total usage in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let usage = 0;

    if (item.type === 'Product') {
      // Products consumed by Sales
      const recentSales = sales.filter(s => new Date(s.date) >= thirtyDaysAgo);
      usage = recentSales.reduce((sum, sale) => {
        const lineItem = sale.items.find(i => i.id === item.id);
        return sum + (lineItem ? lineItem.quantity : 0);
      }, 0);
    } else {
      // Materials consumed by Production Batches
      const recentBatches = batches.filter(b => new Date(b.date) >= thirtyDaysAgo);
      usage = recentBatches.reduce((sum, batch) => {
        const bom = boms.find(b => b.id === batch.bomId);
        if (!bom) return sum;
        const component = bom.components.find(c => c.materialId === item.id);
        return sum + (component ? (component.quantity * batch.quantityProduced) : 0);
      }, 0);
    }

    // Accurate usage calc
    const dailyUsage = usage / 30;
    const daysUntilStockout = dailyUsage > 0 ? item.stock / dailyUsage : 999;
    const suggestedReorder = dailyUsage * 14; // Suggest 2 weeks of stock

    return { dailyUsage, daysUntilStockout, suggestedReorder };
  };

  const inventoryForecast = useMemo(() => {
    return inventory.map(item => ({
      ...item,
      ...getForecastData(item)
    })).sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
  }, [inventory, sales, batches, boms]);

  // --- Handlers ---
  const handleCreatePO = (item: Item) => {
      // Quick PO creation logic
      const id = generateNextId('PO', purchases, companyConfig);
      addPurchase({
          id,
          date: new Date().toISOString(),
          supplierId: 'SUP-0001', // Default or prompt user
          items: [{ itemId: item.id, name: item.name, quantity: 100, cost: item.cost || 0, receivedQty: 0 }],
          total: (item.cost || 0) * 100,
          status: 'Draft'
      });
      navigate('/purchases');
  };

  // --- Render Detail View ---
  if (selectedForecastItem) {
      return (
          <ProductForecastDetail 
              item={selectedForecastItem}
              salesHistory={sales}
              purchaseHistory={purchases}
              onBack={() => setSelectedForecastItem(null)}
              onCreatePO={handleCreatePO}
          />
      );
  }

  // --- Render List View ---
  return (
    <div className="p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
      <div className="mb-6 flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="text-purple-600" size={20} />
            Forecasting & Analytics Hub
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Predictive engines for stock replenishment and financial liquidity</p>
        </div>
        
        <div className="flex items-center gap-3">
            <button 
                onClick={handleAiAnalysis}
                disabled={isAiLoading}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-purple-300 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
                {isAiLoading ? <TrendingUp className="animate-spin text-purple-600" size={14} /> : <BarChart3 className="text-purple-600" size={14} />}
                {aiAnalysis ? 'Update AI Insight' : 'Get AI Forecast'}
            </button>
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button 
                    onClick={() => setActiveTab('Inventory')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'Inventory' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Package size={14}/> Inventory
                </button>
                <button 
                    onClick={() => setActiveTab('CashFlow')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'CashFlow' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Wallet size={14}/> Cash Flow
                </button>
            </div>
        </div>
      </div>

      {aiAnalysis && (
        <div className="mb-6 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100 rounded-2xl p-4 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500 relative overflow-hidden group shrink-0">
            <div className="flex items-start gap-3 relative">
                <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center shrink-0 border border-purple-100">
                    <TrendingUp className="text-purple-600" size={16} />
                </div>
                <div className="flex-1">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-[10px] font-black text-purple-900 uppercase tracking-widest">AI Strategic Forecast Insight</h3>
                        <button onClick={() => setAiAnalysis(null)} className="text-purple-400 hover:text-purple-600 transition-colors">
                            <AlertTriangle size={14} />
                        </button>
                    </div>
                    <div className="prose prose-xs prose-purple max-w-none text-purple-900/80 font-medium">
                        <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
                    </div>
                </div>
            </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === 'Inventory' ? (
          <div className="animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl p-6 text-white shadow-lg">
                <h3 className="text-purple-100 font-medium mb-1 text-xs uppercase">Critical Stock Alerts</h3>
                <div className="text-3xl font-bold mb-2">{inventoryForecast.filter(i => i.daysUntilStockout < 7).length} Items</div>
                <p className="text-xs text-purple-100 opacity-80">Will run out within 7 days based on current trends.</p>
              </div>
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <h3 className="text-slate-500 font-medium mb-1 text-xs uppercase">Avg. Daily Consumption</h3>
                <div className="text-3xl font-bold text-slate-900 mb-2">
                  {(inventoryForecast.reduce((sum, i) => sum + (i.dailyUsage || 0), 0) || 0).toFixed(1)} <span className="text-sm font-normal text-slate-500">units/day</span>
                </div>
                <p className="text-xs text-slate-500">Across all product lines</p>
              </div>
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                 <h3 className="text-slate-500 font-medium mb-1 text-xs uppercase">Est. Reorder Value</h3>
                 <div className="text-3xl font-bold text-emerald-600 mb-2">
                   {currency}{(inventoryForecast.reduce((sum, i) => sum + ((i.suggestedReorder || 0) * (i.price || 0)), 0) || 0).toFixed(0)}
                 </div>
                 <p className="text-xs text-slate-500">To maintain 14-day buffer</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <h3 className="font-bold text-slate-900 text-sm">Replenishment Recommendations</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Item</th>
                      <th className="px-6 py-4 text-center">Current Stock</th>
                      <th className="px-6 py-4 text-center">Avg. Daily Usage</th>
                      <th className="px-6 py-4 text-center">Days Remaining</th>
                      <th className="px-6 py-4 text-center">Suggested Order</th>
                      <th className="px-6 py-4 text-right">Status</th>
                      <th className="px-6 py-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {inventoryForecast.map((item) => (
                      <tr 
                          key={item.id} 
                          className="hover:bg-slate-50 cursor-pointer group transition-colors"
                          onClick={() => setSelectedForecastItem(item)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-purple-100 group-hover:text-purple-600 transition-colors">
                              <Package size={16} />
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 group-hover:text-purple-700 text-sm">{item.name}</div>
                              <div className="text-[10px] text-slate-500">{item.sku}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-medium">{item.stock}</td>
                        <td className="px-6 py-4 text-center text-slate-600">{(item.dailyUsage || 0).toFixed(2)} / day</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`font-bold text-xs ${item.daysUntilStockout < 7 ? 'text-red-600' : item.daysUntilStockout < 14 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {item.daysUntilStockout > 365 ? '> 1 Year' : `${(item.daysUntilStockout || 0).toFixed(0)} Days`}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-blue-600">
                          +{(item.suggestedReorder || 0).toFixed(0)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {item.daysUntilStockout < 7 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                              <AlertTriangle size={10} /> Critical
                            </span>
                          ) : item.daysUntilStockout < 14 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                              Low Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                              Healthy
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                            <div className="text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-1 font-bold text-xs">
                                Forecast <BarChart3 size={14}/>
                            </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-fadeIn space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5"><Coins size={60}/></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Available Cash</p>
                <h3 className="text-2xl font-black text-slate-900 mt-1">{currency}{cashFlowForecast.currentCash.toLocaleString()}</h3>
                <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-tight">Ledger balance today</p>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Est. Inflows (90d)</p>
                <h3 className="text-2xl font-black text-emerald-600 mt-1">+{currency}{cashFlowForecast.totalInflow.toLocaleString()}</h3>
                <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-tight">Pending Invoices</p>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Est. Outflows (90d)</p>
                <h3 className="text-2xl font-black text-rose-600 mt-1">-{currency}{cashFlowForecast.totalOutflow.toLocaleString()}</h3>
                <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-tight">AP & Fixed Costs</p>
              </div>
              <div className={`p-6 rounded-2xl shadow-sm border border-transparent ${cashFlowForecast.minBalance < 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <p className={`text-[10px] font-black uppercase tracking-widest ${cashFlowForecast.minBalance < 0 ? 'text-red-500' : 'text-emerald-500'}`}>Projected Liquidity</p>
                <h3 className={`text-2xl font-black mt-1 ${cashFlowForecast.minBalance < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {currency}{cashFlowForecast.minBalance.toLocaleString()}
                </h3>
                <p className={`text-[9px] font-bold mt-2 uppercase tracking-tight ${cashFlowForecast.minBalance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {cashFlowForecast.minBalance < 0 ? `Risk: Deficit on ${cashFlowForecast.riskDay?.label}` : 'Safe operating margin'}
                </p>
              </div>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="font-black text-slate-800 uppercase tracking-tighter text-lg">90-Day Cash Runway</h3>
                        <p className="text-xs text-slate-500">Includes current cash, AR, AP, and historical burn rate</p>
                    </div>
                    <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider">
                        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-500"></div> Balance</div>
                        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500/20 border border-emerald-500/30"></div> Daily Inflow</div>
                        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-rose-500/20 border border-rose-500/30"></div> Daily Outflow</div>
                    </div>
                </div>
                <div style={{ width: '100%', height: 400, minHeight: 150 }}>
                    <ResponsiveContainer key="cashflow-chart-container" width="100%" height="100%" minHeight={150} minWidth={0}>
                        <ComposedChart data={cashFlowForecast.timeline}>
                            <defs>
                                <linearGradient id="colorBal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                                dataKey="label" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{fontSize: 10, fill: '#94a3b8'}}
                                minTickGap={30}
                            />
                            <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{fontSize: 10, fill: '#94a3b8'}}
                                tickFormatter={(val) => `${currency}${val / 1000}k`}
                            />
                            <Tooltip 
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                formatter={(val: number) => [currency + val.toLocaleString(), '']}
                            />
                            <Area 
                                type="monotone" 
                                dataKey="balance" 
                                stroke="#3b82f6" 
                                strokeWidth={3} 
                                fillOpacity={1} 
                                fill="url(#colorBal)" 
                            />
                            <Bar dataKey="inflow" fill="#10b981" opacity={0.3} radius={[2, 2, 0, 0]} />
                            <Bar dataKey="outflow" fill="#ef4444" opacity={0.3} radius={[2, 2, 0, 0]} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Inflow Drivers</h4>
                    <div className="space-y-4">
                        {(invoices || []).filter(i => i.status !== 'Paid').slice(0, 5).map(inv => (
                            <div key={inv.id} className="flex justify-between items-center text-sm">
                                <div className="flex flex-col">
                                    <span className="font-bold text-slate-700">{inv.customerName}</span>
                                    <span className="text-[10px] text-slate-400">Due {format(new Date(inv.dueDate), 'MMM dd')}</span>
                                </div>
                                <span className="font-mono font-bold text-emerald-600">+{currency}{(inv.totalAmount - (inv.paidAmount || 0)).toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Outflow Drivers</h4>
                    <div className="space-y-4">
                        {(purchases || []).filter(p => p.status !== 'Paid').slice(0, 5).map(p => (
                            <div key={p.id} className="flex justify-between items-center text-sm">
                                <div className="flex flex-col">
                                    <span className="font-bold text-slate-700">Supplier: {p.supplierId}</span>
                                    <span className="text-[10px] text-slate-400">Ref: {p.id}</span>
                                </div>
                                <span className="font-mono font-bold text-rose-600">-{currency}{(p.total - (p.paidAmount || 0)).toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Forecasting;
