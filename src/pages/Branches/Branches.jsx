// src/pages/Branches/Branches.jsx
import React, { useState } from 'react';

const Branches = () => {
  const [branches, setBranches] = useState([
    { 
      id: 1, 
      name: 'Main Store', 
      code: 'MS001',
      address: '123 Main St, City, State 12345',
      phone: '+1 234 567 8900',
      manager: 'Alice Manager',
      status: 'Active',
      staff: 15,
      inventory: 1250
    },
    { 
      id: 2, 
      name: 'Branch A - Downtown', 
      code: 'BR001',
      address: '456 Oak Ave, City, State 12345',
      phone: '+1 234 567 8901',
      manager: 'Bob Supervisor',
      status: 'Active',
      staff: 8,
      inventory: 850
    },
    { 
      id: 3, 
      name: 'Branch B - Mall', 
      code: 'BR002',
      address: '789 Mall Rd, City, State 12345',
      phone: '+1 234 567 8902',
      manager: 'Carol Manager',
      status: 'Inactive',
      staff: 0,
      inventory: 0
    },
  ]);

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>Branches</h1>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>Manage business locations and branches</p>
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
          + Add Branch
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
        gap: '16px'
      }}>
        {branches.map((branch) => (
          <div key={branch.id} style={{
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            padding: '20px',
            transition: 'all 0.2s'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{branch.name}</h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#6b7280' }}>Code: {branch.code}</p>
              </div>
              <span style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 500,
                background: branch.status === 'Active' ? '#e8f5e9' : '#f5f5f5',
                color: branch.status === 'Active' ? '#2e7d32' : '#757575'
              }}>
                {branch.status}
              </span>
            </div>

            <div style={{ marginBottom: '12px', fontSize: '14px', color: '#4b5563' }}>
              <p style={{ margin: '4px 0' }}>📍 {branch.address}</p>
              <p style={{ margin: '4px 0' }}>📞 {branch.phone}</p>
              <p style={{ margin: '4px 0' }}>👤 Manager: {branch.manager}</p>
            </div>

            <div style={{
              display: 'flex',
              gap: '16px',
              paddingTop: '12px',
              borderTop: '1px solid #f3f4f6'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 600, color: '#3b82f6' }}>{branch.staff}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>Staff</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 600, color: '#2e7d32' }}>{branch.inventory}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>Inventory Items</div>
              </div>
            </div>

            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              <button style={{
                padding: '6px 16px',
                background: '#f3f4f6',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer'
              }}>
                Edit
              </button>
              <button style={{
                padding: '6px 16px',
                background: '#e3f2fd',
                color: '#1565c0',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer'
              }}>
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Branches;