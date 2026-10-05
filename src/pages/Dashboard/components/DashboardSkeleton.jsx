// src/pages/Dashboard/components/DashboardSkeleton.jsx
import React from 'react';
import styles from '../Dashboard.module.css';

const Sk = ({ w, h = 12, r = 6, style }) => (
  <span
    className={styles.skeleton}
    style={{ width: w, height: h, borderRadius: r, ...style }}
  />
);

const DashboardSkeleton = () => {
  return (
    <div className={styles.dashboard}>
      {/* Quick actions row */}
      <div className={styles.quickActions}>
        {[0, 1, 2, 3].map((i) => (
          <Sk key={i} w={140} h={40} r={10} />
        ))}
      </div>

      {/* Header card */}
      <div className={styles.headerCard}>
        <div className={styles.headerLeft}>
          <Sk w={200} h={18} />
        </div>
        <div className={styles.headerRight}>
          <Sk w={180} h={32} r={8} />
          <Sk w={90} h={32} r={8} />
        </div>
      </div>

      {/* Stats grid */}
      <div className={styles.skeletonStatsGrid}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.skeletonStatCard}>
            <Sk w={32} h={32} r={8} />
            <Sk w="60%" h={22} style={{ marginTop: 12 }} />
            <Sk w="40%" h={10} style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className={styles.skeletonChartCard}>
        <Sk w={140} h={14} />
        <Sk w="100%" h={180} r={8} style={{ marginTop: 20 }} />
      </div>

      {/* Counters */}
      <div className={styles.skeletonCountersGrid}>
        {[0, 1, 2].map((i) => (
          <Sk key={i} w="100%" h={80} r={12} />
        ))}
      </div>
    </div>
  );
};

export default DashboardSkeleton;