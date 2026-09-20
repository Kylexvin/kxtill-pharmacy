// src/pages/Sales/components/PendingBanner.jsx
import React from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import styles from './PendingBanner.module.css';

export default function PendingBanner({
  pendingCount = 0,
  failedCount = 0,
  total = 0,
  isOnline,
  isRefreshing,
  onSync,
  formatCurrency,
}) {
  const count = pendingCount + failedCount;
  if (count === 0) return null;

  return (
    <div className={styles.banner}>
      <CloudOff size={16} className={styles.icon} />

      <span className={styles.text}>
        <strong>{count}</strong> sale{count === 1 ? '' : 's'} totalling{' '}
        <strong>{formatCurrency(total)}</strong> not yet synced to server
        {failedCount > 0 && (
          <span className={styles.failedNote}>
            {' '}· {failedCount} failed
          </span>
        )}
      </span>

      {isOnline && (
        <button
          type="button"
          className={styles.syncBtn}
          onClick={onSync}
          disabled={isRefreshing}
        >
          <RefreshCw
            size={13}
            className={isRefreshing ? styles.spinning : ''}
          />
          {isRefreshing ? 'Syncing…' : 'Sync now'}
        </button>
      )}
    </div>
  );
}