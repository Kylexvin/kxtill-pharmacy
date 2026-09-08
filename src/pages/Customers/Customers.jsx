// src/pages/Customers/Customers.jsx
import React, { useState } from 'react';

const Customers = () => {
  const [customers, setCustomers] = useState([
    { id: 1, name: 'John Doe', email: 'john@example.com', phone: '+1 234 567 890', orders: 12, totalSpent: '$1,234.50', status: 'Active' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com', phone: '+1 234 567 891', orders: 8, totalSpent: '$856.00', status: 'Active' },
    { id: 3, name: 'Bob Johnson', email: 'bob@example.com', phone: '+1 234 567 892', orders: 3, totalSpent: '$234.00', status: 'Inactive' },
  ]);

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>Customers</h1>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>Manage customer accounts and information</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button style={{
            padding: '10px 20px',
            background: '#f3f4f6',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer'
          }}>
            Import
          </button>
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
            + Add Customer
          </button>
        </div>
      </div>

      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <input
          type="text"
          placeholder="Search customers..."
          style={{
            flex: 1,
            minWidth: '250px',
            padding: '10px 16px',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px'
          }}
        />
        <select style={{
          padding: '10px 16px',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          fontSize: '14px',
          background: '#fff'
        }}>
          <option>All Customers</option>
          <option>Active</option>
          <option>Inactive</option>
        </select>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: '16px'
      }}>
        {customers.map((customer) => (
          <div key={customer.id} style={{
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            padding: '20px',
            transition: 'box-shadow 0.2s'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{customer.name}</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#6b7280' }}>{customer.email}</p>
              </div>
              <span style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 500,
                background: customer.status === 'Active' ? '#e8f5e9' : '#f5f5f5',
                color: customer.status === 'Active' ? '#2e7d32' : '#757575'
              }}>
                {customer.status}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: '#4b5563' }}>
              <span>📞 {customer.phone}</span>
              <span>🛒 {customer.orders} orders</span>
              <span>💰 {customer.totalSpent}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Customers;