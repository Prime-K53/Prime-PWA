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
          <SalesOrderForm onCreate={(o: any) => addSalesOrder(o as any).then(() => fetchSalesData())} />
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
              {salesOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 px-4">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                        <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </div>
                      <p className="text-slate-500 font-medium">No sales orders yet</p>
                      <p className="text-slate-400 text-sm">Create your first sales order using the form above.</p>
                    </div>
                  </td>
                </tr>
              ) : salesOrders.map((o: any) => (
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
