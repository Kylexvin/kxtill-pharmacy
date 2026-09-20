// src/pages/Dashboard/components/StatsGrid.jsx
import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Clock,
} from 'lucide-react';
import styles from './StatsGrid.module.css';

function MarginClass(margin) {
  if (margin > 0) return styles.changePositive;
  if (margin < 0) return styles.changeNegative;
  return styles.changeNeutral;
}

export default function StatsGrid({
  loading,
  profitData,
  periodLabel,
  offlineTag,
  formatCompactCurrency,
}) {
  if (loading) {
    return (
      <div className={styles.grid}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`${styles.card} ${styles.skeleton}`}>
            <div className={styles.skeletonIcon} />
            <div className={styles.skeletonText} />
            <div className={styles.skeletonValue} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      <div className={styles.card}>
        <div className={`${styles.icon} ${styles.iconRevenue}`}>
          <DollarSign size={20} />
        </div>
        <div className={styles.info}>
          <span className={styles.label}>
            Revenue
            {offlineTag && <span className={styles.tag}>{offlineTag}</span>}
          </span>
          <span className={styles.value}>
            {formatCompactCurrency(profitData.revenue)}
          </span>
          <span className={styles.subtext}>
            {profitData.salesCount} sales
          </span>
        </div>
      </div>

      <div className={styles.card}>
        <div className={`${styles.icon} ${styles.iconProfit}`}>
          <TrendingUp size={20} />
        </div>
        <div className={styles.info}>
          <span className={styles.label}>
            Profit
            {offlineTag && <span className={styles.tag}>{offlineTag}</span>}
          </span>
          <span className={styles.value}>
            {formatCompactCurrency(profitData.profit)}
          </span>
          <span className={MarginClass(profitData.margin)}>
            {profitData.margin >= 0 ? (
              <TrendingUp size={12} />
            ) : (
              <TrendingDown size={12} />
            )}
            {Math.abs(profitData.margin).toFixed(1)}% margin
          </span>
        </div>
      </div>

      <div className={styles.card}>
        <div className={`${styles.icon} ${styles.iconCost}`}>
          <Package size={20} />
        </div>
        <div className={styles.info}>
          <span className={styles.label}>Cost of Goods</span>
          <span className={styles.value}>
            {formatCompactCurrency(profitData.cost)}
          </span>
        </div>
      </div>

      <div className={styles.card}>
        <div className={`${styles.icon} ${styles.iconPeriod}`}>
          <Clock size={20} />
        </div>
        <div className={styles.info}>
          <span className={styles.label}>Period</span>
          <span className={styles.value} style={{ fontSize: '16px' }}>
            {periodLabel}
          </span>
        </div>
      </div>
    </div>
  );
}