
import React from 'react';
import { Box, Package, Truck, TrendingUp } from 'lucide-react';
import GenericHub from './GenericHub';

const SupplyChainHub: React.FC = () => {
  const options = [
    {
      label: 'Master Inventory',
      description: 'Manage stock levels, categories, and warehouse locations across all branches.',
      path: '/supply-chain/inventory',
      icon: <Box />,
      color: 'bg-emerald-50 text-emerald-500'
    },
    {
      label: 'Goods Inbound',
      description: 'Process incoming shipments, verify purchase orders, and update stock records.',
      path: '/supply-chain/grn',
      icon: <Package />,
      color: 'bg-blue-50 text-blue-500'
    },
    {
      label: 'Shipping Manager',
      description: 'Coordinate outgoing deliveries, track shipments, and manage logistics partners.',
      path: '/supply-chain/shipping',
      icon: <Truck />,
      color: 'bg-purple-50 text-purple-500'
    },
    {
      label: 'Demand Forecast',
      description: 'Analyze historical data to predict future stock needs and optimize procurement.',
      path: '/supply-chain/forecasting',
      icon: <TrendingUp />,
      color: 'bg-amber-50 text-amber-500'
    }
  ];

  return (
    <GenericHub 
      title="Supply Chain" 
      subtitle="Select a node to manage your logistics, inventory, and fulfillment operations in real-time."
      options={options}
      accentColor="#2eb12e"
    />
  );
};

export default SupplyChainHub;
