// Products/kxtill/src/pages/Billing/components/PaymentHistory.jsx
import { Receipt, CheckCircle, Clock, XCircle } from 'lucide-react';
import styles from '../Billing.module.css';

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const fmtMoney = (amount, currency) => {
  if (amount === null || amount === undefined) return '—';
  return `${currency || 'KES'} ${Number(amount).toLocaleString()}`;
};

const statusTone = (status) => {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'PENDING':
      return 'warn';
    case 'FAILED':
    case 'CANCELLED':
      return 'danger';
    default:
      return 'muted';
  }
};

const statusIcon = (status) => {
  switch (status) {
    case 'COMPLETED':
      return CheckCircle;
    case 'PENDING':
      return Clock;
    case 'FAILED':
    case 'CANCELLED':
      return XCircle;
    default:
      return Clock;
  }
};

const PaymentHistory = ({ payments }) => {
  const list = Array.isArray(payments) ? payments : [];

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardIcon}>
          <Receipt size={16} />
        </div>
        <div className={styles.cardHeaderText}>
          <div className={styles.cardLabel}>Payment history</div>
        </div>
        {list.length > 0 && (
          <span className={styles.cardCount}>{list.length}</span>
        )}
      </div>

      {list.length === 0 ? (
        <div className={styles.emptyState}>
          <Receipt size={32} className={styles.emptyIcon} />
          <div className={styles.emptyText}>No payments yet</div>
          <div className={styles.emptyHint}>
            Your past payments will appear here once recorded.
          </div>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th className={styles.thRight}>Amount</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Period</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const tone = statusTone(p.status);
                const StatusIcon = statusIcon(p.status);
                return (
                  <tr key={p.id}>
                    <td className={styles.tdMuted}>
                      {fmtDate(p.paidAt || p.createdAt)}
                    </td>
                    <td className={`${styles.tdRight} ${styles.tdBold}`}>
                      {fmtMoney(p.amount, p.currency)}
                    </td>
                    <td className={styles.tdMuted}>
                      {p.method || '—'}
                    </td>
                    <td className={styles.tdMono}>
                      {p.reference || '—'}
                    </td>
                    <td className={styles.tdMuted}>
                      {p.periodStart && p.periodEnd
                        ? `${fmtDate(p.periodStart)} → ${fmtDate(p.periodEnd)}`
                        : '—'}
                    </td>
                    <td>
                      <span
                        className={`${styles.statusBadge} ${
                          styles[`tone_${tone}`]
                        }`}
                      >
                        <StatusIcon size={11} />
                        <span>{p.status}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PaymentHistory;