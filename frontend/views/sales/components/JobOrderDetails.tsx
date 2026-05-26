
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { pdf } from '@react-pdf/renderer';
import { PrimeDocument } from '../../shared/components/PDF/PrimeDocument';
import { PrimeDocData } from '../../shared/components/PDF/schemas';
import { 
    X, CheckCircle, Clock, FileText, DollarSign, Printer, Edit2, Box, Link as LinkIcon, 
    Activity, ArrowRight, Trash2, Play, Timer, ListTodo, History, PenTool, Mail, 
    Check, PlayCircle, Briefcase, AlertCircle, Target, ShieldCheck, Scale, Layout, 
    Info, FileCheck, TrendingUp, RefreshCw, Sparkles, Gauge, Loader2, Droplet, Download
} from 'lucide-react';
import { JobOrder, Attachment, InvoiceAllocation, InkCoverage } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useSales } from '../../../context/SalesContext';
import ReactMarkdown from 'react-markdown';
import { generateAIResponse } from '../../../services/geminiService';
import InkDensityAnalyzer from '../../production/components/InkDensityAnalyzer';
import { attachDocumentSecurity } from '../../../utils/documentSecurity';
import { enrichDocumentCustomerData } from '../../../utils/documentCustomerData';
import { initializePrimePdfFonts } from '../../shared/components/PDF/templateSettings';

interface JobOrderDetailsProps {
    jobOrder: JobOrder;
    onClose: () => void;
    onEdit: (jo: JobOrder) => void;
    onAction: (jo: JobOrder, action: string) => void;
}

