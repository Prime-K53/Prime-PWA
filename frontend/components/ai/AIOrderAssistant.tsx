import React, { useState, useMemo } from 'react';
import { Sparkles, X, Loader2, TrendingUp, Clock, DollarSign, CheckCircle, AlertTriangle, ShoppingBag, Lightbulb, FileText, User, Mail, Phone, MapPin } from 'lucide-react';
import { generateCustomerInsight, generateAIResponse } from '../../services/geminiService';

interface Props {
  customerName: string;
  customerObj: any;
  items: any[];
  invoices: any[];
  payments: any[];
  inventory: any[];
  currency: string;
  onAddItem?: (item: any) => void;
}

const AIOrderAssistant: React.FC<Props> = ({ customerName, customerObj, items, invoices, payments, inventory, currency, onAddItem }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'insight' | 'recommend' | 'summary'>('insight');
  const [insight, setInsight] = useState<any>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [recommendations, setRecommendations] = useState<any[]>(null);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState('');

  const customerInvoices = useMemo(() =>
    invoices.filter(i => i.customerName === customerName),
    [customerName, invoices]
  );

  const customerPayments = useMemo(() =>
    payments.filter(r => r.customerName === customerName),
    [customerName, payments]
  );

  const handleInsight = async () => {
    if (!customerObj) return;
    setLoadingInsight(true);
    setError('');
    try {
      const result = await generateCustomerInsight(customerObj, customerInvoices, customerPayments);
      setInsight(result);
    } catch (e: any) {
      setError(e.message || 'Failed to load insight');
    }
    setLoadingInsight(false);
  };

  const handleRecommend = async () => {
    if (!customerName || inventory.length === 0) return;
    setLoadingRecs(true);
    setError('');
    try {
      const prompt = `You are a sales recommendation engine for an ERP system.

Customer: ${customerName}
Customer invoices (${customerInvoices.length}): ${JSON.stringify(customerInvoices.slice(0, 10).map(i => ({ date: i.date, amount: i.totalAmount, items: i.items?.map((x: any) => x.name || x.itemName) })))}

Available inventory (${inventory.length} items): ${JSON.stringify(inventory.filter((i: any) => i.type !== 'Material').slice(0, 30).map((i: any) => ({ name: i.name, price: i.sellingPrice || i.unitPrice, sku: i.sku, stock: i.stock })))}

Current order items: ${JSON.stringify(items.map(i => ({ name: i.name || i.itemName, qty: i.quantity, price: i.price })))}

Suggest 3-5 items from the available inventory that this customer is most likely to purchase based on their history. Return ONLY a JSON array: [{ "name": "string", "reason": "string (max 8 words)", "sku": "string" }]`;

      const text = await generateAIResponse(prompt);
      const parsed = JSON.parse(text);
      setRecommendations(Array.isArray(parsed) ? parsed : []);
    } catch (e: any) {
      setError('Could not generate recommendations');
    }
    setLoadingRecs(false);
  };

  const handleSummary = async () => {
    if (items.length === 0) return;
    setLoadingSummary(true);
    setError('');
    try {
      const total = items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0);
      const prompt = `Summarize this order for a business manager:

Customer: ${customerName || 'Not selected'}
Items: ${items.map(i => `${i.name || i.itemName} x${i.quantity || 1} @ ${currency}${(i.price || 0).toFixed(2)}`).join(', ')}
Total: ${currency}${total.toFixed(2)}

Return JSON: { "summary": "string (max 2 sentences)", "keyNumbers": ["string"], "status": "string (Draft|Balanced|Premium)" }`;

      const text = await generateAIResponse(prompt);
      const parsed = JSON.parse(text);
      setSummary(parsed);
    } catch {
      setError('Could not generate summary');
    }
    setLoadingSummary(false);
  };

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setError('');
    if (tab === 'insight' && !insight && !loadingInsight && customerObj) handleInsight();
    if (tab === 'recommend' && !recommendations && !loadingRecs && customerName) handleRecommend();
    if (tab === 'summary' && !summary && !loadingSummary && items.length > 0) handleSummary();
  };

  const badgeColor = (val: string) =>
    val === 'high' || val === 'excellent' ? '#16a34a' : val === 'medium' || val === 'good' || val === 'average' ? '#d97706' : '#dc2626';
  const badgeBg = (val: string) =>
    val === 'high' || val === 'excellent' ? '#f0fdf4' : val === 'medium' || val === 'good' || val === 'average' ? '#fffbeb' : '#fef2f2';

  return (
    <>
      {/* Floating AI Button */}
      <button
        onClick={() => { setIsOpen(!isOpen); if (!isOpen && customerObj) handleInsight(); }}
        className="fixed bottom-8 right-8 z-50 w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center border border-white/20"
        title="AI Order Assistant"
      >
        <Sparkles size={24} />
      </button>

      {/* Side Panel */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setIsOpen(false)}>
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-white shadow-2xl border-l border-slate-200 h-full overflow-y-auto animate-in slide-in-from-right duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Panel Header */}
            <div className="sticky top-0 z-10 bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Sparkles size={18} className="text-white" />
                <h2 className="text-[15px] font-bold text-white tracking-tight">AI Order Assistant</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center text-white hover:bg-white/25 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Customer Context Bar */}
            {customerName && (
              <div className="px-5 py-3 bg-indigo-50/50 border-b border-indigo-100/50 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[11px] font-bold">
                  {customerName.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-indigo-900 truncate">{customerName}</p>
                  <p className="text-[10px] text-indigo-500">{customerInvoices.length} invoices · {customerPayments.length} payments</p>
                </div>
                {customerObj && !insight && !loadingInsight && (
                  <button onClick={handleInsight} className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2 py-1 rounded-lg hover:bg-indigo-200 transition-colors">
                    Analyze
                  </button>
                )}
              </div>
            )}

            {!customerName && (
              <div className="px-5 py-8 text-center text-slate-400">
                <User size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-[13px] font-medium">Select a customer to enable AI insights</p>
              </div>
            )}

            {/* Tabs */}
            {customerName && (
              <div className="flex border-b border-slate-100 px-5">
                {[
                  { key: 'insight' as const, label: 'Insight', icon: <TrendingUp size={13} /> },
                  { key: 'recommend' as const, label: 'Recommend', icon: <ShoppingBag size={13} /> },
                  { key: 'summary' as const, label: 'Summary', icon: <FileText size={13} /> },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => handleTabChange(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-bold border-b-2 transition-colors ${activeTab === tab.key ? 'text-indigo-600 border-indigo-500' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mx-5 mt-3 px-3 py-2 bg-rose-50 border border-rose-100 rounded-lg text-[11px] font-medium text-rose-600 flex items-center gap-2">
                <AlertTriangle size={12} />
                {error}
              </div>
            )}

            {/* Content */}
            <div className="p-5">
              {activeTab === 'insight' && (
                <div className="space-y-4">
                  {loadingInsight ? (
                    <div className="py-10 text-center text-slate-400">
                      <Loader2 size={22} className="animate-spin mx-auto mb-2" />
                      <p className="text-[12px] font-medium">Analyzing customer...</p>
                    </div>
                  ) : insight ? (
                    <>
                      {/* Badges */}
                      <div className="flex gap-2 flex-wrap">
                        {[
                          { label: 'Reliability', value: insight.reliability },
                          { label: 'Payment', value: insight.paymentPunctuality },
                        ].map((item, i) => (
                          <span key={i} style={{ padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: badgeBg(item.value), color: badgeColor(item.value) }}>
                            {item.label}: {item.value}
                          </span>
                        ))}
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 gap-2.5">
                        {[
                          { icon: <DollarSign size={13} />, label: 'Total Spent', value: `${currency}${(insight.totalSpent || 0).toLocaleString()}` },
                          { icon: <TrendingUp size={13} />, label: 'Avg Invoice', value: `${currency}${(insight.averageInvoice || 0).toLocaleString()}` },
                          { icon: <Clock size={13} />, label: 'Last Order', value: insight.lastOrderDate ? new Date(insight.lastOrderDate).toLocaleDateString() : 'N/A' },
                          { icon: <ShoppingBag size={13} />, label: 'Invoices', value: customerInvoices.length.toString() },
                        ].map((item, i) => (
                          <div key={i} className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 mb-1">
                              {item.icon}{item.label}
                            </div>
                            <p className="text-[14px] font-bold text-slate-800">{item.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Insight Text */}
                      {insight.insight && (
                        <div className="px-3.5 py-2.5 rounded-xl bg-indigo-50 border border-indigo-100 text-[12px] text-indigo-800 font-medium leading-relaxed">
                          {insight.insight}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-8 text-center text-slate-400">
                      <p className="text-[12px]">Click analyze to see customer insights</p>
                      <button onClick={handleInsight} className="mt-2 px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[11px] font-bold hover:bg-indigo-100 transition-colors">
                        Analyze Customer
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'recommend' && (
                <div className="space-y-3">
                  {loadingRecs ? (
                    <div className="py-10 text-center text-slate-400">
                      <Loader2 size={22} className="animate-spin mx-auto mb-2" />
                      <p className="text-[12px] font-medium">Getting recommendations...</p>
                    </div>
                  ) : recommendations && recommendations.length > 0 ? (
                    <>
                      <p className="text-[11px] font-semibold text-slate-500">Suggested items for {customerName}:</p>
                      {recommendations.map((rec, i) => (
                        <div key={i} className="flex items-center justify-between px-3.5 py-3 bg-slate-50 border border-slate-100 rounded-xl hover:bg-indigo-50/50 hover:border-indigo-100 transition-colors group">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-slate-800 truncate">{rec.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Lightbulb size={11} className="text-amber-500 shrink-0" />
                              <p className="text-[10px] text-slate-500">{rec.reason}</p>
                              {rec.sku && <span className="text-[9px] font-mono text-slate-400">{rec.sku}</span>}
                            </div>
                          </div>
                          {onAddItem && (
                            <button
                              onClick={() => {
                                const found = inventory.find((inv: any) => inv.name === rec.name || inv.sku === rec.sku);
                                if (found) onAddItem(found);
                              }}
                              className="ml-2 px-2.5 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-all hover:bg-indigo-200 shrink-0"
                            >
                              + Add
                            </button>
                          )}
                        </div>
                      ))}
                      <button onClick={handleRecommend} className="w-full py-2 text-[11px] font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors">
                        Refresh Suggestions
                      </button>
                    </>
                  ) : (
                    <div className="py-8 text-center text-slate-400">
                      <ShoppingBag size={28} className="mx-auto mb-2 opacity-40" />
                      <p className="text-[12px] font-medium">Get smart product suggestions</p>
                      <p className="text-[10px] text-slate-400 mt-1">Based on {customerName}'s purchase history</p>
                      <button onClick={handleRecommend} className="mt-3 px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[11px] font-bold hover:bg-indigo-100 transition-colors">
                        Generate Suggestions
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'summary' && (
                <div className="space-y-4">
                  {loadingSummary ? (
                    <div className="py-10 text-center text-slate-400">
                      <Loader2 size={22} className="animate-spin mx-auto mb-2" />
                      <p className="text-[12px] font-medium">Generating summary...</p>
                    </div>
                  ) : summary ? (
                    <>
                      <div className={`px-3.5 py-2.5 rounded-xl border ${summary.status === 'Premium' ? 'bg-amber-50 border-amber-100 text-amber-800' : summary.status === 'Balanced' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-slate-50 border-slate-100 text-slate-700'}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <CheckCircle size={13} />
                          <span className="text-[10px] font-bold uppercase tracking-wider">{summary.status}</span>
                        </div>
                        <p className="text-[12px] font-medium leading-relaxed">{summary.summary}</p>
                      </div>

                      {summary.keyNumbers && summary.keyNumbers.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Key Numbers</p>
                          <div className="flex flex-wrap gap-1.5">
                            {summary.keyNumbers.map((k: string, i: number) => (
                              <span key={i} className="px-2 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold">
                                {k}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <button onClick={handleSummary} className="w-full py-2 text-[11px] font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors">
                        Refresh Summary
                      </button>
                    </>
                  ) : (
                    <div className="py-8 text-center text-slate-400">
                      <FileText size={28} className="mx-auto mb-2 opacity-40" />
                      <p className="text-[12px] font-medium">Summarize current order</p>
                      {items.length === 0 && <p className="text-[10px] mt-1">Add items to the order first</p>}
                      {items.length > 0 && (
                        <button onClick={handleSummary} className="mt-3 px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[11px] font-bold hover:bg-indigo-100 transition-colors">
                          Generate Summary
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Footer Info */}
              <div className="mt-6 pt-4 border-t border-slate-100">
                <p className="text-[9px] text-slate-400 text-center">
                  AI responses are generated by an external service and may not always be accurate.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AIOrderAssistant;
