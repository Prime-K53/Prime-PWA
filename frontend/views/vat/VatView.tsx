import React, { useState } from 'react';
import { LayoutDashboard, FileText, Settings } from 'lucide-react';
import { VatDashboard } from './VatDashboard';
import { VatReports } from './VatReports';
import { VatSettings } from './VatSettings';

const VatView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'Dashboard' | 'Reports' | 'Settings'>('Dashboard');

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-800">VAT management</h1>
                <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl">
                    <button
                        onClick={() => setActiveTab('Dashboard')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors
                            ${activeTab === 'Dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                        <LayoutDashboard size={16} className="mr-2" />
                        Dashboard
                    </button>
                    <button
                        onClick={() => setActiveTab('Reports')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors
                            ${activeTab === 'Reports' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                        <FileText size={16} className="mr-2" />
                        Returns & reports
                    </button>
                    <button
                        onClick={() => setActiveTab('Settings')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors
                            ${activeTab === 'Settings' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                        <Settings size={16} className="mr-2" />
                        Configuration
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 bg-slate-50">
                {activeTab === 'Dashboard' && <VatDashboard />}
                {activeTab === 'Reports' && <VatReports />}
                {activeTab === 'Settings' && <VatSettings />}
            </div>
        </div>
    );
};

export default VatView;
