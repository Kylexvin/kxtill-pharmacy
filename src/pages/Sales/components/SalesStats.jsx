// src/pages/Sales/components/SalesStats.jsx
import React from 'react';
import {
  ShoppingBag,
  DollarSign,
  FileText,
  Users,
  CloudOff,
} from 'lucide-react';
import styles from './SalesStats.module.css';

export default function SalesStats({
  stats,
  isOnline,
  localPendingCount,
  localFailedCount,
  localUnsyncedTotal,
  formatCurrency,
}) {
  const offlineTotalCount = localPendingCount + localFailedCount;
  const showPendingCard = offlineTotalCount > 0;

  const sourceTag = !isOnline
    ? 'offline'
    : stats.source === 'page'
    ? 'filtered'
    : null;

  return (
    <div className={styles.statsGrid}>
      <div className={styles.statCard}>
        <div className={`${styles.statIcon} ${styles.statIconTotal}`}>
          <ShoppingBag size={20} />
        </div>
        <div className={styles.statInfo}>
          <span className={styles.statLabel}>
            Total Sales
            {sourceTag && (
              <span className={styles.statTag}>{sourceTag}</span>
            )}
          </span>
          <span className={styles.statValue}>{stats.totalSales}</span>
        </div>
      </div>

      <div className={styles.statCard}>
        <div className={`${styles.statIcon} ${styles.statIconRevenue}`}>
          <DollarSign size={20} />
        </div>
        <div className={styles.statInfo}>
          <span className={styles.statLabel}>
            Revenue
            {sourceTag && (
              <span className={styles.statTag}>{sourceTag}</span>
            )}
          </span>
          <span className={styles.statValue}>
            {formatCurrency(stats.totalRevenue)}
          </span>
        </div>
      </div>

      <div className={styles.statCard}>
        <div className={`${styles.statIcon} ${styles.statIconAvg}`}>
          <FileText size={20} />
        </div>
        <div className={styles.statInfo}>
          <span className={styles.statLabel}>Avg. Order Value</span>
          <span className={styles.statValue}>
            {formatCurrency(stats.averageOrderValue)}
          </span>
        </div>
      </div>

      <div className={styles.statCard}>
        <div className={`${styles.statIcon} ${styles.statIconCustomers}`}>
          <Users size={20} />
        </div>
        <div className={styles.statInfo}>
          <span className={styles.statLabel}>Unique Customers</span>
          <span className={styles.statValue}>{stats.uniqueCustomers}</span>
        </div>
      </div>

      {showPendingCard && (
        <div className={`${styles.statCard} ${styles.statCardOffline}`}>
          <div className={`${styles.statIcon} ${styles.statIconOffline}`}>
            <CloudOff size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Pending Sync</span>
            <span className={styles.statValue}>
              {offlineTotalCount}
              {localUnsyncedTotal > 0 && (
                <span className={styles.statValueSub}>
                  {' '}· {formatCurrency(localUnsyncedTotal)}
                </span>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}