// src/pages/CustomerGroups/CustomerGroups.jsx
import React, { useState } from 'react';

const CustomerGroups = () => {
  const [groups, setGroups] = useState([
    { id: 1, name: 'VIP Customers', count: 45, discount: '15%', created: '2024-01-01' },
    { id: 2, name: 'Wholesale', count: 23, discount: '20%', created: '2024-01-05' },
    { id: 3, name: 'Retail', count: 156, discount: '5%', created: '2024-01-10' },
    { id: 4, name: 'Inactive', count: 12, discount: '0%', created: '2024-01-15' },
  ]);

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>Customer Groups</h1>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>Manage customer group classifications and discounts</p>
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
          + New Group
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: '16px'
      }}>
        {groups.map((group) => (
          <div key={group.id} style={{
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            padding: '20px',
            transition: 'all 0.2s'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{group.name}</h3>
              <span style={{
                fontSize: '20px',
                fontWeight: 700,
                color: '#3b82f6'
              }}>
                {group.discount}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#6b7280' }}>
              <span>👥 {group.count} customers</span>
              <span>📅 {group.created}</span>
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              <button style={{
                padding: '6px 12px',
                background: '#f3f4f6',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer'
              }}>
                Edit
              </button>
              <button style={{
                padding: '6px 12px',
                background: '#fce4ec',
                color: '#c62828',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer'
              }}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CustomerGroups;