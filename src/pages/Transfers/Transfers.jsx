// src/pages/Transfers/Transfers.jsx
import React, { useState } from 'react';

const Transfers = () => {
  const [transfers, setTransfers] = useState([
    { id: 1, from: 'Main Store', to: 'Branch A', item: 'Product X', quantity: 50, status: 'Completed', date: '2024-01-15' },
    { id: 2, from: 'Branch A', to: 'Main Store', item: 'Product Y', quantity: 20, status: 'Pending', date: '2024-01-16' },
    { id: 3, from: 'Main Store', to: 'Branch B', item: 'Product Z', quantity: 30, status: 'In Transit', date: '2024-01-17' },
  ]);

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>Stock Transfers</h1>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>Manage stock transfers between branches</p>
        </div>
        <button style={{
          padding: '10px 20px',
          background: '#3b82f6',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 500,
          cursor: 'pointer'
        }}>
          + New Transfer
        </button>
      </div>

      <div style={{
        background: '#fff',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>ID</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>From</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>To</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>Item</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>Quantity</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((transfer) => (
              <tr key={transfer.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '12px 16px', fontWeight: 500 }}>#{transfer.id}</td>
                <td style={{ padding: '12px 16px' }}>{transfer.from}</td>
                <td style={{ padding: '12px 16px' }}>{transfer.to}</td>
                <td style={{ padding: '12px 16px' }}>{transfer.item}</td>
                <td style={{ padding: '12px 16px' }}>{transfer.quantity}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 500,
                    background: transfer.status === 'Completed' ? '#e8f5e9' : 
                               transfer.status === 'Pending' ? '#fff3e0' : '#e3f2fd',
                    color: transfer.status === 'Completed' ? '#2e7d32' : 
                           transfer.status === 'Pending' ? '#e65100' : '#1565c0'
                  }}>
                    {transfer.status}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#6b7280' }}>{transfer.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Transfers;