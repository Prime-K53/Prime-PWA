import React from 'react';
import { useSales } from '../../context/SalesContext';

const SalesOrderForm: React.FC<{ initial?: any; onDone?: () => void; onCreate?: (o: any) => Promise<void> }> = ({ initial, onDone, onCreate }) => {
  const { addSalesOrder, updateSalesOrder } = useSales() as any;
  const [order, setOrder] = React.useState(initial || { items: [], subtotal: 0, total: 0, status: 'Draft' });

  const save = async () => {
    if (!order.id) {
      if (onCreate) await onCreate(order); else await addSalesOrder(order);
      alert('Sales order created');
    } else {
      await updateSalesOrder(order);
      alert('Sales order updated');
    }
    if (typeof onDone === 'function') onDone();
  };

  return (
    <div>
      <h2>{order.id ? 'Edit' : 'New'} Sales Order</h2>
      <div>
        <label>Customer ID</label>
        <input value={order.customerId || ''} onChange={e => setOrder({ ...order, customerId: e.target.value })} />
      </div>
      <div>
        <label>Notes</label>
        <textarea value={order.notes || ''} onChange={e => setOrder({ ...order, notes: e.target.value })} />
      </div>
      <div>
        <button onClick={save} className="btn">Save</button>
      </div>
    </div>
  );
};

export default SalesOrderForm;
