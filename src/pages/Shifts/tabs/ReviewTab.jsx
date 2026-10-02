// src/pages/Shifts/tabs/ReviewTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  AlertCircle, RefreshCw, AlertTriangle, Check, Building2, Clock,
  Wallet, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useSettings } from '../../../contexts/SettingsContext';
import ShiftModal from '../components/ShiftModal';
import styles from './ReviewTab.module.css';

/* ---------- Helpers ---------- */
const formatCompact = (value, fn) => {
  if (!value) return '—';
  if (fn) return fn(value);
  const d = new Date(value);
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const initials = (user) => {
  const f = user?.firstName?.[0] || '';
  const l = user?.lastName?.[0] || '';
  return (f + l).toUpperCase() || '?';
};

const varianceTone = (v) => {
  const n = Number(v);
  if (n > 0) return 'over';
  if (n < 0) return 'short';
  return 'even';
};

/* ---------- Skeleton ---------- */
const SkeletonLine = ({ width = '100%', height = 14, radius = 6 }) => (
  <span
    className={styles.skeleton}
    style={{ width, height, borderRadius: radius, display: 'block' }}
  />
);

const ReviewSkeleton = () => (
  <div className={styles.list}>
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.who}>
            <SkeletonLine width="40px" height="40px" radius="50%" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <SkeletonLine width="140px" height={13} />
              <SkeletonLine width="200px" height={10} />
            </div>
          </div>
          <SkeletonLine width="90px" height={34} radius={8} />
        </div>
        <div className={styles.metaStrip}>
          <SkeletonLine width="120px" height={12} />
          <SkeletonLine width="160px" height={12} />
        </div>
        <div className={styles.cashRow}>
          <div className={styles.cashCell}>
            <SkeletonLine width="80px" height={9} />
            <SkeletonLine width="70px" height={18} />
          </div>
          <div className={styles.cashCell}>
            <SkeletonLine width="80px" height={9} />
            <SkeletonLine width="70px" height={18} />
          </div>
          <div className={`${styles.cashCell} ${styles.cashCellVariance}`}>
            <SkeletonLine width="80px" height={9} />
            <SkeletonLine width="70px" height={18} />
          </div>
        </div>
      </div>
    ))}
  </div>
);

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
      {/* ---------- Header ---------- */}
      <div className={styles.headerCard}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <AlertTriangle size={18} />
          </div>
          <div className={styles.headerText}>
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
          <span className={styles.refreshLabel}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </span>
        </button>
      </div>

      {/* ---------- Content ---------- */}
      {loading ? (
        <ReviewSkeleton />
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
            const tone = varianceTone(variance);
            const VarianceIcon =
              tone === 'over' ? TrendingUp :
              tone === 'short' ? TrendingDown :
              Minus;

            return (
              <div key={shift.id} className={styles.card}>
                {/* ---- Zone 1: Who + Review button ---- */}
                <div className={styles.cardHeader}>
                  <div className={styles.who}>
                    <div className={styles.avatar}>
                      {initials(shift.user)}
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

                {/* ---- Zone 2: Meta strip ---- */}
                <div className={styles.metaStrip}>
                  <div className={styles.metaItem} data-label="Branch">
                    <Building2 size={12} className={styles.metaIcon} />
                    <span className={styles.metaValue}>
                      {shift.branch?.name || '—'}
                    </span>
                  </div>
                  <div className={styles.metaItem} data-label="Closed">
                    <Clock size={12} className={styles.metaIcon} />
                    <span className={styles.metaValue}>
                      <span className={styles.metaFull}>
                        {formatDate
                          ? formatDate(shift.closedAt)
                          : new Date(shift.closedAt).toLocaleString()}
                      </span>
                      <span className={styles.metaCompact}>
                        {formatCompact(shift.closedAt, formatDate)}
                      </span>
                    </span>
                  </div>
                </div>

                {/* ---- Zone 3: Cash grid ---- */}
                <div className={styles.cashRow}>
                  <div className={styles.cashCell} data-label="Expected">
                    <span className={styles.cashLabel}>
                      <Wallet size={10} className={styles.cashIcon} />
                      Expected cash
                    </span>
                    <span className={styles.cashValue}>
                      {Number(shift.expectedCash).toLocaleString()}
                    </span>
                  </div>

                  <div className={styles.cashCell} data-label="Declared">
                    <span className={styles.cashLabel}>
                      <Wallet size={10} className={styles.cashIcon} />
                      Declared cash
                    </span>
                    <span className={styles.cashValue}>
                      {Number(shift.declaredCash).toLocaleString()}
                    </span>
                  </div>

                  <div
                    className={`${styles.cashCell} ${styles.cashCellVariance} ${styles[`tone_${tone}`] || ''}`}
                    data-label="Variance"
                  >
                    <span className={styles.cashLabel}>
                      <VarianceIcon size={10} className={styles.cashIcon} />
                      Variance
                    </span>
                    <span
                      className={`${styles.cashValue} ${
                        tone === 'over' ? styles.varianceOver :
                        tone === 'short' ? styles.varianceShort :
                        ''
                      }`}
                    >
                      {variance > 0 ? '+' : ''}
                      {variance.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- Review modal ---------- */}
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