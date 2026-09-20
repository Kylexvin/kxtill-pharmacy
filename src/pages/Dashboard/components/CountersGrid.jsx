// src/pages/Dashboard/components/CountersGrid.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Receipt,
  Users,
  ChevronRight,
} from 'lucide-react';
import styles from './CountersGrid.module.css';

export default function CountersGrid({
  lowStockCount,
  recentSalesCount,
  customersCount,   // optional; pass null to show "—"
}) {
  const navigate = useNavigate();

  return (
    <div className={styles.grid}>
      <button
        type="button"
        className={styles.card}
        onClick={() => navigate('/inventory')}
      >
        <div className={`${styles.icon} ${styles.iconWarning}`}>
          <AlertTriangle size={20} />
        </div>
        <div className={styles.info}>
          <span className={styles.value}>{lowStockCount}</span>
          <span className={styles.label}>Low Stock Items</span>
        </div>
        <ChevronRight size={16} className={styles.arrow} />
      </button>

      <button
        type="button"
        className={styles.card}
        onClick={() => navigate('/sales')}
      >
        <div className={`${styles.icon} ${styles.iconSuccess}`}>
          <Receipt size={20} />
        </div>
        <div className={styles.info}>
          <span className={styles.value}>{recentSalesCount}</span>
          <span className={styles.label}>Recent Sales</span>
        </div>
        <ChevronRight size={16} className={styles.arrow} />
      </button>

      <button
        type="button"
        className={styles.card}
        onClick={() => navigate('/customers')}
      >
        <div className={`${styles.icon} ${styles.iconInfo}`}>
          <Users size={20} />
        </div>
        <div className={styles.info}>
          <span className={styles.value}>
            {customersCount ?? '—'}
          </span>
          <span className={styles.label}>Customers</span>
        </div>
        <ChevronRight size={16} className={styles.arrow} />
      </button>
    </div>
  );
}