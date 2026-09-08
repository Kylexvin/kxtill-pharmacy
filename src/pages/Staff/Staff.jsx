// src/pages/Staff/Staff.jsx
import React, { useState } from 'react';

const Staff = () => {
  const [staff, setStaff] = useState([
    { id: 1, name: 'Alice Manager', email: 'alice@company.com', role: 'Manager', branch: 'Main Store', status: 'Active', joined: '2023-01-15' },
    { id: 2, name: 'Bob Cashier', email: 'bob@company.com', role: 'Cashier', branch: 'Branch A', status: 'Active', joined: '2023-03-20' },
    { id: 3, name: 'Carol Supervisor', email: 'carol@company.com', role: 'Supervisor', branch: 'Branch B', status: 'On Leave', joined: '2023-06-01' },
    { id: 4, name: 'Dave Stock', email: 'dave@company.com', role: 'Stock Manager', branch: 'Main Store', status: 'Active', joined: '2023-08-10' },
  ]);

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>Staff Management</h1>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>Manage staff accounts and assignments</p>
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
          + Add Staff
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
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>Name</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>Email</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>Role</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>Branch</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr key={member.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '12px 16px', fontWeight: 500 }}>{member.name}</td>
                <td style={{ padding: '12px 16px', color: '#4b5563' }}>{member.email}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    background: '#e3f2fd',
                    color: '#1565c0'
                  }}>
                    {member.role}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>{member.branch}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 500,
                    background: member.status === 'Active' ? '#e8f5e9' : '#fff3e0',
                    color: member.status === 'Active' ? '#2e7d32' : '#e65100'
                  }}>
                    {member.status}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#6b7280' }}>{member.joined}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Staff;