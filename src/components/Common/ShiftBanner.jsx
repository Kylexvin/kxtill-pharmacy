// src/components/Common/ShiftBanner.jsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Clock } from 'lucide-react';
import { useShift } from '../../contexts/ShiftContext';
import styles from './ShiftBanner.module.css';

const SHIFT_REQUIRED_ROUTES = ['/pos', '/sales', '/refunds'];

const ShiftBanner = () => {
  const { shiftsEnabled, hasOpenShift, loading } = useShift();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) return null;
  if (!shiftsEnabled) return null;
  if (hasOpenShift) return null;

  const path = location.pathname;
  const isRelevantRoute = SHIFT_REQUIRED_ROUTES.some(
    (r) => path === r || path.startsWith(`${r}/`)
  );
  if (!isRelevantRoute) return null;

  return (
    <div className={styles.banner}>
      <div className={styles.icon}>
        <AlertCircle size={16} />
      </div>
      <div className={styles.text}>
        <strong>No shift open.</strong> Sales are blocked until you open a
        shift for this branch.
      </div>
      <button
        type="button"
        className={styles.action}
        onClick={() => navigate('/shifts')}
      >
        <Clock size={14} />
        Open Shift
      </button>
    </div>
  );
};

export default ShiftBanner;