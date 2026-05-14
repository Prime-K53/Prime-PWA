
import React, { useState, useRef, useEffect } from 'react';
import { CreditCard, Printer, Plus, Search, Calendar, CheckCircle, XCircle, Clock, Settings, Save, ArrowLeft, MoreVertical, Edit2, Trash2, FileText, Loader2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useFinance } from '../../context/FinanceContext';
import { Cheque } from '../../types';

// Helper for number to words (Simplified)
const numberToWords = (amount: number): string => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    const convertLessThanOneThousand = (n: number): string => {
        if (n === 0) return '';
        if (n < 10) return ones[n];
        if (n < 20) return teens[n - 10];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
        return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + convertLessThanOneThousand(n % 100) : '');
    };

    if (amount === 0) return 'Zero';
    
    const numStr = amount.toString();
    const parts = numStr.split('.');
    const whole = parseInt(parts[0]);
    const fraction = parts.length > 1 ? parseInt(parts[1].substring(0,2).padEnd(2,'0')) : 0;

    let words = '';
    if (whole < 1000) words = convertLessThanOneThousand(whole);
    else if (whole < 1000000) words = convertLessThanOneThousand(Math.floor(whole / 1000)) + ' Thousand ' + convertLessThanOneThousand(whole % 1000);
    else words = convertLessThanOneThousand(Math.floor(whole / 1000000)) + ' Million ' + convertLessThanOneThousand(Math.floor((whole % 1000000) / 1000)) + ' Thousand ' + convertLessThanOneThousand(whole % 1000);

    return `${words} Only`.trim(); // Simplified for prototype
};

