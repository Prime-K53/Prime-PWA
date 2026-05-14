import React from 'react';
import { Sparkles, TrendingUp, Calculator, MessageSquare, Brain } from 'lucide-react';
import GenericHub from './GenericHub';

const SmartOperationsHub: React.FC = () => {
  const options = [
    {
      label: 'AI Assistant',
      description: 'AI-powered chat for business insights, analytics, and smart recommendations.',
      path: '/smart-operations/ai',
      icon: <Brain />,
      color: 'bg-purple-50 text-purple-500'
    },
    {
      label: 'Market Adjustments',
      description: 'Manage global cost layers, inflation adjustments, and logistics surcharges.',
      path: '/smart-operations/adjustments',
      icon: <TrendingUp />,
      color: 'bg-emerald-50 text-emerald-500'
    },
    {
      label: 'Smart Pricing Engine',
      description: 'Calculate item prices with market adjustments and generate revenue reports.',
      path: '/smart-operations/pricing',
      icon: <Calculator />,
      color: 'bg-indigo-50 text-indigo-500'
    },
    {
      label: 'Marketing Messages',
      description: 'WhatsApp automation, bulk campaigns, and customer communications.',
      path: '/smart-operations/messages',
      icon: <MessageSquare />,
      color: 'bg-green-50 text-green-500'
    }
  ];

  return (
    <GenericHub 
      title="Smart Operations" 
      subtitle="Smart Operations"
      options={options}
      accentColor="#6366f1"
    />
  );
};

export default SmartOperationsHub;
