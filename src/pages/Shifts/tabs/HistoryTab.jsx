// src/pages/Shifts/tabs/HistoryTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  AlertCircle, RefreshCw, Clock, Search, ChevronDown,
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
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

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

  const filtered = search.trim()
    ? items.filter((s) => {
        const q = search.toLowerCase();
        return (
          (s.user?.firstName || '').toLowerCase().includes(q) ||
          (s.user?.lastName || '').toLowerCase().includes(q) ||
          (s.branch?.name || '').toLowerCase().includes(q)
        );
      })
    : items;

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
      ) : filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <Clock size={40} />
          <h3>No shifts found</h3>
          <p>
            {search || statusFilter
              ? 'Try adjusting filters.'
              : 'Shifts will appear here once cashiers start opening them.'}
          </p>
        </div>
      ) : (
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

          {filtered.map((shift) => (
            <div key={shift.id} className={styles.tableRow}>
              <div className={styles.cellMain}>
                <div className={styles.cellTitle}>
                  {shift.user?.firstName} {shift.user?.lastName}
                </div>
                <div className={styles.cellSub}>{shift.user?.email}</div>
              </div>
              <div className={styles.cellMain}>
                <div className={styles.cellTitle}>{shift.branch?.name || '—'}</div>
                <div className={styles.cellSub}>{shift.branch?.code || ''}</div>
              </div>
              <div className={styles.cellText}>
                {formatDateTime(shift.openedAt, formatDate)}
              </div>
              <div className={styles.cellText}>
                {formatDateTime(shift.closedAt, formatDate)}
              </div>
              <div className={styles.cellText}>
                {Number(shift.openingFloat).toLocaleString()}
              </div>
              <div className={styles.cellText}>
                {shift.variance != null
                  ? Number(shift.variance).toLocaleString()
                  : '—'}
              </div>
              <div className={styles.cellText}>
                <span className={`${styles.badge} ${statusClass(shift.status)}`}>
                  {statusLabel(shift.status)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

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