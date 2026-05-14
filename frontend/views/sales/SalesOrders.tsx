import React, { useState } from 'react';
import { useSalesStore } from '../../stores/salesStore';
import { useFinanceStore } from '../../stores/financeStore';
import SalesOrderForm from './SalesOrderForm';
import SalesOrderDetail from './SalesOrderDetail';

const SalesOrders: React.FC = () => {
  const { salesOrders, isLoading, fetchSalesData, addSalesOrder, updateSalesOrder } = useSalesStore();
  const { addInvoice } = useFinanceStore();
  const [editing, setEditing] = useState<any | null>(null);

  const handleConvertToInvoice = async (order: any) => {
    const invoice = {
      customerId: order.customerId,
      customerName: order.customerName || '',
      date: new Date().toISOString(),
      dueDate: order.deliveryDate || null,
      lines: (order.items || []).map((it: any) => ({ itemId: it.product_id || it.id, description: it.product_name || it.description || '', quantity: it.quantity, unitPrice: it.unit_price || it.unitPrice || 0, total: it.line_total || (it.quantity * (it.unit_price || it.unitPrice || 0)) })),
      totalAmount: order.total || 0,
      status: 'Unpaid',
      sourceOrderId: order.id
    };

    try {
      await addInvoice(invoice as any);
      alert('Converted to invoice');
    } catch (err: any) {
      alert('Failed to convert: ' + (err?.message || err));
    }
  };

  const changeStatus = async (order: any, status: string) => {
    try {
      await updateSalesOrder({ ...order, status });
      await fetchSalesData();
    } catch (err: any) {
      alert('Failed to update status: ' + (err?.message || err));
    }
  };

  React.useEffect(() => {
    fetchSalesData().catch(() => {});
  }, []);

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Sales Orders</h2>
      <div className="mb-4">
        {!editing ? (
          <SalesOrderForm onCreate={(o: any) => { void addSalesOrder(o as any).then(() => fetchSalesData()); }} />
        ) : (
          <div className="mb-4">
            <SalesOrderForm initial={editing} onDone={() => { setEditing(null); void fetchSalesData(); }} />
          </div>
        )}
      </div>
      <div>
        {isLoading ? <div>Loading...</div> : (
          <table className="w-full table-auto">
            <thead>
              <tr>
                <th>ID</th>
                <th>Customer</th>
                <th>Order Date</th>
                <th>Status</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {salesOrders.map((o: any) => (
                <tr key={o.id}>
                  <td>{o.id}</td>
                  <td>{o.customerId || '-'}</td>
                  <td>{new Date(o.orderDate).toLocaleDateString()}</td>
                  <td>{o.status}</td>
                  <td>{o.total}</td>
                  <td>
                    <button className="mr-2 px-2 py-1 bg-white border rounded" onClick={() => setEditing(o)}>Edit</button>
                    <button className="mr-2 px-2 py-1 bg-white border rounded" onClick={() => handleConvertToInvoice(o)}>Convert</button>
                    <div className="inline-block ml-2">
                      <select value={o.status} onChange={(e) => changeStatus(o, e.target.value)} className="px-2 py-1 border rounded">
                        <option value="Draft">Draft</option>
                        <option value="Confirmed">Confirm</option>
                        <option value="Processing">Processing</option>
                        <option value="Fulfilled">Fulfilled</option>
                        <option value="Cancelled">Cancel</option>
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default SalesOrders;
