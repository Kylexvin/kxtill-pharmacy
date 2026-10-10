// src/pages/Expiring/Expiring.jsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  CalendarClock,
  AlertTriangle,
  AlertCircle,
  Search,
  RefreshCw,
  Loader2,
  Pill,
  Building2,
  Package,
  Clock,
  Filter,

} from 'lucide-react';
import styles from './Expiring.module.css';
import usePolling from '../../hooks/usePolling';

const POLL_INTERVAL_MS = 60_000;

const DAY_PRESETS = [
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
  { label: '180 days', value: 180 },
  { label: '1 year', value: 365 },
];

const DAYS_MS = 24 * 60 * 60 * 1000;

const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / DAYS_MS);
};

const formatExpiry = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const Expiring = () => {
  const { activeOrganization, activeBranch, isOffline } = useAuth();
  const { formatCurrency } = useSettings();

  const orgId = activeOrganization?.id;
  const branchId = activeBranch?.id;

  const [days, setDays] = useState(90);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isMountedRef = useRef(true);
  const fetchControllerRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);

  // ---------- fetch ----------
  const fetchExpiring = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return { ok: false };
    }

    if (!hasLoadedOnceRef.current) setLoading(true);

    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    try {
      const params = { days };
      if (branchId) params.branchId = branchId;

      const res = await axios.get(
        `/organizations/${orgId}/kxtill/pharmacy/batches/expiring`,
        { params, signal: controller.signal, timeout: 10000 }
      );

      if (controller.signal.aborted || !isMountedRef.current) {
        return { ok: false };
      }

      setBatches(res.data?.batches || []);
      hasLoadedOnceRef.current = true;
      return { ok: true };
    } catch (error) {
      if (error.name === 'CanceledError' || error.name === 'AbortError') {
        return { ok: false };
      }
      console.error('Failed to fetch expiring batches:', error);
      if (isMountedRef.current) {
        toast.error(
          error.response?.data?.error ||
            error.response?.data?.message ||
            'Failed to load expiring stock'
        );
        setBatches([]);
      }
      return { ok: false, error };
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [orgId, branchId, days]);

  // ---------- lifecycle ----------
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      fetchControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!orgId) return;
    fetchExpiring();
  }, [orgId, fetchExpiring]);

  useEffect(() => {
    const handler = setTimeout(() => setSearchTerm(searchInput), 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  usePolling(
    () => {
      if (!orgId) return;
      if (isOffline) return;
      if (!navigator.onLine) return;
      fetchExpiring();
    },
    POLL_INTERVAL_MS,
    [orgId, branchId, days]
  );

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const result = await fetchExpiring();
    if (isMountedRef.current) {
      setRefreshing(false);
      if (result?.ok) toast.success('Refreshed');
    }
  };

  // ---------- derived ----------
  // Flatten: one row per (batch, branch stock) pair
  const flattened = useMemo(() => {
    const rows = [];
    for (const batch of batches) {
      const stocks = batch.stocks || [];
      if (stocks.length === 0) continue;
      for (const s of stocks) {
        rows.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          manufacturer: batch.manufacturer,
          product: batch.product || {},
          branchId: s.branchId,
          branchProductId: s.branchProductId,
          quantityOnHand: Number(s.quantityOnHand || 0),
          unitCost: Number(s.unitCost || 0),
          sellingPrice: s.sellingPrice != null ? Number(s.sellingPrice) : null,
          status: s.status,
        });
      }
    }
    return rows;
  }, [batches]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return flattened;
    return flattened.filter((r) => {
      const name = (r.product?.name || '').toLowerCase();
      const sku = (r.product?.sku || '').toLowerCase();
      const bn = (r.batchNumber || '').toLowerCase();
      const mfr = (r.manufacturer || '').toLowerCase();
      return (
        name.includes(q) || sku.includes(q) || bn.includes(q) || mfr.includes(q)
      );
    });
  }, [flattened, searchTerm]);

  const stats = useMemo(() => {
    let totalUnits = 0;
    let totalValue = 0;
    let expired = 0;
    let critical = 0; // <= 30 days
    let warning = 0; // <= 90 days

    for (const r of filtered) {
      totalUnits += r.quantityOnHand;
      totalValue += r.quantityOnHand * r.unitCost;
      const d = daysUntil(r.expiryDate);
      if (d === null) continue;
      if (d < 0) expired++;
      else if (d <= 30) critical++;
      else if (d <= 90) warning++;
    }

    return {
      batchRows: filtered.length,
      totalUnits,
      totalValue,
      expired,
      critical,
      warning,
    };
  }, [filtered]);

  const getRowSeverity = (expiryDate) => {
    const d = daysUntil(expiryDate);
    if (d === null) return 'neutral';
    if (d < 0) return 'expired';
    if (d <= 30) return 'critical';
    if (d <= 90) return 'warning';
    return 'ok';
  };

  if (!orgId) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>
          <AlertCircle size={40} />
          <p>No organization selected</p>
        </div>
      </div>
    );
  }

  const showSkeleton = loading && !hasLoadedOnceRef.current;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <CalendarClock size={20} />
          </div>
          <div>
            <h1 className={styles.title}>Expiring Stock</h1>
            <p className={styles.subtitle}>
              <Building2 size={12} /> {activeBranch?.name || 'All Branches'}
            </p>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button
            className={styles.refreshBtn}
            onClick={handleRefresh}
            disabled={refreshing}
            type="button"
            title="Refresh"
          >
            <RefreshCw
              size={14}
              className={refreshing ? styles.spinning : ''}
            />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconNeutral}`}>
            <Package size={18} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Batches</span>
            <span className={styles.statValue}>{stats.batchRows}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconNeutral}`}>
            <Pill size={18} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Units</span>
            <span className={styles.statValue}>{stats.totalUnits}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconWarning}`}>
            <Clock size={18} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>≤ 90 days</span>
            <span className={styles.statValue}>{stats.warning}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconDanger}`}>
            <AlertTriangle size={18} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>≤ 30 days</span>
            <span className={styles.statValue}>{stats.critical}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconExpired}`}>
            <AlertCircle size={18} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Value at Cost</span>
            <span className={styles.statValue}>
              {formatCurrency(stats.totalValue)}
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filtersBar}>
        <div className={styles.searchWrapper}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by product, batch number, or manufacturer…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <div className={styles.presetsRow}>
          <span className={styles.presetsLabel}>
            <Filter size={12} /> Window:
          </span>
          {DAY_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`${styles.presetBtn} ${
                days === p.value ? styles.presetBtnActive : ''
              }`}
              onClick={() => setDays(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {showSkeleton ? (
        <div className={styles.loadingState}>
          <Loader2 size={28} className={styles.spinning} />
          <p>Loading expiring batches…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <CalendarClock size={40} />
          <h3>Nothing expiring</h3>
          <p>
            {searchTerm
              ? 'No batches match your search.'
              : `No batches expiring in the next ${days} days.`}
          </p>
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Product</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th>Days Left</th>
                <th>Qty</th>
                <th>Value (Cost)</th>
                <th>Branch</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => {
                const severity = getRowSeverity(row.expiryDate);
                const d = daysUntil(row.expiryDate);
                const isMedicine = !!row.product?.pharmacyProduct;

                return (
                  <tr
                    key={`${row.batchId}-${row.branchProductId}-${idx}`}
                    className={`${styles.tableRow} ${styles[severity]}`}
                  >
                    <td>
                      <div className={styles.productCell}>
                        <div className={styles.productCellIcon}>
                          {isMedicine ? (
                            <Pill size={14} />
                          ) : (
                            <Package size={14} />
                          )}
                        </div>
                        <div>
                          <div className={styles.productCellName}>
                            {row.product?.name || 'Unknown'}
                          </div>
                          {row.product?.sku && (
                            <div className={styles.productCellSku}>
                              {row.product.sku}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={styles.batchCell}>
                      {row.batchNumber}
                    </td>
                    <td className={styles.expiryCell}>
                      {formatExpiry(row.expiryDate)}
                    </td>
                    <td>
                      <span
                        className={`${styles.daysBadge} ${styles[severity]}`}
                      >
                        {d === null
                          ? '—'
                          : d < 0
                          ? `Expired ${Math.abs(d)}d ago`
                          : `${d}d`}
                      </span>
                    </td>
                    <td className={styles.qtyCell}>
                      {row.quantityOnHand}
                    </td>
                    <td className={styles.valueCell}>
                      {formatCurrency(row.quantityOnHand * row.unitCost)}
                    </td>
                    <td className={styles.branchCell}>
                      {row.branchId ? row.branchId.slice(0, 8) : '—'}
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

export default Expiring;