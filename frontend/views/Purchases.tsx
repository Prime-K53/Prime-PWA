
import React, { useState } from 'react';
import { Truck } from 'lucide-react';
import { useData, REFRESH_INTERVAL } from '../context/DataContext';
import { useModuleRefresh } from '../hooks/useModuleRefresh';
import { useFinance } from '../context/FinanceContext';
import { Purchase, SupplierPayment } from '../types';
import { PurchaseBuilder } from './purchases/components/PurchaseBuilder';
import { PurchaseHistory } from './purchases/components/PurchaseHistory';
import PurchaseOrderDetail from './purchases/components/PurchaseOrderDetail';
import { SupplierPaymentModal } from './purchases/components/SupplierPaymentModal';
import { useNavigate, useLocation } from 'react-router-dom';
import { generateNextId } from '../utils/helpers';

const Purchases: React.FC = () => {
  const { suppliers, inventory, addPurchase, purchases, receivePurchase, updatePurchase, addExpense, notify, deleteItem, refreshAllData, companyConfig } = useData();
  const { recordSupplierPayment } = useFinance();

  // 5-minute poll + focus refresh
  useModuleRefresh(refreshAllData, { interval: REFRESH_INTERVAL });
  const [activeTab, setActiveTab] = useState<'New' | 'History'>('New');
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [paymentPurchase, setPaymentPurchase] = useState<Purchase | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
     if (location.state?.action === 'create') {
       setActiveTab('New');
       if (location.state.supplierId) {
         setEditingPurchase({
           id: '',
           supplierId: location.state.supplierId,
           date: new Date().toISOString(),
           dueDate: new Date().toISOString(),
           items: [],
           total: 0,
           status: 'Draft',
           paymentStatus: 'Unpaid'
         } as any);
       }
      // Clear state
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);
  
  const handleCreateOrder = (data: { supplierId: string, items: any[], reference: string, dueDate: string, date: string }) => {
    const purchaseId = generateNextId('PO', purchases, companyConfig);
    addPurchase({
      id: purchaseId,
      date: data.date,
      dueDate: data.dueDate,
      supplierId: data.supplierId,
      items: data.items.map(p => ({ itemId: p.item.id, name: p.item.name, quantity: p.qty, cost: p.cost, receivedQty: 0 })),
      total: data.items.reduce((sum, p) => sum + (p.qty * p.cost), 0),
      status: 'Ordered',
      reference: data.reference,
      paymentStatus: 'Unpaid'
    });
    setActiveTab('History');
  };

  const handleUpdateOrder = (id: string, data: { supplierId: string, items: any[], reference: string, dueDate: string, date: string }) => {
      if (!editingPurchase) return;
      const updatedPurchase: Purchase = {
          ...editingPurchase,
          supplierId: data.supplierId,
          date: data.date,
          dueDate: data.dueDate,
          reference: data.reference,
          items: data.items.map(p => ({ 
              itemId: p.item.id, 
              name: p.item.name, 
              quantity: p.qty, 
              cost: p.cost, 
              receivedQty: 0 
          })),
          total: data.items.reduce((sum, p) => sum + (p.qty * p.cost), 0),
      };
      updatePurchase(updatedPurchase);
      setEditingPurchase(null);
      setActiveTab('History');
      notify(`Bill ${id} updated successfully`, 'success');
  };

  const handleReceive = (id: string) => {
    if(window.confirm("Confirm receipt of goods? This will update inventory stock.")) {
        receivePurchase(id);
        if (selectedPurchase && selectedPurchase.id === id) {
            setSelectedPurchase({...selectedPurchase, status: 'Received'});
        }
    }
  };

  const handleConvert = (id: string) => {
      const purchase = purchases.find(p => p.id === id);
      if (!purchase) return;

      if(window.confirm("Verify this Bill? This will lock the record as a confirmed payable.")) {
          // In a real system, converting might mean posting to GL.
          // Here we just mark it Closed/Verified to separate from draft POs.
          updatePurchase({ ...purchase, status: 'Closed' });
          setSelectedPurchase(null);
          notify("Bill verified and closed for payment", "success");
      }
  };

  const handleEditOrder = (po: Purchase) => {
      setEditingPurchase(po);
      setActiveTab('New');
  };

  const handleMergeOrders = (ids: string[]) => {
      if (ids.length < 2) {
          notify("Select at least 2 orders to merge.", "error");
          return;
      }
      
      const selectedOrders = purchases.filter(p => ids.includes(p.id));
      
      if (selectedOrders.length !== ids.length) {
          notify("Some selected orders could not be found.", "error");
          return;
      }

      // Validation 1: Same Supplier
      const supplierId = selectedOrders[0].supplierId;
      if (selectedOrders.some(p => p.supplierId !== supplierId)) {
          notify("Cannot merge orders from different suppliers.", "error");
          return;
      }

      if (!window.confirm(`Merge ${ids.length} orders into one new Bill? Original orders will be cancelled.`)) {
          return;
      }

      // Combine items
      const combinedItems: any[] = [];
      selectedOrders.forEach(order => {
          order.items.forEach(item => {
              const existing = combinedItems.find(i => i.itemId === item.itemId && i.cost === item.cost);
              if (existing) {
                  existing.quantity += item.quantity;
              } else {
                  // Clone item to avoid reference issues
                  combinedItems.push({ ...item, receivedQty: 0 });
              }
          });
      });

      const totalCost = combinedItems.reduce((sum, i) => sum + (i.quantity * i.cost), 0);
      const newId = generateNextId('PO', purchases, companyConfig);

      // Create New PO
      addPurchase({
          id: newId,
          date: new Date().toISOString(),
          supplierId,
          items: combinedItems,
          total: totalCost,
          status: 'Draft',
          notes: `Merged from orders: ${ids.join(', ')}`,
          paymentStatus: 'Unpaid'
      });

      // Cancel old POs
      selectedOrders.forEach(order => {
          updatePurchase({ ...order, status: 'Cancelled', notes: `${order.notes || ''} [Merged into ${newId}]` });
      });

      notify("Orders merged successfully! New Draft Bill created.", "success");
  };

  const handleBatchDelete = (ids: string[]) => {
      if (window.confirm(`Delete ${ids.length} selected bills? This will mark them as Cancelled.`)) {
          ids.forEach(id => {
              const po = purchases.find(p => p.id === id);
              if (po) {
                  updatePurchase({ ...po, status: 'Cancelled', paymentStatus: 'Cancelled' });
              }
          });
          notify(`${ids.length} bills cancelled successfully.`, "success");
      }
  };

  const handlePaymentRequest = (purchase: Purchase) => {
      setPaymentPurchase(purchase);
  };

  const handleRecordPayment = async (payment: SupplierPayment) => {
      if (!paymentPurchase) return;

      try {
          await recordSupplierPayment(payment);
          
          const updatedPaidAmount = (paymentPurchase.paidAmount || 0) + payment.amount;
          const updatedStatus = updatedPaidAmount >= paymentPurchase.total ? 'Paid' : 'Partial';
          
          const updatedPurchase = {
              ...paymentPurchase,
              paidAmount: updatedPaidAmount,
              paymentStatus: updatedStatus
          };

          updatePurchase(updatedPurchase);
          
          if (selectedPurchase && selectedPurchase.id === paymentPurchase.id) {
              setSelectedPurchase(updatedPurchase);
          }
          
          setPaymentPurchase(null);
          notify(`Payment of $${payment.amount.toLocaleString()} recorded successfully`, "success");
      } catch (err) {
          // Error notified by context
      }
  };

  const handleTabChange = (tab: 'New' | 'History') => {
      if (tab !== 'New') setEditingPurchase(null);
      setActiveTab(tab);
  };

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto flex flex-col h-full relative w-full">
      
      {selectedPurchase && (
          <PurchaseOrderDetail 
              purchase={selectedPurchase}
              suppliers={suppliers}
              onClose={() => setSelectedPurchase(null)}
              onReceive={handleReceive}
              onConvert={handleConvert}
              onPayment={handlePaymentRequest}
          />
      )}

      {paymentPurchase && (
          <SupplierPaymentModal
              purchase={paymentPurchase}
              onClose={() => setPaymentPurchase(null)}
              onRecord={handleRecordPayment}
          />
      )}

      <div className="mb-4 flex justify-between items-center shrink-0">
         <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2 tracking-tight"><Truck className="text-blue-600" size={20}/> Bills & Purchases</h1>
            <p className="text-xs text-slate-500 mt-0.5">Manage vendor bills and purchase orders</p>
         </div>
         <div className="flex bg-white/70 backdrop-blur-md p-1 rounded-2xl border border-white/50 shadow-sm">
            <button 
              onClick={() => handleTabChange('New')} 
              className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all ${activeTab === 'New' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'}`}
            >
               {editingPurchase ? 'Edit Bill' : 'New Bill'}
            </button>
            <button 
              onClick={() => handleTabChange('History')} 
              className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all ${activeTab === 'History' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'}`}
            >
               All Bills
            </button>
         </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeTab === 'New' && (
            <PurchaseBuilder 
                inventory={inventory} 
                suppliers={suppliers} 
                onCreateOrder={handleCreateOrder}
                initialData={editingPurchase}
                onUpdateOrder={handleUpdateOrder}
                onCancel={() => { setEditingPurchase(null); setActiveTab('History'); }}
            />
        )} 
        
        {activeTab === 'History' && (
            <PurchaseHistory 
                purchases={purchases} 
                suppliers={suppliers} 
                onReceive={handleReceive}
                onView={(po) => setSelectedPurchase(po)}
                onEdit={handleEditOrder}
                onMerge={handleMergeOrders}
                onBatchDelete={handleBatchDelete}
                onPayment={handlePaymentRequest}
            />
        )}
      </div>


    </div>
  );
};

export default Purchases;
