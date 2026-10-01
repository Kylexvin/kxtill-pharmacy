// src/pages/Shifts/tabs/ReviewTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  AlertCircle, RefreshCw, AlertTriangle, Check, Building2, Clock,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useSettings } from '../../../contexts/SettingsContext';
import ShiftModal from '../components/ShiftModal';
import styles from './ReviewTab.module.css';

const ReviewTab = () => {
  const { activeOrganization } = useAuth();
  const { formatDateTime: formatDate } = useSettings();
  const orgId = activeOrganization?.id;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!orgId) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const res = await axios.get(
        `/organizations/${orgId}/kxtill/shifts/pending-review`
      );
      setItems(res.data?.shifts || []);
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to load pending review'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleReview = async () => {
    if (!reviewing || !note.trim()) {
      toast.error('A note is required');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(
        `/organizations/${orgId}/kxtill/shifts/${reviewing.id}/review`,
        { note: note.trim() }
      );
      toast.success('Variance reviewed');
      setReviewing(null);
      setNote('');
      await load(true);
    } catch (err) {
      toast.error(
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to review variance'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!orgId) {
    return (
      <div className={styles.empty}>
        <AlertCircle size={32} />
        <p>No organization selected</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {/* Header row */}
      <div className={styles.headerCard}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <AlertTriangle size={18} />
          </div>
          <div>
            <h2 className={styles.headerTitle}>Pending Review</h2>
            <p className={styles.headerSubtitle}>
              {loading
                ? 'Loading…'
                : `${items.length} shift${items.length === 1 ? '' : 's'} awaiting variance review`}
            </p>
          </div>
        </div>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={() => load(true)}
          disabled={refreshing || loading}
        >
          <RefreshCw size={14} className={refreshing ? styles.spinning : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className={styles.loaderWrapper}>
          <div className={styles.loader} />
        </div>
      ) : error ? (
        <div className={styles.errorState}>
          <AlertCircle size={32} />
          <p>{error}</p>
          <button className={styles.retryBtn} onClick={() => load()}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIconWrap}>
            <Check size={28} />
          </div>
          <h3>All clear</h3>
          <p>No shifts are waiting for variance review.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {items.map((shift) => {
            const variance = Number(shift.variance);
            const variancePositive = variance > 0;
            return (
              <div key={shift.id} className={styles.card}>
                {/* Card header */}
                <div className={styles.cardHeader}>
                  <div className={styles.who}>
                    <div className={styles.avatar}>
                      {(shift.user?.firstName?.[0] || '?').toUpperCase()}
                    </div>
                    <div className={styles.whoText}>
                      <div className={styles.whoName}>
                        {shift.user?.firstName} {shift.user?.lastName}
                      </div>
                      <div className={styles.whoMeta}>
                        {shift.user?.email}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.reviewBtn}
                    onClick={() => {
                      setReviewing(shift);
                      setNote('');
                    }}
                  >
                    <Check size={14} />
                    Review
                  </button>
                </div>

                {/* Meta strip */}
                <div className={styles.metaStrip}>
                  <div className={styles.metaItem}>
                    <Building2 size={12} />
                    <span>{shift.branch?.name || '—'}</span>
                  </div>
                  <div className={styles.metaItem}>
                    <Clock size={12} />
                    <span>
                      Closed{' '}
                      {formatDate
                        ? formatDate(shift.closedAt)
                        : new Date(shift.closedAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Cash row */}
                <div className={styles.cashRow}>
                  <div className={styles.cashCell}>
                    <span className={styles.cashLabel}>Expected cash</span>
                    <span className={styles.cashValue}>
                      {Number(shift.expectedCash).toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.cashCell}>
                    <span className={styles.cashLabel}>Declared cash</span>
                    <span className={styles.cashValue}>
                      {Number(shift.declaredCash).toLocaleString()}
                    </span>
                  </div>
                  <div className={`${styles.cashCell} ${styles.cashCellVariance}`}>
                    <span className={styles.cashLabel}>Variance</span>
                    <span
                      className={`${styles.cashValue} ${
                        variancePositive
                          ? styles.varianceOver
                          : styles.varianceShort
                      }`}
                    >
                      {variancePositive ? '+' : ''}
                      {variance.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ShiftModal
        open={!!reviewing}
        title="Review Variance"
        submitLabel="Approve"
        submitting={submitting}
        disabled={!note.trim()}
        onClose={() => {
          setReviewing(null);
          setNote('');
        }}
        onSubmit={handleReview}
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Note (required)</label>
          <textarea
            className={styles.textarea}
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain the variance..."
            disabled={submitting}
            autoFocus
          />
        </div>
      </ShiftModal>
    </div>
  );
};

export default ReviewTab;