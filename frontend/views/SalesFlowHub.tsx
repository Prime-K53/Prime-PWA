
import React from 'react';
import { Coins, FileText, FileCheck, Banknote as PaymentIcon, RefreshCw, MessageSquare, UserPlus, CheckSquare, Award, Target, Printer } from 'lucide-react';
import GenericHub from './GenericHub';
import { useData } from '../context/DataContext';

const SalesFlowHub: React.FC = () => {
  const { setIsPosModalOpen } = useData();
  const options = [
    {
      label: 'Point of Sale',
      description: 'Quick terminal for retail transactions, barcoding, and instant payment processing.',
      onClick: () => setIsPosModalOpen(true),
      icon: <Coins />,
      color: 'bg-emerald-50 text-emerald-500'
    },
    {
      label: 'Quotations',
      description: 'Generate professional estimates and track customer approval status.',
      path: '/sales-flow/quotations',
      icon: <FileText />,
      color: 'bg-blue-50 text-blue-500'
    },
    {
      label: 'Orders',
      description: 'Manage customer orders, track fulfillment status, and handle bulk operations.',
      path: '/sales-flow/orders',
      icon: <CheckSquare />,
      color: 'bg-teal-50 text-teal-500'
    },
    {
      label: 'Billing / Invoices',
      description: 'Official invoicing, credit notes, and payment status tracking.',
      path: '/sales-flow/invoices',
      icon: <FileCheck />,
      color: 'bg-indigo-50 text-indigo-500'
    },
    {
      label: 'Payment Management',
      description: 'Record and track payments received from your customers.',
      path: '/sales-flow/payments',
      icon: <PaymentIcon />,
      color: 'bg-emerald-50 text-emerald-500'
    },
    {
      label: 'Subscriptions',
      description: 'Manage recurring billing, membership tiers, and automated renewals.',
      path: '/sales-flow/subscriptions',
      icon: <RefreshCw />,
      color: 'bg-purple-50 text-purple-500'
    },
    {
      label: 'Sales Exchanges',
      description: 'Manage print replacements, exchange requests, and reprint job tracking.',
      path: '/sales-flow/exchanges',
      icon: <RefreshCw />,
      color: 'bg-orange-50 text-orange-500'
    },
    {
      label: 'Job Tickets',
      description: 'Manage print jobs, photocopy orders, and production tracking.',
      path: '/sales-flow/job-tickets',
      icon: <Printer />,
      color: 'bg-rose-50 text-rose-500'
    },
    {
      label: 'Lead Board',
      description: 'Track leads by stage, follow-up dates, and estimated deal value.',
      path: '/sales-flow/leads',
      icon: <Target />,
      color: 'bg-cyan-50 text-cyan-600'
    }
    ,
    {
      label: 'Commissions',
      description: 'Track and approve sales commissions for your sales team.',
      path: '/revenue/sales-audit',
      icon: <Award />,
      color: 'bg-amber-50 text-amber-600'
    }
  ];

  return (
    <GenericHub 
      title="Sales Flow" 
      subtitle="Optimize your revenue generation, customer billing, and retail operations."
      options={options}
      accentColor="#10b981"
    />
  );
};

export default SalesFlowHub;