const ChequeManager: React.FC = () => {
    const { companyConfig, notify } = useData();
    const { cheques, addCheque, updateCheque, deleteCheque } = useFinance();
    const currency = companyConfig.currencySymbol;

    const [activeTab, setActiveTab] = useState<'Issued' | 'Received' | 'Print' | 'Settings'>('Issued');
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Edit/Create State
    const [editingCheque, setEditingCheque] = useState<Partial<Cheque>>({});

    const handlePrint = () => {
        window.print();
    };

    // Printing State
    const [printConfig, setPrintConfig] = useState({
        width: 200, height: 90, // mm
        datePos: { x: 160, y: 10 },
        payeePos: { x: 20, y: 25 },
        amountWordsPos: { x: 20, y: 40 },
        amountFigPos: { x: 160, y: 38 }
    });

    const [selectedChequeId, setSelectedChequeId] = useState<string | null>(null);

    const filteredCheques = cheques.filter(c => 
        c.type === activeTab && 
        (c.payeeName.toLowerCase().includes(searchTerm.toLowerCase()) || c.chequeNumber.includes(searchTerm))
    );

    const handleSave = () => {
        if (!editingCheque.payeeName || !editingCheque.amount) return;
        
        const chequeData: Cheque = {
            id: editingCheque.id || '', // Will be generated if empty
            type: (activeTab === 'Issued' || activeTab === 'Received') ? activeTab : 'Issued',
            chequeNumber: editingCheque.chequeNumber || '',
            date: editingCheque.date || new Date().toISOString().split('T')[0],
            payeeName: editingCheque.payeeName,
            amount: Number(editingCheque.amount),
            bankName: editingCheque.bankName || '',
            status: editingCheque.status || 'Pending',
            notes: editingCheque.notes,
            printConfig
        };

        if (chequeData.id) updateCheque(chequeData);
        else addCheque(chequeData);
        
        setIsModalOpen(false);
        setEditingCheque({});
    };

    const handleStatusChange = (c: Cheque, status: Cheque['status']) => {
        updateCheque({ ...c, status });
        notify(`Cheque marked as ${status}`, 'success');
    };

    const openPrintPreview = (c: Cheque) => {
        setEditingCheque(c);
        setSelectedChequeId(c.id);
        setActiveTab('Print');
    };

    return (
        <div className="p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col">
            
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <CreditCard className="text-blue-600"/> Cheque Manager
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">Track, Manage & Print Cheques</p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                    {['Issued', 'Received', 'Print'].map(tab => (
                        <button 
                            key={tab} 
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${activeTab === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
                
                {/* List Views */}
                {(activeTab === 'Issued' || activeTab === 'Received') && (
                    <div className="flex flex-col h-full">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div className="relative w-72">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
                                <input 
                                    type="text" 
                                    className="w-full pl-9 p-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder={`Search ${activeTab} cheques...`}
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <button onClick={() => { setEditingCheque({ type: activeTab }); setIsModalOpen(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-blue-700">
                                <Plus size={14}/> Add Cheque
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-white text-slate-500 border-b border-slate-100 sticky top-0 font-bold text-xs uppercase tracking-wider">
                                    <tr>
                                        <th className="p-4">Date</th>
                                        <th className="p-4">Cheque No.</th>
                                        <th className="p-4">{activeTab === 'Issued' ? 'Payee' : 'Payer'}</th>
                                        <th className="p-4">Bank</th>
                                        <th className="p-4 text-right">Amount</th>
                                        <th className="p-4 text-center">Status</th>
                                        <th className="p-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredCheques.map(c => (
                                        <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4 text-slate-500">{c.date}</td>
                                            <td className="p-4 font-mono text-slate-700">{c.chequeNumber}</td>
                                            <td className="p-4 font-bold text-slate-900">{c.payeeName}</td>
                                            <td className="p-4 text-slate-600">{c.bankName}</td>
                                            <td className="p-4 text-right font-mono font-bold text-slate-800">{currency}{c.amount.toLocaleString()}</td>
                                            <td className="p-4 text-center">
                                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${
                                                    c.status === 'Cleared' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                    c.status === 'Bounced' ? 'bg-red-50 text-red-700 border-red-200' :
                                                    'bg-amber-50 text-amber-700 border-amber-200'
                                                }`}>{c.status}</span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    {c.type === 'Issued' && (
                                                        <button onClick={() => openPrintPreview(c)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded bg-slate-100" title="Print"><Printer size={14}/></button>
                                                    )}
                                                    <button onClick={() => { setEditingCheque(c); setIsModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-slate-700 rounded bg-slate-100"><Edit2 size={14}/></button>
                                                    {c.status === 'Pending' && (
                                                        <button onClick={() => handleStatusChange(c, 'Cleared')} className="p-1.5 text-slate-400 hover:text-emerald-600 rounded bg-slate-100" title="Mark Cleared"><CheckCircle size={14}/></button>
                                                    )}
                                                    <button onClick={() => { if(confirm("Delete Cheque?")) deleteCheque(c.id); }} className="p-1.5 text-slate-400 hover:text-red-600 rounded bg-slate-100"><Trash2 size={14}/></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Print & Config Tab */}
                {activeTab === 'Print' && (
                    <div className="flex h-full">
                        <div className="w-80 border-r border-slate-200 bg-slate-50 p-6 overflow-y-auto">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Settings size={18}/> Configuration (mm)</h3>
                            
                            <div className="space-y-4 text-sm">
                                <div className="bg-white p-4 rounded-xl border border-slate-200">
                                    <h4 className="font-bold text-xs text-slate-500 uppercase mb-3">Cheque Dimensions</h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[10px] text-slate-400">Width</label>
                                            <input type="number" className="w-full p-1 border rounded" value={printConfig.width} onChange={e => setPrintConfig({...printConfig, width: Number(e.target.value)})}/>
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-400">Height</label>
                                            <input type="number" className="w-full p-1 border rounded" value={printConfig.height} onChange={e => setPrintConfig({...printConfig, height: Number(e.target.value)})}/>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                                    <h4 className="font-bold text-xs text-slate-500 uppercase">Field Positions (X, Y)</h4>
                                    
                                    {[
                                        { label: 'Date', key: 'datePos' },
                                        { label: 'Payee Name', key: 'payeePos' },
                                        { label: 'Amount (Words)', key: 'amountWordsPos' },
                                        { label: 'Amount (Fig)', key: 'amountFigPos' },
                                    ].map(field => (
                                        <div key={field.key}>
                                            <label className="text-xs font-bold text-slate-700">{field.label}</label>
                                            <div className="grid grid-cols-2 gap-2 mt-1">
                                                <input type="number" className="p-1 border rounded text-xs" value={(printConfig as any)[field.key].x} onChange={e => setPrintConfig({...printConfig, [field.key]: { ...(printConfig as any)[field.key], x: Number(e.target.value) }})}/>
                                                <input type="number" className="p-1 border rounded text-xs" value={(printConfig as any)[field.key].y} onChange={e => setPrintConfig({...printConfig, [field.key]: { ...(printConfig as any)[field.key], y: Number(e.target.value) }})}/>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <button 
                                        onClick={handlePrint} 
                                        className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 flex items-center justify-center gap-2"
                                    >
                                        <Printer size={16}/> Print Cheque
                                    </button>
                                </div>
                             </div>
                         </div>
 
                         <div className="flex-1 p-8 bg-slate-200 overflow-auto flex items-center justify-center">
                             {/* Canvas Simulation */}
                             <div 
                                 id="cheque-canvas"
                                 className="bg-white shadow-xl relative print-force-white"
                                style={{
                                    width: `${printConfig.width}mm`,
                                    height: `${printConfig.height}mm`,
                                    backgroundImage: 'repeating-linear-gradient(45deg, #f0f0f0 25%, transparent 25%, transparent 75%, #f0f0f0 75%, #f0f0f0), repeating-linear-gradient(45deg, #f0f0f0 25%, #ffffff 25%, #ffffff 75%, #f0f0f0 75%, #f0f0f0)',
                                    backgroundPosition: '0 0, 10px 10px',
                                    backgroundSize: '20px 20px'
                                }}
                            >
                                {/* Placeholder Elements */}
                                <div className="absolute text-sm font-mono" style={{ left: `${printConfig.datePos.x}mm`, top: `${printConfig.datePos.y}mm` }}>
                                    {editingCheque.date || 'DD/MM/YYYY'}
                                </div>
                                <div className="absolute text-sm font-bold font-serif" style={{ left: `${printConfig.payeePos.x}mm`, top: `${printConfig.payeePos.y}mm` }}>
                                    {editingCheque.payeeName || 'Payee Name'}
                                </div>
                                <div className="absolute text-sm font-serif italic w-[120mm]" style={{ left: `${printConfig.amountWordsPos.x}mm`, top: `${printConfig.amountWordsPos.y}mm` }}>
                                    {editingCheque.amount ? numberToWords(editingCheque.amount) : 'Amount in Words'}
                                </div>
                                <div className="absolute text-lg font-bold font-mono" style={{ left: `${printConfig.amountFigPos.x}mm`, top: `${printConfig.amountFigPos.y}mm` }}>
                                    {editingCheque.amount ? `**${editingCheque.amount.toLocaleString()}**` : '0.00'}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-fadeIn">
                        <h2 className="text-lg font-bold mb-4">{editingCheque.id ? 'Edit Cheque' : 'Add Cheque'}</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cheque Number</label>
                                <input className="w-full p-2 border rounded" value={editingCheque.chequeNumber || ''} onChange={e => setEditingCheque({...editingCheque, chequeNumber: e.target.value})}/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Payee Name</label>
                                <input className="w-full p-2 border rounded" value={editingCheque.payeeName || ''} onChange={e => setEditingCheque({...editingCheque, payeeName: e.target.value})}/>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bank Name</label>
                                <input className="w-full p-2 border rounded" value={editingCheque.bankName || ''} onChange={e => setEditingCheque({...editingCheque, bankName: e.target.value})}/>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
                                    <input type="date" className="w-full p-2 border rounded" value={editingCheque.date || ''} onChange={e => setEditingCheque({...editingCheque, date: e.target.value})}/>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Amount</label>
                                    <input type="number" className="w-full p-2 border rounded" value={editingCheque.amount || ''} onChange={e => setEditingCheque({...editingCheque, amount: parseFloat(e.target.value)})}/>
                                </div>
                            </div>
                            <div className="flex gap-2 mt-4">
                                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-2 border rounded text-sm font-bold">Cancel</button>
                                <button onClick={handleSave} className="flex-1 py-2 bg-blue-600 text-white rounded text-sm font-bold">Save</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChequeManager;
