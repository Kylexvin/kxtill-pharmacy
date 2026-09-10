// src/pages/Transfers/components/TransferStatusBadge.jsx
import React from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import styles from './TransferStatusBadge.module.css';

const STATUS_MAP = {
  PENDING:   { label: 'Pending',   variant: 'pending',   icon: Clock },
  APPROVED:  { label: 'Approved',  variant: 'approved',  icon: CheckCircle },
  COMPLETED: { label: 'Completed', variant: 'completed', icon: CheckCircle },
  REJECTED:  { label: 'Rejected',  variant: 'rejected',  icon: XCircle },
  FAILED:    { label: 'Failed',    variant: 'failed',    icon: AlertCircle },
};

const TransferStatusBadge = ({ status, size = 'default' }) => {
  const config = STATUS_MAP[status] || STATUS_MAP.PENDING;
  const Icon = config.icon;
  const sizeClass = size === 'small' ? styles.small : '';

  return (
    <span className={`${styles.badge} ${styles[config.variant]} ${sizeClass}`}>
      <Icon size={size === 'small' ? 9 : 11} />
      {config.label}
    </span>
  );
};

export default TransferStatusBadge;