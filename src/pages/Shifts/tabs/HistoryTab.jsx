// src/pages/Shifts/tabs/HistoryTab.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  AlertCircle, RefreshCw, Clock, Search, ChevronDown, X,
 Calendar, Wallet, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useSettings } from '../../../contexts/SettingsContext';
import styles from './HistoryTab.module.css';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'CLOSED_PENDING_REVIEW', label: 'Pending review' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const formatDateTime = (value, fn) => {
  if (!value) return '—';
  if (fn) return fn(value);
  return new Date(value).toLocaleString();
};

/* Short date-only for mobile tiles — "01 Oct · 22:40" */
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

const statusClass = (status) => {
  switch (status) {
    case 'OPEN': return styles.badgeOpen;
    case 'CLOSED': return styles.badgeClosed;
    case 'CLOSED_PENDING_REVIEW': return styles.badgeReview;
    case 'CANCELLED': return styles.badgeCancelled;
    default: return styles.badgeNeutral;
  }
};

const statusLabel = (status) => {
  switch (status) {
    case 'OPEN': return 'Open';
    case 'CLOSED': return 'Closed';
    case 'CLOSED_PENDING_REVIEW': return 'Review';
    case 'CANCELLED': return 'Cancelled';
    default: return status || '—';
  }
};

const initials = (user) => {
  const f = user?.firstName?.[0] || '';
  const l = user?.lastName?.[0] || '';
  return (f + l).toUpperCase() || '?';
};

/* Variance direction → tone */
const varianceTone = (v) => {
  if (v == null) return 'neutral';
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

const HistorySkeleton = () => (
  <div className={styles.table}>
    <div className={styles.tableHead}>
      <span>Cashier</span>
      <span>Branch</span>
      <span>Opened</span>
      <span>Closed</span>
      <span>Float</span>
      <span>Variance</span>
      <span>Status</span>
    </div>
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className={styles.tableRow}>
        <div className={styles.cellMain}>
          <SkeletonLine width="130px" height={13} />
          <div style={{ height: 6 }} />
          <SkeletonLine width="160px" height={10} />
        </div>
        <div className={styles.cellMain}>
          <SkeletonLine width="100px" height={13} />
          <div style={{ height: 6 }} />
          <SkeletonLine width="50px" height={10} />
        </div>
        <div className={styles.cellText}>
          <SkeletonLine width="90px" height={13} />
        </div>
        <div className={styles.cellText}>
          <SkeletonLine width="90px" height={13} />
        </div>
        <div className={styles.cellText}>
          <SkeletonLine width="60px" height={13} />
        </div>
        <div className={styles.cellText}>
          <SkeletonLine width="60px" height={13} />
        </div>
        <div className={styles.cellText}>
          <SkeletonLine width="70px" height={22} radius={999} />
        </div>
      </div>
    ))}
  </div>
);

