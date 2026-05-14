import React, { useState } from 'react';
import { ShieldCheck, Activity, TrendingUp, AlertTriangle, FileText, Sparkles, RefreshCw, Printer, Loader2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { generateBusinessHealthReport } from '../../services/geminiService';
import ReactMarkdown from 'react-markdown';

const BusinessHealthReport: React.FC = () => {
    const { invoices, expenses, income, accounts, sales, customers, inventory, notify, companyConfig } = useData();
    const [report, setReport] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleGenerateReport = async () => {
        setIsLoading(true);
        try {
            const result = await generateBusinessHealthReport(
                { invoices, expenses, income, accounts },
                { sales, customers },
                { inventory }
            );
            setReport(result);
            notify("AI Health Report generated successfully", "success");
        } catch (error) {
            console.error(error);
            notify("Failed to generate report", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Business Health Intelligence</h2>
                    <p className="text-sm text-slate-500 font-medium">AI-powered strategic analysis and financial diagnostic report</p>
                </div>
                
                <button
                    onClick={handleGenerateReport}
                    disabled={isLoading}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
                        isLoading 
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="animate-spin" size={16} />
                            Analyzing...
                        </>
                    ) : (
                        <>
                            <Sparkles size={16} />
                            {report ? 'Regenerate' : 'Generate Report'}
                        </>
                    )}
                </button>
            </div>

            {!report && !isLoading && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                        <Activity className="text-blue-500" size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">Ready for Strategic Analysis</h3>
                    <p className="text-slate-500 max-w-md mb-6">
                        Our AI will analyze your financial statements, sales velocity, and inventory levels to provide a comprehensive health diagnostic.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                        <div className="bg-slate-50 p-4 rounded-xl text-left border border-slate-100">
                            <TrendingUp className="text-emerald-500 mb-2" size={20} />
                            <h4 className="font-bold text-sm text-slate-800">Growth Trends</h4>
                            <p className="text-xs text-slate-500">Revenue and expense velocity analysis.</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl text-left border border-slate-100">
                            <AlertTriangle className="text-amber-500 mb-2" size={20} />
                            <h4 className="font-bold text-sm text-slate-800">Risk Mitigation</h4>
                            <p className="text-xs text-slate-500">Identify stockouts and cash flow gaps.</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl text-left border border-slate-100">
                            <FileText className="text-blue-500 mb-2" size={20} />
                            <h4 className="font-bold text-sm text-slate-800">Action Plan</h4>
                            <p className="text-xs text-slate-500">3-5 strategic steps for improvement.</p>
                        </div>
                    </div>
                </div>
            )}

            {isLoading && (
                <div className="space-y-6">
                    <div className="h-10 bg-slate-100 rounded-xl animate-pulse w-3/4"></div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="h-24 bg-slate-50 rounded-xl animate-pulse"></div>
                        <div className="h-24 bg-slate-50 rounded-xl animate-pulse"></div>
                        <div className="h-24 bg-slate-50 rounded-xl animate-pulse"></div>
                    </div>
                    <div className="h-48 bg-slate-50 rounded-xl animate-pulse"></div>
                </div>
            )}

            {report && !isLoading && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-slate-900 p-4 flex justify-between items-center text-white">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-500/20 p-2 rounded-lg">
                                <Sparkles className="text-blue-300" size={18} />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm uppercase tracking-widest">AI Strategic Diagnostic</h3>
                                <p className="text-[10px] text-slate-400 mt-0.5">Report Generated on {new Date().toLocaleDateString()}</p>
                            </div>
                        </div>
                        <button 
                            onClick={handlePrint}
                            className="px-3 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors flex items-center gap-2"
                        >
                            <Printer size={16} />
                            <span className="text-xs font-semibold">Print</span>
                        </button>
                    </div>
                    
                    <div className="p-6 prose prose-slate max-w-none">
                        <ReactMarkdown 
                            components={{
                                h1: ({node, ...props}) => <h1 className="text-2xl font-black text-slate-800 mb-4" {...props} />,
                                h2: ({node, ...props}) => <h2 className="text-lg font-bold text-slate-700 border-b border-slate-100 pb-2 mt-6 mb-3" {...props} />,
                                h3: ({node, ...props}) => <h3 className="text-base font-bold text-slate-600 mt-4 mb-2" {...props} />,
                                p: ({node, ...props}) => <p className="text-slate-600 leading-relaxed mb-3" {...props} />,
                                ul: ({node, ...props}) => <ul className="space-y-1 mb-4" {...props} />,
                                li: ({node, ...props}) => (
                                    <li className="flex items-start gap-2 text-slate-600">
                                        <div className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                                        <span>{props.children}</span>
                                    </li>
                                ),
                                strong: ({node, ...props}) => <strong className="font-bold text-slate-800" {...props} />,
                            }}
                        >
                            {report}
                        </ReactMarkdown>
                    </div>

                    <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-center">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <ShieldCheck size={12} /> Prime ERP AI Intelligence
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BusinessHealthReport;
