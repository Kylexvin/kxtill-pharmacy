// src/pages/Roles/Roles.jsx
import React, { useState } from 'react';

const Roles = () => {
  const [roles, setRoles] = useState([
    { 
      id: 1, 
      name: 'Administrator', 
      users: 3, 
      permissions: ['All Access'],
      created: '2024-01-01' 
    },
    { 
      id: 2, 
      name: 'Manager', 
      users: 5, 
      permissions: ['Sales', 'Inventory', 'Reports', 'Staff'],
      created: '2024-01-05' 
    },
    { 
      id: 3, 
      name: 'Cashier', 
      users: 12, 
      permissions: ['POS', 'Sales', 'Refunds'],
      created: '2024-01-10' 
    },
    { 
      id: 4, 
      name: 'Stock Manager', 
      users: 4, 
      permissions: ['Inventory', 'Transfers', 'Reports'],
      created: '2024-01-15' 
    },
  ]);

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>Roles & Permissions</h1>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>Define and manage role-based access control</p>
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
          + New Role
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '16px'
      }}>
        {roles.map((role) => (
          <div key={role.id} style={{
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            padding: '20px',
            transition: 'all 0.2s'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{role.name}</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#6b7280' }}>
                  👥 {role.users} users
                </p>
              </div>
              <span style={{
                fontSize: '12px',
                color: '#6b7280'
              }}>
                {role.created}
              </span>
            </div>
            
            <div style={{ marginBottom: '12px' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 500, color: '#4b5563' }}>
                Permissions:
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {role.permissions.map((perm, idx) => (
                  <span key={idx} style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    background: '#e8f5e9',
                    color: '#2e7d32'
                  }}>
                    {perm}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #f3f4f6', paddingTop: '12px' }}>
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
                View Users
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Roles;