const HistoryTab = () => {
  const { activeOrganization } = useAuth();
  const { formatDateTime: formatDate } = useSettings();
  const orgId = activeOrganization?.id;

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (isRefresh = false) => {
    if (!orgId) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const params = { limit, offset };
      if (statusFilter) params.status = statusFilter;
      const res = await axios.get(`/organizations/${orgId}/kxtill/shifts`, { params });
      const data = res.data || {};
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to load shifts'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, limit, offset, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = () => load(true);

  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return items;
    const q = debouncedSearch.toLowerCase();
    return items.filter((s) => (
      (s.user?.firstName || '').toLowerCase().includes(q) ||
      (s.user?.lastName || '').toLowerCase().includes(q) ||
      (s.user?.email || '').toLowerCase().includes(q) ||
      (s.branch?.name || '').toLowerCase().includes(q) ||
      (s.branch?.code || '').toLowerCase().includes(q)
    ));
  }, [items, debouncedSearch]);

  const hasFilters = !!(search || statusFilter);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setOffset(0);
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
      {/* ---------- Filters ---------- */}
      <div className={styles.filtersBar}>
        <div className={styles.searchWrap}>
          <Search size={14} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by cashier or branch..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className={styles.selectWrap}>
          <select
            className={styles.select}
            value={statusFilter}
            onChange={(e) => {
              setOffset(0);
              setStatusFilter(e.target.value);
            }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown size={14} className={styles.selectChevron} />
        </div>

        <button
          type="button"
          className={styles.refreshBtn}
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={14} className={refreshing ? styles.spinning : ''} />
          <span className={styles.refreshLabel}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </span>
        </button>

        {hasFilters && (
          <button
            type="button"
            className={styles.clearFiltersBtn}
            onClick={clearFilters}
          >
            Clear
          </button>
        )}
      </div>

      {/* ---------- Content ---------- */}
      {loading ? (
        <HistorySkeleton />
      ) : error ? (
        <div className={styles.errorState}>
          <AlertCircle size={32} />
          <p>{error}</p>
          <button className={styles.retryBtn} onClick={() => load()}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <Clock size={40} />
          <h3>No shifts found</h3>
          <p>
            {hasFilters
              ? 'Try adjusting or clearing your filters.'
              : 'Shifts will appear here once cashiers start opening them.'}
          </p>
          {hasFilters && (
            <button className={styles.retryBtn} onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className={styles.table}>
          {/* Desktop header only */}
          <div className={styles.tableHead}>
            <span>Cashier</span>
            <span>Branch</span>
            <span>Opened</span>
            <span>Closed</span>
            <span>Float</span>
            <span>Variance</span>
            <span>Status</span>
          </div>

          {filtered.map((shift) => {
            const tone = varianceTone(shift.variance);
            const VarianceIcon =
              tone === 'over' ? TrendingUp :
              tone === 'short' ? TrendingDown :
              Minus;

            return (
              <div key={shift.id} className={styles.tableRow}>
                {/* ---- Who (mobile: card header) ---- */}
                <div className={styles.cellMain}>
                  <div className={styles.avatarSm}>
                    {initials(shift.user)}
                  </div>
                  <div className={styles.whoText}>
                    <div className={styles.cellTitle}>
                      {shift.user?.firstName} {shift.user?.lastName}
                    </div>
                    <div className={styles.cellSub}>{shift.user?.email}</div>
                  </div>
                </div>

                {/* ---- Branch ---- */}
                <div className={styles.cellMain} data-label="Branch">
                  <div className={styles.cellTitle}>
                    {shift.branch?.name || '—'}
                  </div>
                  <div className={styles.cellSub}>{shift.branch?.code || ''}</div>
                </div>

                {/* ---- Meta wrapper ---- */}
                <div className={styles.cardMeta}>
                  <div className={styles.metaCell} data-label="Opened">
                    <Calendar size={11} className={styles.metaIcon} />
                    <span className={styles.metaFull}>
                      {formatDateTime(shift.openedAt, formatDate)}
                    </span>
                    <span className={styles.metaCompact}>
                      {formatCompact(shift.openedAt, formatDate)}
                    </span>
                  </div>

                  <div className={styles.metaCell} data-label="Closed">
                    <Calendar size={11} className={styles.metaIcon} />
                    <span className={styles.metaFull}>
                      {formatDateTime(shift.closedAt, formatDate)}
                    </span>
                    <span className={styles.metaCompact}>
                      {formatCompact(shift.closedAt, formatDate)}
                    </span>
                  </div>

                  <div className={styles.metaCell} data-label="Float">
                    <Wallet size={11} className={styles.metaIcon} />
                    <span>{Number(shift.openingFloat).toLocaleString()}</span>
                  </div>

                  <div
                    className={`${styles.metaCell} ${styles.metaCellVariance} ${styles[`tone_${tone}`] || ''}`}
                    data-label="Variance"
                  >
                    <VarianceIcon size={11} className={styles.metaIcon} />
                    <span>
                      {shift.variance != null
                        ? Number(shift.variance).toLocaleString()
                        : '—'}
                    </span>
                  </div>
                </div>

                {/* ---- Status ---- */}
                <div className={styles.cellText}>
                  <span className={`${styles.badge} ${statusClass(shift.status)}`}>
                    {statusLabel(shift.status)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- Pagination ---------- */}
      {total > limit && (
        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Previous
          </button>
          <span className={styles.pageInfo}>
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default HistoryTab;