import React from 'react';
import { useSales } from '../../context/SalesContext';

const SalesOrderList: React.FC = () => {
  const { salesOrders, deleteSalesOrder } = useSales() as any;

  return (
    <div>
      <h2>Sales Orders</h2>
      <table className="min-w-full table-auto">
        <thead>
          <tr>
            <th>ID</th>
            <th>Customer</th>
            <th>Date</th>
            <th>Status</th>
            <th>Total</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(salesOrders || []).map((o: any) => (
            <tr key={o.id}>
              <td>{o.id}</td>
              <td>{o.customerId || '-'}</td>
              <td>{o.orderDate?.split('T')[0] || '-'}</td>
              <td>{o.status}</td>
              <td>{o.total}</td>
              <td>
                <button className="btn" onClick={() => alert('Open order ' + o.id)}>Open</button>
                <button className="btn ml-2" onClick={() => deleteSalesOrder(o.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default SalesOrderList;