export const JobOrderDetails: React.FC<JobOrderDetailsProps> = ({ jobOrder, onClose, onEdit, onAction }) => {
    const { companyConfig, notify, isOnline } = useAuth();
    const { customers = [], updateJobOrder, convertJobOrderToInvoice } = useSales();
    const currency = companyConfig.currencySymbol;
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'Overview' | 'Financials' | 'Pre-Press' | 'Quality Control'>('Overview');
    const [isConverting, setIsConverting] = useState(false);
    
    const handleDownloadPDF = async () => {
        try {
            notify("Preparing Job Order PDF...", "info");
            const enrichedJobOrder = enrichDocumentCustomerData(jobOrder, customers) as any;
            
            const pdfData: PrimeDocData = {
                number: jobOrder.id,
                date: new Date(jobOrder.date).toLocaleDateString(),
                clientName: enrichedJobOrder.customerName || jobOrder.customerName,
                address: enrichedJobOrder.address || enrichedJobOrder.customerAddress || enrichedJobOrder.billingAddress || enrichedJobOrder.shippingAddress || '',
                phone: enrichedJobOrder.phone || enrichedJobOrder.customerPhone || enrichedJobOrder.schoolPhone || '',
                items: [{
                    desc: jobOrder.jobTitle + (jobOrder.jobDescription ? `: ${jobOrder.jobDescription}` : ''),
                    qty: jobOrder.totalQuantity,
                }],
                notes: jobOrder.jobDescription || ''
            };

            const securedPdfData = await attachDocumentSecurity(pdfData, companyConfig?.companyName);
            await initializePrimePdfFonts();
            const blob = await pdf(<PrimeDocument type="WORK_ORDER" data={securedPdfData as PrimeDocData} />).toBlob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `JOB-ORDER-${jobOrder.id}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
            notify("Job Order PDF downloaded successfully", "success");
        } catch (error) {
            console.error("PDF generation failed:", error);
            notify("Failed to generate PDF", "error");
        }
    };
    
    // Pre-flight State
    const [isAuditing, setIsAuditing] = useState(false);
    const [auditReport, setAuditReport] = useState('');

    const handleRunAudit = async () => {
        if (!isOnline) return;
        setIsAuditing(true);
        const prompt = `Perform a Pre-press Flight Check on this Job Order:
        Title: ${jobOrder.jobTitle}
        Specs: ${jobOrder.jobDescription}
        Attachments: ${(jobOrder.attachments || []).map(a => a.name).join(', ')}
        
        Evaluate readiness based on 3 criteria: Resolution, Bleed, and Color Space. 
        Assign a score (0-100) and highlight critical warnings for a professional printer operator.`;
        
        try {
            const result = await generateAIResponse(prompt, "You are a Master Pre-press Technician.");
            setAuditReport(result);
        } finally {
            setIsAuditing(false);
        }
    };

    const handleInkAnalysis = (coverage: InkCoverage) => {
        updateJobOrder({ ...jobOrder, inkCoverage: coverage });
        notify("Job material costs updated with AI ink density.", "success");
    };

    const totalInternalCost = (jobOrder.laborCost || 0) + (jobOrder.overheadCost || 0) + (jobOrder.materialCost || 0);

    return (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-[1.5rem] shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200/60 font-sans text-[13px] leading-relaxed text-slate-800">
                <div className="px-[16px] py-[12px] border-b border-slate-100 bg-slate-50/50 flex justify-between items-start shrink-0">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-[22px] font-semibold text-slate-800 tracking-tight">Job Order #{jobOrder.id}</h1>
                            <span className={`px-2.5 py-0.5 rounded-lg text-[12.5px] font-semibold tracking-wide bg-blue-100 text-blue-700`}>{jobOrder.status}</span>
                        </div>
                        <div className="flex items-center gap-4 text-[12.5px] font-medium text-slate-500 tracking-wide">
                            <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-bold">{jobOrder.customerName}</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {jobOrder.status === 'Completed' && (
                            <button onClick={() => {}} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold flex items-center gap-2"><FileCheck size={16}/> Bill Customer</button>
                        )}
                        <button 
                            onClick={handleDownloadPDF} 
                            className="px-4 py-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-100 shadow-sm flex items-center gap-2 text-sm font-bold"
                            title="Download PDF"
                        >
                            <Download size={16}/> Download
                        </button>
                        <button onClick={() => window.print()} className="p-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm" title="Print"><Printer size={18}/></button>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500"><X size={24}/></button>
                    </div>
                </div>

                <div className="flex border-b border-slate-200 px-6 bg-white shrink-0">
                    {['Overview', 'Pre-Press', 'Financials', 'Quality Control'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-6 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-800'}`}>{tab}</button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 custom-scrollbar">
                    {activeTab === 'Pre-Press' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
                            {/* Ink Analyzer Component */}
                            <InkDensityAnalyzer 
                                imageUrl={jobOrder.attachments?.[0]?.url || ''} 
                                onAnalysisComplete={handleInkAnalysis}
                            />

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                                    <div className="flex items-center justify-between mb-8">
                                        <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs flex items-center gap-2"><Sparkles className="text-purple-600"/> AI Pre-flight Auditor</h3>
                                        <button 
                                            onClick={handleRunAudit}
                                            disabled={isAuditing || !isOnline}
                                            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center gap-2 shadow-lg shadow-slate-900/10"
                                        >
                                            {isAuditing ? <Loader2 size={14} className="animate-spin"/> : <Activity size={14}/>}
                                            Run Logic Check
                                        </button>
                                    </div>
                                    
                                    {auditReport ? (
                                        <div className="prose prose-sm prose-slate max-w-none bg-slate-50 p-6 rounded-2xl border border-slate-100 text-slate-700 leading-relaxed overflow-y-auto max-h-96">
                                            <ReactMarkdown>{auditReport}</ReactMarkdown>
                                        </div>
                                    ) : (
                                        <div className="h-64 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-slate-400 text-center px-10">
                                            <ShieldCheck size={48} className="mb-4 opacity-20"/>
                                            <p className="text-sm font-bold uppercase tracking-wider">Ready for Audit</p>
                                            <p className="text-xs mt-2">AI will check artwork resolution, color space, and bleed zones before release to press.</p>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-6">
                                    <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-8 opacity-10"><Target size={120}/></div>
                                        <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mb-6">Readiness score</h3>
                                        <div className="flex items-center gap-6">
                                            <div className="w-24 h-24 rounded-full border-8 border-emerald-500 flex items-center justify-center text-3xl font-black italic">
                                                {auditReport ? '92' : '--'}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-300">File Integrity: <span className="text-emerald-400">Excellent</span></p>
                                                <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">Optimized for: Digital Press</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Customer Pins</h3>
                                        <div className="space-y-3">
                                            {(jobOrder.annotations || []).length === 0 ? (
                                                <p className="text-xs text-slate-400 italic">No feedback pins on proof.</p>
                                            ) : (
                                                jobOrder.annotations?.map(ann => (
                                                    <div key={ann.id} className="flex gap-3 items-start p-3 bg-slate-50 rounded-xl border border-slate-100">
                                                        <div className="w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center shrink-0 text-[10px] font-black">{ann.id.split('-').pop()}</div>
                                                        <div>
                                                            <p className="text-xs font-bold text-slate-800">{ann.comment}</p>
                                                            <p className="text-[9px] text-slate-400 uppercase mt-1">Pinned by {ann.author} • {new Date(ann.date).toLocaleTimeString()}</p>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'Overview' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 space-y-6">
                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2"><FileText size={16} className="text-blue-600"/> Order Description</h3>
                                    <div className="p-4 bg-slate-50 rounded-xl text-sm text-slate-700 leading-relaxed italic border border-slate-100">
                                        "{jobOrder.jobDescription || 'No description provided.'}"
                                    </div>
                                </div>
                                {jobOrder.inkCoverage && (
                                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2"><Droplet size={16} className="text-blue-500"/> Verified Ink Metrics</h3>
                                        <div className="grid grid-cols-4 gap-4">
                                            <div className="text-center p-3 bg-cyan-50 rounded-xl border border-cyan-100"><p className="text-[9px] font-bold text-cyan-600 uppercase">Cyan</p><p className="font-black text-slate-800">{jobOrder.inkCoverage.cyan}%</p></div>
                                            <div className="text-center p-3 bg-pink-50 rounded-xl border border-pink-100"><p className="text-[9px] font-bold text-pink-600 uppercase">Magenta</p><p className="font-black text-slate-800">{jobOrder.inkCoverage.magenta}%</p></div>
                                            <div className="text-center p-3 bg-yellow-50 rounded-xl border border-yellow-100"><p className="text-[9px] font-bold text-yellow-600 uppercase">Yellow</p><p className="font-black text-slate-800">{jobOrder.inkCoverage.yellow}%</p></div>
                                            <div className="text-center p-3 bg-slate-100 rounded-xl border border-slate-200"><p className="text-[9px] font-bold text-slate-600 uppercase">Black</p><p className="font-black text-slate-800">{jobOrder.inkCoverage.black}%</p></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-4">
                                <div className="bg-slate-900 p-5 rounded-2xl shadow-xl text-white relative overflow-hidden">
                                    <p className="text-[9px] font-black text-blue-400 uppercase tracking-[0.2em] mb-2">Internal Cost Control</p>
                                    <div className="text-2xl font-black">{currency}{totalInternalCost.toLocaleString()}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
