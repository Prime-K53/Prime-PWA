import React, { useEffect, useMemo } from 'react';
import { useVatStore } from '../../stores/vatStore';
import { useData } from '../../context/DataContext';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
    TrendingUp, TrendingDown, DollarSign, Activity,
    ArrowUpRight, ArrowDownRight, FileText
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';

export const VatDashboard: React.FC = () => {
    const { transactions, returns, fetchVatData, isLoading } = useVatStore();
    const { companyConfig } = useData();
    const currency = companyConfig?.currencySymbol || 'MK';

    useEffect(() => {
        fetchVatData();
    }, []);

    const stats = useMemo(() => {
        const currentMonth = new Date();
        const start = startOfMonth(currentMonth).toISOString();
        const end = endOfMonth(currentMonth).toISOString();

        const currentTx = transactions.filter(t => t.date >= start && t.date <= end);

        const inputTax = currentTx
            .filter(t => t.type === 'Input')
            .reduce((sum, t) => sum + t.amount, 0);

        const outputTax = currentTx
            .filter(t => t.type === 'Output')
            .reduce((sum, t) => sum + t.amount, 0);

        const net = outputTax - inputTax;

        return {
            inputTax,
            outputTax,
            net,
            count: currentTx.length
        };
    }, [transactions]);

    const chartData = useMemo(() => {
        const end = new Date();
        const start = subMonths(end, 6);
        const months = eachMonthOfInterval({ start, end });

        return months.map(date => {
            const monthStart = startOfMonth(date).toISOString();
            const monthEnd = endOfMonth(date).toISOString();

            const monthTx = transactions.filter(t =>
                t.date >= monthStart && t.date <= monthEnd
            );

            const input = monthTx
                .filter(t => t.type === 'Input')
                .reduce((sum, t) => sum + t.amount, 0);

            const output = monthTx
                .filter(t => t.type === 'Output')
                .reduce((sum, t) => sum + t.amount, 0);

            return {
                name: format(date, 'MMM'),
                Input: input,
                Output: output,
                Net: output - input
            };
        });
    }, [transactions]);

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 tablet-auto-fit-250 gap-6">
                <div className="bg-white p-[24px] rounded-[1.5rem] border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-[12px] font-bold text-slate-500 tracking-wide">Output tax (sales)</p>
                            <h3 className="text-2xl font-bold mt-1 text-slate-800">
                                {currency} {stats.outputTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </h3>
                            <span className="text-xs text-emerald-600 flex items-center mt-2">
                                <TrendingUp size={14} className="mr-1" />
                                Current month
                            </span>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-xl">
                            <ArrowUpRight className="text-emerald-600" size={24} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-[24px] rounded-[1.5rem] border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-[12px] font-bold text-slate-500 tracking-wide">Input tax (purchases)</p>
                            <h3 className="text-2xl font-bold mt-1 text-slate-800">
                                {currency} {stats.inputTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </h3>
                            <span className="text-xs text-rose-600 flex items-center mt-2">
                                <TrendingDown size={14} className="mr-1" />
                                Current month
                            </span>
                        </div>
                        <div className="p-3 bg-rose-50 rounded-xl">
                            <ArrowDownRight className="text-rose-600" size={24} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-[24px] rounded-[1.5rem] border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-[12px] font-bold text-slate-500 tracking-wide">Net payable</p>
                            <h3 className={`text-2xl font-bold mt-1 ${stats.net >= 0 ? 'text-slate-800' : 'text-emerald-600'}`}>
                                {currency} {Math.abs(stats.net).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </h3>
                            <span className="text-xs text-slate-500 flex items-center mt-2">
                                {stats.net >= 0 ? 'To pay' : 'Refundable'}
                            </span>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-xl">
                            <DollarSign className="text-blue-600" size={24} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts & Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 tablet-auto-fit-280 tablet-auto-fit-reset gap-6">
                <div className="lg:col-span-2 bg-white p-[24px] rounded-[1.5rem] border border-slate-200 shadow-sm">
                    <h3 className="font-semibold text-slate-800 tracking-tighter text-[16px] mb-4 flex items-center">
                        <Activity className="mr-2 text-slate-500" size={20} />
                        VAT liability trend (6 months)
                    </h3>
                    <div style={{ width: '100%', height: 320, minHeight: 150 }}>
                        {/* console.log("Chart container mounted", chartData) */}
                        <ResponsiveContainer width="100%" height="100%" minHeight={150} minWidth={0}>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip
                                    formatter={(value: number) => [`${currency} ${value.toLocaleString()}`, '']}
                                />
                                <Legend />
                                <Bar dataKey="Output" fill="#10B981" name="Output tax" />
                                <Bar dataKey="Input" fill="#EF4444" name="Input tax" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-[24px] rounded-[1.5rem] border border-slate-200 shadow-sm">
                    <h3 className="font-semibold text-slate-800 tracking-tighter text-[16px] mb-4 flex items-center">
                        <FileText className="mr-2 text-slate-500" size={20} />
                        Recent returns
                    </h3>
                    <div className="space-y-4">
                        {returns.length === 0 ? (
                            <div className="text-center py-8 text-slate-400">
                                No returns generated yet
                            </div>
                        ) : (
                            returns.slice(0, 5).map(ret => (
                                <div key={ret.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:bg-slate-50">
                                    <div>
                                        <p className="font-medium text-slate-800">
                                            {format(parseISO(ret.periodStart), 'MMM yyyy')}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {ret.status} - {format(parseISO(ret.periodEnd), 'dd MMM')}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-sm">
                                            {currency} {ret.netPayable.toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
