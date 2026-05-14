
import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Package, ShoppingCart, Users, Truck, Search, ArrowRight, Sparkles, Loader2, MessageSquare, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { OfflineImage } from '../components/OfflineImage';
import { askBusinessQuestion } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';

const toSafeNumber = (val: any): number => {
    const n = Number(val);
    return isNaN(n) ? 0 : n;
};

const GlobalSearch: React.FC = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const navigate = useNavigate();
  const { inventory, sales, customers, suppliers, purchases, isOnline } = useData();

  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    const handleAiSearch = async () => {
        if (!query || query.length < 5 || !isOnline) return;
        
        // Only trigger AI if it looks like a question or natural language
        const isQuestion = query.includes('?') || 
                          query.toLowerCase().startsWith('who') || 
                          query.toLowerCase().startsWith('what') || 
                          query.toLowerCase().startsWith('how') ||
                          query.toLowerCase().startsWith('show') ||
                          query.toLowerCase().startsWith('find');

        if (isQuestion || (results.items.length === 0 && results.sales.length === 0 && results.contacts.length === 0)) {
            setIsAiLoading(true);
            try {
                // Prepare a minimized context for the AI
                const context = {
                    inventoryCount: inventory.length,
                    salesCount: sales.length,
                    topCustomers: customers.slice(0, 10).map(c => ({ name: c.name, balance: c.balance })),
                    lowStockItems: inventory.filter(i => i.stock <= (i.minStockLevel || 0)).slice(0, 10).map(i => ({ name: i.name, stock: i.stock })),
                    recentSales: sales.slice(0, 5).map(s => ({ id: s.id, customer: s.customerName, total: s.totalAmount }))
                };
                const answer = await askBusinessQuestion(query, context);
                setAiAnswer(answer);
            } catch (err) {
                console.error(err);
            } finally {
                setIsAiLoading(false);
            }
        }
    };

    setAiAnswer(null);
    handleAiSearch();
  }, [query]);

  const results = useMemo(() => {
    if (!query) return { items: [], sales: [], contacts: [], purchases: [] };
    const lowerQuery = query.toLowerCase();

        return {
            items: inventory.filter(i => 
                String(i.name || '').toLowerCase().includes(lowerQuery) || 
                String(i.sku || '').toLowerCase().includes(lowerQuery)
            ),
            sales: sales.filter(s => 
                String(s.id || '').toLowerCase().includes(lowerQuery) || 
                String(s.customerName || '').toLowerCase().includes(lowerQuery)
            ),
            contacts: [...customers, ...suppliers].filter(c => 
                String(c.name || '').toLowerCase().includes(lowerQuery) || 
                String(c.contact || '').toLowerCase().includes(lowerQuery) ||
                String(c.email || '').toLowerCase().includes(lowerQuery)
            ),
            purchases: purchases.filter(p => 
                String(p.id || '').toLowerCase().includes(lowerQuery) || 
                String(p.supplierId || '').toLowerCase().includes(lowerQuery)
            )
        };
  }, [query, inventory, sales, customers, suppliers, purchases]);

  const ResultSection = ({ title, icon: Icon, data, renderItem, link }: any) => {
    if (data.length === 0) return null;
    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Icon size={18} className="text-blue-600"/> {title} <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">{data.length}</span>
            </h3>
            {link && (
                <button onClick={() => navigate(link)} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
                    View All <ArrowRight size={12}/>
                </button>
            )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.slice(0, 6).map((item: any) => (
            <div key={item.id} className="bg-white p-4 rounded-xl border border-slate-200 hover:shadow-md transition-all cursor-pointer" onClick={() => renderItem(item).action()}>
                {renderItem(item).content}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Search className="text-blue-600" size={20}/> Global Search
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">Results for "{query}"</p>
      </div>

      {(isAiLoading || aiAnswer) && (
        <div className="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-3xl p-6 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
                <Sparkles size={80} className="text-blue-600" />
            </div>
            <div className="flex items-start gap-4 relative">
                <div className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0 border border-blue-100">
                    {isAiLoading ? <Loader2 className="animate-spin text-blue-600" size={20} /> : <Sparkles className="text-blue-600" size={20} />}
                </div>
                <div className="flex-1">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-black text-blue-900 uppercase tracking-widest flex items-center gap-2">
                            AI Assistant
                            {isAiLoading && <span className="text-[10px] lowercase font-medium text-blue-400 tracking-normal">(thinking...)</span>}
                        </h3>
                        {aiAnswer && (
                            <button onClick={() => setAiAnswer(null)} className="text-blue-400 hover:text-blue-600 transition-colors">
                                <X size={16} />
                            </button>
                        )}
                    </div>
                    {isAiLoading ? (
                        <div className="space-y-2">
                            <div className="h-4 bg-blue-200/50 rounded-lg animate-pulse w-3/4"></div>
                            <div className="h-4 bg-blue-200/50 rounded-lg animate-pulse w-1/2"></div>
                        </div>
                    ) : (
                        <div className="prose prose-sm prose-blue max-w-none text-blue-900/80 font-medium">
                            <ReactMarkdown>{aiAnswer!}</ReactMarkdown>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {Object.values(results).every((arr: any) => arr.length === 0) ? (
        <div className="text-center py-20 text-slate-400">
            <Search size={64} className="mx-auto mb-4 opacity-20"/>
            <p className="text-lg font-bold">No results found for "{query}"</p>
            <p className="text-sm">Try checking for typos or using different keywords.</p>
        </div>
      ) : (
        <div className="space-y-6">
            <ResultSection 
                title="Inventory Items" 
                icon={Package} 
                data={results.items} 
                link="/inventory"
                renderItem={(item: any) => ({
                    action: () => navigate('/inventory'),
                    content: (
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 overflow-hidden shrink-0 border border-slate-200">
                                <OfflineImage 
                                    src={item.image} 
                                    alt={item.name} 
                                    className="w-full h-full object-cover" 
                                    fallback={<Package size={20}/>}
                                />
                            </div>
                            <div className="min-w-0">
                                <div className="font-bold text-slate-800 text-sm truncate">{item.name}</div>
                                <div className="text-xs text-slate-500">SKU: {item.sku} • Stock: {item.stock}</div>
                            </div>
                        </div>
                    )
                })}
            />

            <ResultSection
                title="Sales & Invoices"
                icon={ShoppingCart}
                data={results.sales}
                link="/sales-flow/payments"
                renderItem={(sale: any) => ({
                    action: () => navigate('/sales-flow/payments'),
                    content: (
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-mono text-xs font-bold text-blue-600">{sale.id}</span>
                                <span className="text-xs text-slate-500">{new Date(sale.date).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="font-bold text-slate-800 text-sm">{sale.customerName}</div>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${sale.source === 'POS' || sale.id?.startsWith('POS-') ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>
                                    {sale.source === 'POS' || sale.id?.startsWith('POS-') ? 'POS' : 'Invoice'}
                                </span>
                            </div>
                            <div className="text-xs text-slate-600 mt-1">Total: {toSafeNumber(sale.total ?? sale.totalAmount).toLocaleString()}</div>
                        </div>
                    )
                })}
            />

            <ResultSection 
                title="Contacts" 
                icon={Users} 
                data={results.contacts} 
                link="/contacts"
                renderItem={(contact: any) => ({
                    action: () => navigate('/contacts'),
                    content: (
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                                {contact.name.charAt(0)}
                            </div>
                            <div>
                                <div className="font-bold text-slate-800 text-sm">{contact.name}</div>
                                <div className="text-xs text-slate-500">{contact.contact}</div>
                            </div>
                        </div>
                    )
                })}
            />

            <ResultSection 
                title="Purchase Orders" 
                icon={Truck} 
                data={results.purchases} 
                link="/purchases"
                renderItem={(po: any) => ({
                    action: () => navigate('/purchases'),
                    content: (
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-mono text-xs font-bold text-purple-600">{po.id}</span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${po.status === 'Received' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{po.status}</span>
                            </div>
                            <div className="text-xs font-medium text-slate-800">Supplier: {po.supplierId}</div>
                            <div className="text-[10px] text-slate-500 mt-1">{new Date(po.date).toLocaleDateString()}</div>
                        </div>
                    )
                })}
            />
        </div>
      )}
    </div>
  );
};

export default GlobalSearch;
