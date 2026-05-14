import React, { useMemo, useState } from 'react';
import { Search, ChevronLeft, ChevronRight, ExternalLink, Target, Calendar, DollarSign } from 'lucide-react';
import { useSales } from '../../context/SalesContext';
import { useData } from '../../context/DataContext';
import { useNavigate } from 'react-router-dom';

const pipelineStages = ['New', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];

const LeadBoard: React.FC = () => {
  const { customers = [], updateCustomer, isLoading } = useSales() as any;
  const { companyConfig, notify } = useData();
  const navigate = useNavigate();
  const currency = companyConfig?.currencySymbol || '$';

  const [searchTerm, setSearchTerm] = useState('');
  const [isUpdating, setIsUpdating] = useState<Record<string, boolean>>({});

  const leads = useMemo(() => {
    return (customers || []).filter((customer: any) => {
      const status = String(customer.status || '').toLowerCase();
      const hasPipeline = Boolean(customer.pipelineStage);
      return hasPipeline || status === 'lead' || status === 'prospect';
    });
  }, [customers]);

  const filteredLeads = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((customer: any) =>
      String(customer.name || '').toLowerCase().includes(q)
      || String(customer.id || '').toLowerCase().includes(q)
      || String(customer.leadSource || '').toLowerCase().includes(q)
    );
  }, [leads, searchTerm]);

  const leadsByStage = useMemo(() => {
    return pipelineStages.reduce((acc: Record<string, any[]>, stage) => {
      acc[stage] = filteredLeads.filter((lead: any) => (lead.pipelineStage || 'New') === stage);
      return acc;
    }, {});
  }, [filteredLeads]);

  const moveStage = async (lead: any, direction: 'prev' | 'next') => {
    const currentStage = lead.pipelineStage || 'New';
    const currentIndex = pipelineStages.indexOf(currentStage);
    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= pipelineStages.length) return;
    const nextStage = pipelineStages[nextIndex];
    setIsUpdating(prev => ({ ...prev, [lead.id]: true }));
    try {
      await updateCustomer({
        ...lead,
        pipelineStage: nextStage,
        status: nextStage === 'Won' ? 'Active' : lead.status
      });
      notify(`Moved ${lead.name} to ${nextStage}`, 'success');
    } catch (error: any) {
      notify(error?.message || 'Failed to update stage', 'error');
    } finally {
      setIsUpdating(prev => ({ ...prev, [lead.id]: false }));
    }
  };

  const totalPipelineValue = filteredLeads.reduce((sum: number, lead: any) => sum + Number(lead.estimatedDealValue || 0), 0);
  const wonCount = leadsByStage.Won?.length || 0;
  const conversionRate = filteredLeads.length > 0 ? Math.round((wonCount / filteredLeads.length) * 100) : 0;

  return (
    <div className="p-4 md:p-6 bg-slate-50/60 min-h-screen space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900 tracking-tight">Lead Board</h1>
          <p className="text-[13px] text-slate-500 font-medium">Track opportunities across your sales pipeline.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12px] w-full md:w-auto">
          <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
            <p className="text-slate-400 font-bold uppercase tracking-wide text-[10px]">Total Leads</p>
            <p className="text-slate-900 font-semibold">{filteredLeads.length}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
            <p className="text-slate-400 font-bold uppercase tracking-wide text-[10px]">Pipeline Value</p>
            <p className="text-slate-900 font-semibold">{currency}{totalPipelineValue.toLocaleString()}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
            <p className="text-slate-400 font-bold uppercase tracking-wide text-[10px]">Win Rate</p>
            <p className="text-slate-900 font-semibold">{conversionRate}%</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search lead by name, id, or source..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-[13px] font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-6 gap-3">
        {pipelineStages.map((stage) => (
          <div key={stage} className="bg-white border border-slate-200 rounded-xl overflow-hidden min-h-[360px]">
            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target size={14} className="text-slate-500" />
                <h3 className="text-[12px] font-bold text-slate-700 uppercase tracking-wide">{stage}</h3>
              </div>
              <span className="text-[11px] font-bold text-slate-500">{leadsByStage[stage]?.length || 0}</span>
            </div>
            <div className="p-2 space-y-2">
              {isLoading && (
                <div className="text-[12px] text-slate-400 italic p-2">Loading...</div>
              )}
              {!isLoading && (leadsByStage[stage]?.length || 0) === 0 && (
                <div className="text-[12px] text-slate-400 italic p-2">No leads</div>
              )}
              {(leadsByStage[stage] || []).map((lead: any) => (
                <div key={lead.id} className="border border-slate-200 rounded-lg p-2 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[12px] font-semibold text-slate-900">{lead.name}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{lead.id}</p>
                    </div>
                    <button
                      onClick={() => navigate('/sales-flow/clients', { state: { customerId: lead.id } })}
                      className="p-1 rounded hover:bg-slate-100 text-slate-500"
                      title="Open client workspace"
                    >
                      <ExternalLink size={14} />
                    </button>
                  </div>
                  <div className="mt-2 space-y-1 text-[11px]">
                    <div className="flex items-center gap-1 text-slate-600">
                      <DollarSign size={12} />
                      <span>{currency}{Number(lead.estimatedDealValue || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-600">
                      <Calendar size={12} />
                      <span>{lead.nextFollowUpDate || 'No follow-up date'}</span>
                    </div>
                    <div className="text-slate-500">Source: {lead.leadSource || 'Unspecified'}</div>
                    <div className="text-slate-500">Score: {Number(lead.leadScore || 0)}</div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    <button
                      onClick={() => moveStage(lead, 'prev')}
                      disabled={stage === 'New' || Boolean(isUpdating[lead.id])}
                      className="flex items-center justify-center gap-1 px-2 py-1 border border-slate-200 rounded text-[11px] font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                    >
                      <ChevronLeft size={12} />
                      Back
                    </button>
                    <button
                      onClick={() => moveStage(lead, 'next')}
                      disabled={stage === 'Won' || stage === 'Lost' || Boolean(isUpdating[lead.id])}
                      className="flex items-center justify-center gap-1 px-2 py-1 bg-blue-600 rounded text-[11px] font-semibold text-white disabled:opacity-40 hover:bg-blue-700"
                    >
                      Next
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LeadBoard;
