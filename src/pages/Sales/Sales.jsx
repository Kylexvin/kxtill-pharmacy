// src/pages/Sales/Sales.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useSettings } from '../../contexts/SettingsContext';
import { renderReceipt } from '../../utils/receipt/templates';
import { openPrintWindow } from '../../utils/receipt/print';
import toast from 'react-hot-toast';
import {
  Search, Filter, Eye, ChevronLeft, ChevronRight,
  FileText, Printer, RefreshCw, Clock, CheckCircle, XCircle,
  AlertCircle, Receipt, Copy, Check, User, Building2, CreditCard, X,
  Banknote, Smartphone, CloudOff, RotateCw, WifiOff,
} from 'lucide-react';
import axios from 'axios';
import {
  getAllLocalSalesForBranch,
  getLocalSaleFormatted,
  getLocalSaleByServerId,
  retryLocalSale,
  getPendingSalesCount,
  getFailedSalesCount,
} from '../../db/sqlite';
import SalesStats from './components/SalesStats';
import PendingBanner from './components/PendingBanner';
import styles from './Sales.module.css';

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------
const POLL_INTERVAL_IDLE_MS = 30000;
const POLL_INTERVAL_PENDING_MS = 8000;
const SEARCH_DEBOUNCE_MS = 400;
const OFFLINE_DEBOUNCE_MS = 1500;
const SYNC_EVENT_NAME = 'kxtill:sync-complete';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const isLocalOnly = (sale) => {
  if (!sale) return false;
  if (sale.serverSaleId) return false;
  return sale.isLocal === true && sale.localStatus !== 'SYNCED';
};

const paymentMethodOf = (sale) => {
  if (sale.paymentMethod) return sale.paymentMethod;
  if (sale.payments && sale.payments.length > 0) return sale.payments[0].method;
  return null;
};

const referenceOf = (sale) => {
  if (sale.reference) return sale.reference;
  if (sale.id) return String(sale.id).slice(-8).toUpperCase();
  return 'N/A';
};

const itemsCountOf = (sale) => {
  if (typeof sale.itemsCount === 'number') return sale.itemsCount;
  if (Array.isArray(sale.items)) return sale.items.length;
  return 0;
};

const toNumber = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const applyClientFilters = (items, { statusFilter, paymentFilter, searchTerm }) => {
  let result = items;

  if (statusFilter && statusFilter !== 'all') {
    const target = statusFilter.toUpperCase();
    result = result.filter((sale) => (sale.status || '').toUpperCase() === target);
  }

  if (paymentFilter && paymentFilter !== 'all') {
    const target = paymentFilter.toUpperCase();
    result = result.filter(
      (sale) => (paymentMethodOf(sale) || '').toUpperCase() === target
    );
  }

  if (searchTerm && searchTerm.trim()) {
    const term = searchTerm.trim().toLowerCase();
    result = result.filter((sale) => {
      const ref = referenceOf(sale).toLowerCase();
      const customer = (sale.customerName || '').toLowerCase();
      const id = (sale.id || '').toLowerCase();
      return ref.includes(term) || customer.includes(term) || id.includes(term);
    });
  }

  return result;
};

const isAbortError = (error) =>
  error?.name === 'CanceledError' ||
  error?.name === 'AbortError' ||
  axios.isCancel?.(error);

// localStorage key for cached server totals (per org + branch scope)
const totalsCacheKey = (orgId, branchId) =>
  `salesTotals:${orgId}:${branchId || 'all'}`;

const Sales = () => {
  const navigate = useNavigate();
  const {
    activeOrganization,
    activeBranch,
    branches,
    isOffline: contextIsOffline,
  } = useAuth();

  const { isOwner, hasAllBranches } = usePermissions();
  const { formatCurrency, formatDate, formatDateTime } = useSettings();

  const [rawSales, setRawSales] = useState([]);
  const [serverTotals, setServerTotals] = useState(null);
  const [localUnsyncedTotal, setLocalUnsyncedTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');

  const [branchFilter, setBranchFilter] = useState(
    () => activeBranch?.id || 'all'
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [localPendingCount, setLocalPendingCount] = useState(0);
  const [localFailedCount, setLocalFailedCount] = useState(0);
  const [showReceipt, setShowReceipt] = useState(null);
  const [showDetail, setShowDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [retryingIds, setRetryingIds] = useState(new Set());

  const orgId = activeOrganization?.id;
  const limit = 20;

  const isMountedRef = useRef(true);
  const fetchSalesControllerRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);
  const offlineTimerRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      fetchSalesControllerRef.current?.abort();
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
    };
  }, []);

  const rawOffline = !navigator.onLine || contextIsOffline;

  useEffect(() => {
    if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
    if (rawOffline) {
      offlineTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) setIsOnline(false);
      }, OFFLINE_DEBOUNCE_MS);
    } else {
      setIsOnline(true);
    }
    return () => {
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
    };
  }, [rawOffline]);

  useEffect(() => {
    setBranchFilter(activeBranch?.id || 'all');
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranch?.id]);

  // ---------- branch helpers ----------
  const canViewAllBranches = hasAllBranches || isOwner;
  const availableBranches = useMemo(() => branches || [], [branches]);
  const showBranchFilter = canViewAllBranches && availableBranches.length > 1;

  const getActiveBranchName = useCallback(() => {
    if (canViewAllBranches && branchFilter === 'all') return 'All Branches';
    if (branchFilter !== 'all') {
      const branch = availableBranches.find((b) => b.id === branchFilter);
      return branch?.name || 'Unknown Branch';
    }
    if (activeBranch) return activeBranch.name;
    return 'No Branch Selected';
  }, [canViewAllBranches, branchFilter, availableBranches, activeBranch]);

  const getActiveBranchId = useCallback(() => {
    if (branchFilter !== 'all') return branchFilter;
    if (activeBranch) return activeBranch.id;
    return null;
  }, [branchFilter, activeBranch]);

  const getServerBranchId = useCallback(() => {
    if (branchFilter !== 'all') return branchFilter;
    if (!canViewAllBranches) return activeBranch?.id || null;
    return null;
  }, [branchFilter, canViewAllBranches, activeBranch]);

  const fetchLocalCounts = useCallback(async () => {
    const branchId = getActiveBranchId();
    if (!branchId) return;
    try {
      const pending = await getPendingSalesCount(branchId);
      const failed = await getFailedSalesCount(branchId);
      if (isMountedRef.current) {
        setLocalPendingCount(pending);
        setLocalFailedCount(failed);
      }
    } catch (error) {
      console.error('Error fetching local counts:', error);
    }
  }, [getActiveBranchId]);

  // ---------- merge ----------
  const mergeSales = useCallback((serverSales, localSales) => {
    const localMap = {};
    localSales.forEach((local) => {
      const keys = [local.serverSaleId, local.id, local.reference].filter(Boolean);
      keys.forEach((k) => { localMap[k] = local; });
    });

    const serverIds = new Set();
    const serverClientIds = new Set();
    const serverRefs = new Set();

    const merged = serverSales.map((server) => {
      if (server.id) serverIds.add(server.id);
      if (server.clientSaleId) serverClientIds.add(server.clientSaleId);
      if (server.reference) serverRefs.add(server.reference);

      const local =
        localMap[server.id] ||
        (server.clientSaleId && localMap[server.clientSaleId]) ||
        (server.reference && localMap[server.reference]);

      if (local) {
        return {
          ...server,
          isLocal: false,
          localStatus: 'SYNCED',
          error: undefined,
          receiptText: local.receiptText,
        };
      }
      return { ...server, isLocal: false };
    });

    const localOnly = localSales
      .filter((local) => {
        if (local.serverSaleId) return false;
        const onServer =
          serverIds.has(local.id) ||
          serverClientIds.has(local.id) ||
          (local.reference && serverRefs.has(local.reference));
        if (onServer) return false;
        return local.localStatus === 'PENDING' || local.localStatus === 'FAILED';
      })
      .map((local) => ({ ...local, isLocal: true }));

    const all = [...merged, ...localOnly];
    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return all;
  }, []);

  const buildDateParams = useCallback(() => {
    if (dateRange === 'all') return {};

    const now = new Date();
    let startDate = new Date();

    switch (dateRange) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'yesterday':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        break;
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last30':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 30);
        break;
      default:
        break;
    }

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
    };
  }, [dateRange]);

  // ---------- hydrate cached server totals on mount / scope change ----------
  useEffect(() => {
    if (!orgId) return;
    try {
      const key = totalsCacheKey(orgId, getServerBranchId());
      const cached = localStorage.getItem(key);
      if (cached) setServerTotals(JSON.parse(cached));
    } catch {
      // ignore
    }
  }, [orgId, getServerBranchId]);

  const fetchSales = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    if (!hasLoadedOnceRef.current) setLoading(true);

    fetchSalesControllerRef.current?.abort();
    const controller = new AbortController();
    fetchSalesControllerRef.current = controller;

    let serverSales = [];
    let localSales = [];
    let serverTotalsResult = null;
    const isCurrentlyOnline = !contextIsOffline && navigator.onLine;

    try {
      const params = { limit: 100, offset: 0, ...buildDateParams() };

      const serverBranchId = getServerBranchId();
      if (serverBranchId) params.branchId = serverBranchId;

      if (isCurrentlyOnline) {
        try {
          const response = await axios.get(
            `/organizations/${orgId}/kxtill/sales`,
            { params, timeout: 10000, signal: controller.signal }
          );
          serverSales = response.data.items || [];
          serverTotalsResult = response.data.totals || null;

          if (serverTotalsResult) {
            setServerTotals(serverTotalsResult);
            // cache for offline use
            try {
              const key = totalsCacheKey(orgId, serverBranchId);
              localStorage.setItem(key, JSON.stringify(serverTotalsResult));
            } catch {
              // quota / private mode
            }
          }

          if (!controller.signal.aborted && isMountedRef.current) {
            setLastSyncTime(new Date());
          }
        } catch (error) {
          if (isAbortError(error)) return;
          console.warn('Server sales fetch failed:', error.message);
        }
      }

      const localBranchId = getActiveBranchId();
      if (localBranchId) {
        const localResult = await getAllLocalSalesForBranch(localBranchId, {
          ...buildDateParams(),
        });
        localSales = localResult.items || [];
      }

      if (controller.signal.aborted || !isMountedRef.current) return;

      const mergedSales = mergeSales(serverSales, localSales);
      setRawSales(mergedSales);

      const localOnly = mergedSales.filter(isLocalOnly);
      const unsyncedTotal = localOnly.reduce(
        (sum, s) => sum + toNumber(s.totalAmount),
        0
      );
      setLocalUnsyncedTotal(unsyncedTotal);

      hasLoadedOnceRef.current = true;
      await fetchLocalCounts();
    } catch (error) {
      if (isAbortError(error)) return;
      console.error('Error fetching sales:', error);
      try {
        const localBranchId = getActiveBranchId();
        if (localBranchId) {
          const localResult = await getAllLocalSalesForBranch(localBranchId, {});
          if (isMountedRef.current) {
            setRawSales(localResult.items || []);
            // do NOT clear serverTotals — keep last cached value
            hasLoadedOnceRef.current = true;
          }
        }
      } catch (localError) {
        console.error('Failed to load local sales:', localError);
        if (isMountedRef.current) {
          setRawSales([]);
        }
      }
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) setLoading(false);
    }
  }, [
    orgId,
    getActiveBranchId,
    getServerBranchId,
    fetchLocalCounts,
    mergeSales,
    buildDateParams,
    contextIsOffline,
  ]);

  const filteredSales = useMemo(
    () => applyClientFilters(rawSales, { statusFilter, paymentFilter, searchTerm }),
    [rawSales, statusFilter, paymentFilter, searchTerm]
  );

  const totalItems = filteredSales.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));

  const paginatedSales = useMemo(() => {
    const start = (currentPage - 1) * limit;
    return filteredSales.slice(start, start + limit);
  }, [filteredSales, currentPage, limit]);

  // ---------- stats: server totals + local unsynced ----------
  const stats = useMemo(() => {
    const localOnly = filteredSales.filter(isLocalOnly);
    const localRevenue = localOnly.reduce(
      (sum, s) => sum + toNumber(s.totalAmount),
      0
    );
    const localCount = localOnly.length;

    const noClientFilters =
      statusFilter === 'all' &&
      paymentFilter === 'all' &&
      searchTerm.trim() === '' &&
      dateRange === 'all';

    const canUseServerTotals = Boolean(serverTotals) && noClientFilters;

    if (canUseServerTotals) {
      const totalRevenue = serverTotals.revenue + localRevenue;
      const totalSales = serverTotals.salesCount + localCount;
      return {
        totalSales,
        totalRevenue,
        averageOrderValue: totalSales > 0 ? totalRevenue / totalSales : 0,
        uniqueCustomers: serverTotals.uniqueCustomers,
        source: 'server+local',
      };
    }

    const totalRevenue = filteredSales.reduce(
      (sum, s) => sum + toNumber(s.totalAmount),
      0
    );
    return {
      totalSales: filteredSales.length,
      totalRevenue,
      averageOrderValue:
        filteredSales.length > 0 ? totalRevenue / filteredSales.length : 0,
      uniqueCustomers: new Set(
        filteredSales.map((s) => s.customerName || 'Walk-in Customer')
      ).size,
      source: 'page',
    };
  }, [
    filteredSales,
    serverTotals,
    statusFilter,
    paymentFilter,
    searchTerm,
    dateRange,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    const handle = setTimeout(
      () => setSearchTerm(searchInput),
      SEARCH_DEBOUNCE_MS
    );
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    hasLoadedOnceRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getServerBranchId, dateRange]);

  useEffect(() => {
    if (orgId) fetchSales();
  }, [fetchSales, orgId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, paymentFilter, searchTerm, branchFilter, dateRange]);

  // ---------- user-triggered refresh ----------
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetchSales();
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      if (isMountedRef.current) setIsRefreshing(false);
    }
  }, [fetchSales, isRefreshing]);

  // ---------- background refresh (silent) ----------
  const refreshInBackground = useCallback(async () => {
    try {
      await fetchSales();
    } catch (error) {
      console.error('Background refresh failed:', error);
    }
  }, [fetchSales]);

  useEffect(() => {
    if (!isOnline || contextIsOffline) return;

    const hasPendingWork = localPendingCount > 0 || localFailedCount > 0;
    const intervalMs = hasPendingWork
      ? POLL_INTERVAL_PENDING_MS
      : POLL_INTERVAL_IDLE_MS;

    const interval = setInterval(() => {
      if (navigator.onLine && !contextIsOffline) {
        refreshInBackground();
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [
    isOnline,
    contextIsOffline,
    refreshInBackground,
    localPendingCount,
    localFailedCount,
  ]);

  useEffect(() => {
    const onOnline = () => {
      if (orgId) refreshInBackground();
    };
    const onSyncComplete = () => {
      if (orgId) refreshInBackground();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener(SYNC_EVENT_NAME, onSyncComplete);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener(SYNC_EVENT_NAME, onSyncComplete);
    };
  }, [orgId, refreshInBackground]);

  const handleSearch = () => setSearchTerm(searchInput);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handlePageChange = (newPage) => setCurrentPage(newPage);

  const handleFilterChange = useCallback((type, value) => {
    switch (type) {
      case 'status': setStatusFilter(value); break;
      case 'payment': setPaymentFilter(value); break;
      case 'date': setDateRange(value); break;
      case 'branch': setBranchFilter(value); break;
      default: break;
    }
  }, []);

  const clearFilters = () => {
    setStatusFilter('all');
    setPaymentFilter('all');
    setDateRange('all');
    setBranchFilter(activeBranch?.id || 'all');
    setSearchInput('');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const handleRetryLocalSale = async (saleId) => {
    if (retryingIds.has(saleId)) return;

    setRetryingIds((prev) => new Set(prev).add(saleId));
    try {
      toast.loading('Retrying sync...', { id: 'retry' });
      await retryLocalSale(saleId);
      toast.success('Sale re-queued for sync', { id: 'retry' });
      fetchSales();
    } catch (error) {
      toast.error(error.message || 'Failed to retry', { id: 'retry' });
    } finally {
      setRetryingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(saleId);
        return newSet;
      });
    }
  };

  const handleViewDetail = async (saleId) => {
    if (!orgId) return;
    setDetailLoading(true);
    try {
      let localRow = await getLocalSaleFormatted(saleId);
      if (!localRow) localRow = await getLocalSaleByServerId(saleId);

      const localOnly =
        localRow && !localRow.serverSaleId && localRow.localStatus !== 'SYNCED';

      if (localOnly) {
        setShowDetail(localRow);
        setDetailLoading(false);
        return;
      }

      const targetId = localRow?.serverSaleId || saleId;
      const response = await axios.get(
        `/organizations/${orgId}/kxtill/sales/${targetId}`
      );
      setShowDetail(response.data.sale);
    } catch (error) {
      console.error('Error fetching sale detail:', error);
      try {
        const fallback =
          (await getLocalSaleFormatted(saleId)) ||
          (await getLocalSaleByServerId(saleId));
        if (fallback) {
          setShowDetail(fallback);
          return;
        }
      } catch {
        // ignore
      }
      toast.error('Failed to load sale details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handlePrintReceipt = async (sale) => {
    if (!orgId) return;

    if (isLocalOnly(sale)) {
      toast.error(
        'Receipt will be available after this sale syncs to the server.',
        { id: 'receipt', duration: 4000 }
      );
      return;
    }

    const targetId = sale.serverSaleId || sale.id;
    if (!targetId) {
      toast.error('Receipt is not available for this sale.', { id: 'receipt' });
      return;
    }

    try {
      toast.loading('Loading receipt...', { id: 'receipt' });
      const response = await axios.get(
        `/organizations/${orgId}/kxtill/sales/${targetId}/receipt`
      );
      const data = response.data;
      const text = renderReceipt(data, data?.receipt?.template);

      if (!openPrintWindow(text, `Receipt ${data?.receipt?.number || ''}`)) {
        toast.error('Please allow popups for this site', { id: 'receipt' });
        return;
      }
      toast.dismiss('receipt');
    } catch (error) {
      console.error('Error fetching receipt:', error);
      const status = error.response?.status;
      if (status === 404) {
        toast.error('Receipt not ready yet — try again in a moment.', { id: 'receipt' });
      } else {
        toast.error('Failed to load receipt', { id: 'receipt' });
      }
    }
  };

  const handleCopyReference = (reference, id) => {
    navigator.clipboard.writeText(reference);
    setCopiedId(id);
    toast.success('Reference copied');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (statusFilter !== 'all') count++;
    if (paymentFilter !== 'all') count++;
    if (dateRange !== 'all') count++;
    if (searchTerm && searchTerm.trim()) count++;
    return count;
  };

  const getStatusBadgeWithLocal = (sale) => {
    if (isLocalOnly(sale)) {
      const statusMap = {
        PENDING: { label: 'Pending Sync', className: styles.statusPending, icon: Clock },
        FAILED: { label: 'Sync Failed', className: styles.statusFailed, icon: XCircle },
      };
      return statusMap[sale.localStatus] || statusMap.PENDING;
    }

    const statusMap = {
      COMPLETED: { label: 'Completed', className: styles.statusCompleted, icon: CheckCircle },
      PAID: { label: 'Paid', className: styles.statusCompleted, icon: CheckCircle },
      PENDING: { label: 'Pending', className: styles.statusPending, icon: Clock },
      REFUNDED: { label: 'Refunded', className: styles.statusRefunded, icon: XCircle },
      VOIDED: { label: 'Voided', className: styles.statusVoided, icon: XCircle },
      CANCELLED: { label: 'Cancelled', className: styles.statusVoided, icon: XCircle },
    };
    return statusMap[sale.status] || statusMap.PENDING;
  };

  const getPaymentMethod = (method) => {
    const methodMap = {
      CASH: { icon: Banknote, label: 'Cash' },
      MPESA: { icon: Smartphone, label: 'M-PESA' },
      CARD: { icon: CreditCard, label: 'Card' },
      BANK: { icon: Building2, label: 'Bank Transfer' },
      MOBILE: { icon: Smartphone, label: 'Mobile Money' },
    };
    return methodMap[method] || { icon: CreditCard, label: method || 'N/A' };
  };

  if (!orgId) {
    return (
      <div className={styles.salesPage}>
        <div className={styles.loadingState}>
          <AlertCircle size={40} />
          <p>No organization selected</p>
        </div>
      </div>
    );
  }

  const showOffline = !isOnline || contextIsOffline;
  const showSkeleton = loading && !hasLoadedOnceRef.current;

  return (
    <div
      className={`${styles.salesPage} ${
        showOffline ? styles.pageOffline : styles.pageOnline
      }`}
    >
      {/* Branch Card */}
      <div
        className={`${styles.branchCard} ${
          showOffline ? styles.branchCardOffline : ''
        }`}
      >
        <div className={styles.branchCardContent}>
          <Building2 size={20} className={styles.branchCardIcon} />
          <div className={styles.branchCardInfo}>
            <span className={styles.branchCardLabel}>Current View</span>
            <span className={styles.branchCardName}>
              {getActiveBranchName()}
            </span>
          </div>
          <span
            className={`${styles.offlineBadge} ${
              showOffline ? styles.offlineBadgeVisible : styles.offlineBadgeHidden
            }`}
            aria-hidden={!showOffline}
          >
            <WifiOff size={12} />
            Offline
          </span>
          {isOwner && <span className={styles.ownerBadge}>Owner</span>}
          {!isOwner && canViewAllBranches && (
            <span className={styles.managerBadge}>Manager</span>
          )}
          {(localPendingCount > 0 || localFailedCount > 0) && (
            <div className={styles.localStatusBadges}>
              {localPendingCount > 0 && (
                <span className={styles.pendingBadge}>
                  <Clock size={12} />
                  {localPendingCount} pending
                </span>
              )}
              {localFailedCount > 0 && (
                <span className={styles.failedBadge}>
                  <XCircle size={12} />
                  {localFailedCount} failed
                </span>
              )}
            </div>
          )}
        </div>
        {showBranchFilter && (
          <div className={styles.branchCardFilter}>
            <select
              value={branchFilter}
              onChange={(e) => handleFilterChange('branch', e.target.value)}
              className={styles.branchCardSelect}
            >
              <option value="all">All Branches</option>
              {availableBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Stats */}
      <SalesStats
        stats={stats}
        isOnline={isOnline}
        localPendingCount={localPendingCount}
        localFailedCount={localFailedCount}
        localUnsyncedTotal={localUnsyncedTotal}
        formatCurrency={formatCurrency}
      />

      {/* Filters */}
      <div className={styles.filtersBar}>
        <div className={styles.searchWrapper}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search by reference or customer name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filterGroup}>
          <select
            value={statusFilter}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className={styles.filterSelect}
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="refunded">Refunded</option>
            <option value="voided">Voided</option>
          </select>

          <select
            value={paymentFilter}
            onChange={(e) => handleFilterChange('payment', e.target.value)}
            className={styles.filterSelect}
          >
            <option value="all">All Payment</option>
            <option value="cash">Cash</option>
            <option value="mpesa">M-PESA</option>
            <option value="card">Card</option>
            <option value="bank">Bank</option>
          </select>

          <select
            value={dateRange}
            onChange={(e) => handleFilterChange('date', e.target.value)}
            className={styles.filterSelect}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="last30">Last 30 Days</option>
          </select>

          <button
            className={styles.refreshBtn}
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh sales"
          >
            <RefreshCw
              size={16}
              className={isRefreshing ? styles.spinning : ''}
            />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <button className={styles.filterBtn} onClick={handleSearch}>
            <Filter size={16} />
            Apply
            {getActiveFilterCount() > 0 && (
              <span className={styles.filterBadge}>
                {getActiveFilterCount()}
              </span>
            )}
          </button>

          {getActiveFilterCount() > 0 && (
            <button className={styles.clearFiltersBtn} onClick={clearFilters}>
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Pending sync banner */}
      <PendingBanner
        pendingCount={localPendingCount}
        failedCount={localFailedCount}
        total={localUnsyncedTotal}
        isOnline={isOnline && !contextIsOffline}
        isRefreshing={isRefreshing}
        onSync={handleRefresh}
        formatCurrency={formatCurrency}
      />

      {/* Sales Table */}
      <div className={styles.tableContainer}>
        {showSkeleton ? (
          <div className={styles.loadingState}>
            <RefreshCw size={32} className={styles.spinning} />
            <p>Loading sales...</p>
          </div>
        ) : paginatedSales.length === 0 ? (
          <div className={styles.emptyState}>
            {showOffline ? (
              <>
                <WifiOff size={48} />
                <h3>You're Offline</h3>
                <p>No offline sales found. Connect to the internet to sync.</p>
                <button
                  className={styles.goToPosBtn}
                  onClick={() => navigate('/pos')}
                >
                  Go to POS
                </button>
              </>
            ) : (
              <>
                <FileText size={48} />
                <h3>No sales found</h3>
                <p>
                  {getActiveFilterCount() > 0
                    ? 'Try adjusting your filters to see more results'
                    : 'Start making sales to see them here'}
                </p>
                {getActiveFilterCount() > 0 && (
                  <button
                    className={styles.goToPosBtn}
                    onClick={clearFilters}
                  >
                    Clear Filters
                  </button>
                )}
                <button
                  className={styles.goToPosBtn}
                  onClick={() => navigate('/pos')}
                  style={{
                    marginTop: getActiveFilterCount() > 0 ? '8px' : '12px',
                  }}
                >
                  Go to POS
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className={styles.tableHeader}>
              <span className={styles.tableInfo}>
                Showing {paginatedSales.length} of {totalItems} sales
                {lastSyncTime && isOnline && (
                  <span className={styles.lastSyncTime}>
                    • Updated: {lastSyncTime.toLocaleTimeString()}
                  </span>
                )}
              </span>
              <span
                className={`${styles.offlineIndicator} ${
                  showOffline
                    ? styles.offlineIndicatorVisible
                    : styles.offlineIndicatorHidden
                }`}
                aria-hidden={!showOffline}
              >
                <WifiOff size={14} />
                Offline Mode
              </span>
              {localPendingCount > 0 && isOnline && !contextIsOffline && (
                <span className={styles.offlineIndicator}>
                  <CloudOff size={14} />
                  {localPendingCount} pending sync
                </span>
              )}
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Date & Time</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSales.map((sale) => {
                  const status = getStatusBadgeWithLocal(sale);
                  const StatusIcon = status.icon;
                  const payment = getPaymentMethod(paymentMethodOf(sale));
                  const PaymentIcon = payment.icon;
                  const reference = referenceOf(sale);
                  const localOnly = isLocalOnly(sale);
                  const isRetrying = retryingIds.has(sale.id);

                  return (
                    <tr
                      key={sale.id}
                      className={`${styles.tableRow} ${
                        localOnly ? styles.localRow : ''
                      }`}
                    >
                      <td className={styles.referenceCell}>
                        <div className={styles.referenceWrapper}>
                          <span className={styles.referenceNumber}>
                            {reference}
                          </span>
                          {localOnly && (
                            <span
                              className={styles.localBadge}
                              title="Offline Sale"
                            >
                              <CloudOff size={12} />
                            </span>
                          )}
                          <button
                            className={styles.copyBtn}
                            onClick={() =>
                              handleCopyReference(reference, sale.id)
                            }
                            title="Copy reference"
                          >
                            {copiedId === sale.id ? (
                              <Check size={12} />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className={styles.dateCell}>
                        {formatDateTime(sale.createdAt)}
                      </td>
                      <td>
                        <div className={styles.customerCell}>
                          <span className={styles.customerName}>
                            {sale.customerName || 'Walk-in Customer'}
                          </span>
                          {localOnly && (
                            <span className={styles.localSubtext}>Offline</span>
                          )}
                        </div>
                      </td>
                      <td className={styles.itemsCount}>
                        {itemsCountOf(sale)}
                      </td>
                      <td className={styles.totalCell}>
                        <span className={styles.totalAmount}>
                          {formatCurrency(sale.totalAmount)}
                        </span>
                      </td>
                      <td>
                        <div className={styles.paymentMethod}>
                          <PaymentIcon size={14} />
                          <span>{payment.label}</span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${status.className}`}
                        >
                          <StatusIcon size={12} />
                          {status.label}
                        </span>
                      </td>
                      <td>
                        <div className={styles.actionButtons}>
                          <button
                            className={styles.viewBtn}
                            onClick={() => handleViewDetail(sale.id)}
                            title="View Details"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            className={styles.printBtn}
                            onClick={() => handlePrintReceipt(sale)}
                            disabled={localOnly}
                            title={
                              localOnly
                                ? 'Receipt available after sync'
                                : 'Print Receipt'
                            }
                          >
                            <Receipt size={16} />
                          </button>
                          {localOnly && sale.localStatus === 'FAILED' && (
                            <button
                              className={styles.retryBtn}
                              onClick={() => handleRetryLocalSale(sale.id)}
                              disabled={isRetrying}
                              title="Retry Sync"
                            >
                              {isRetrying ? (
                                <RefreshCw
                                  size={16}
                                  className={styles.spinning}
                                />
                              ) : (
                                <RotateCw size={16} />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  className={styles.pageBtn}
                  onClick={() =>
                    handlePageChange(Math.max(currentPage - 1, 1))
                  }
                  disabled={currentPage === 1}
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <span className={styles.pageInfo}>
                  Page {currentPage} of {totalPages} ({totalItems} items)
                </span>
                <button
                  className={styles.pageBtn}
                  onClick={() =>
                    handlePageChange(Math.min(currentPage + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {showDetail && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowDetail(null)}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <FileText size={18} />
                <span>Sale Details</span>
                {isLocalOnly(showDetail) && (
                  <span className={styles.localBadge}>Offline</span>
                )}
              </div>
              <button
                className={styles.modalClose}
                onClick={() => setShowDetail(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {detailLoading ? (
                <div className={styles.detailLoading}>
                  <RefreshCw size={24} className={styles.spinning} />
                  <p>Loading details...</p>
                </div>
              ) : (
                <>
                  <div className={styles.detailHeader}>
                    <div className={styles.detailRef}>
                      <span className={styles.detailRefLabel}>Reference</span>
                      <span className={styles.detailRefValue}>
                        {referenceOf(showDetail)}
                      </span>
                    </div>
                    <div className={styles.detailStatus}>
                      {(() => {
                        const status = getStatusBadgeWithLocal(showDetail);
                        const StatusIcon = status.icon;
                        return (
                          <span
                            className={`${styles.statusBadge} ${status.className}`}
                          >
                            <StatusIcon size={12} />
                            {status.label}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  <div className={styles.detailMeta}>
                    <div className={styles.detailMetaItem}>
                      <Clock size={14} />
                      <span>{formatDateTime(showDetail.createdAt)}</span>
                    </div>
                    <div className={styles.detailMetaItem}>
                      <User size={14} />
                      <span>
                        {showDetail.user?.firstName ||
                          showDetail.cashierName?.split(' ')[0] ||
                          '—'}{' '}
                        {showDetail.user?.lastName ||
                          showDetail.cashierName?.split(' ')[1] ||
                          ''}
                      </span>
                    </div>
                    <div className={styles.detailMetaItem}>
                      <Building2 size={14} />
                      <span>
                        {showDetail.branch?.name ||
                          showDetail.branchName ||
                          getActiveBranchName()}
                      </span>
                    </div>
                    <div className={styles.detailMetaItem}>
                      <User size={14} />
                      <span>
                        {showDetail.customerName || 'Walk-in Customer'}
                      </span>
                    </div>
                    {(showDetail.shiftId || showDetail.refundShiftId) && (
  <div className={styles.detailMetaItem}>
    <Clock size={14} />
    <span>
      Shift: {String(showDetail.shiftId || showDetail.refundShiftId).slice(0, 8)}
    </span>
  </div>
)}
                    {isLocalOnly(showDetail) &&
                      showDetail.localStatus === 'FAILED' && (
                        <div className={styles.detailMetaItem}>
                          <AlertCircle size={14} />
                          <span className={styles.errorText}>
                            Sync Failed: {showDetail.error || 'Unknown error'}
                          </span>
                        </div>
                      )}
                  </div>

                  <div className={styles.detailItems}>
                    <h4>Items</h4>
                    <table className={styles.detailTable}>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>Unit</th>
                          <th>Price</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {showDetail.items?.map((item, idx) => (
                          <tr key={item.id || idx}>
                            <td>
                              {item.productName ||
                                item.product?.name ||
                                item.name ||
                                'Unknown'}
                            </td>
                            <td>{item.quantity}</td>
                            <td>{item.unitName || item.unitAbbrev}</td>
                            <td>{formatCurrency(item.unitPrice)}</td>
                            <td>
                              {formatCurrency(
                                item.total ||
                                  Number(item.unitPrice || 0) *
                                    Number(item.quantity || 0)
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className={styles.detailTotals}>
                    <div className={styles.detailTotalRow}>
                      <span>Subtotal</span>
                      <span>{formatCurrency(showDetail.subtotal)}</span>
                    </div>
                    {toNumber(showDetail.taxAmount) > 0 && (
                      <div className={styles.detailTotalRow}>
                        <span>Tax</span>
                        <span>{formatCurrency(showDetail.taxAmount)}</span>
                      </div>
                    )}
                    {toNumber(showDetail.discount) > 0 && (
                      <div className={styles.detailTotalRow}>
                        <span>Discount</span>
                        <span>-{formatCurrency(showDetail.discount)}</span>
                      </div>
                    )}
                    <div
                      className={`${styles.detailTotalRow} ${styles.detailGrandTotal}`}
                    >
                      <span>Total</span>
                      <span>{formatCurrency(showDetail.totalAmount)}</span>
                    </div>
                  </div>

                  {showDetail.payments && showDetail.payments.length > 0 && (
                    <div className={styles.detailPayments}>
                      <h4>Payments</h4>
                      {showDetail.payments.map((payment, idx) => {
                        const pm = getPaymentMethod(payment.method);
                        const PmIcon = pm.icon;
                        return (
                          <div key={idx} className={styles.detailPayment}>
                            <PmIcon size={14} />
                            <span>{pm.label}</span>
                            <span className={styles.detailPaymentAmount}>
                              {formatCurrency(payment.amount)}
                            </span>
                            {payment.reference && (
                              <span className={styles.detailPaymentRef}>
                                Ref: {payment.reference}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {showDetail.status === 'REFUNDED' &&
                    showDetail.refundedByUser && (
                      <div className={styles.detailRefund}>
                        <XCircle size={14} />
                        <span>
                          Refunded by {showDetail.refundedByUser.firstName}{' '}
                          {showDetail.refundedByUser.lastName} on{' '}
                          {formatDate(showDetail.refundedAt)}
                        </span>
                      </div>
                    )}

                  {isLocalOnly(showDetail) &&
                    showDetail.localStatus === 'FAILED' && (
                      <div className={styles.detailActions}>
                        <button
                          className={styles.retryBtnLarge}
                          onClick={() => {
                            handleRetryLocalSale(showDetail.id);
                            setShowDetail(null);
                          }}
                          disabled={retryingIds.has(showDetail.id)}
                        >
                          {retryingIds.has(showDetail.id) ? (
                            <>
                              <RefreshCw
                                size={16}
                                className={styles.spinning}
                              />
                              Retrying...
                            </>
                          ) : (
                            <>
                              <RotateCw size={16} />
                              Retry Sync
                            </>
                          )}
                        </button>
                      </div>
                    )}
                </>
              )}
            </div>

            <div className={styles.modalFooter}>
              {isLocalOnly(showDetail) ? (
                <button
                  className={styles.modalPrintBtn}
                  disabled
                  title="Receipt will be available after this sale syncs"
                >
                  <Receipt size={16} />
                  Receipt pending sync
                </button>
              ) : (
                <button
                  className={styles.modalPrintBtn}
                  onClick={() => {
                    const target = showDetail;
                    setShowDetail(null);
                    handlePrintReceipt(target);
                  }}
                >
                  <Receipt size={16} />
                  View Receipt
                </button>
              )}
              <button
                className={styles.modalCloseBtn}
                onClick={() => setShowDetail(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal (kept for future use) */}
      {showReceipt && (
        <div
          className={styles.receiptOverlay}
          onClick={() => setShowReceipt(null)}
        >
          <div
            className={styles.receiptModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.receiptHeader}>
              <h3>Receipt</h3>
              <button
                className={styles.receiptClose}
                onClick={() => setShowReceipt(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className={styles.receiptContent}>
              <pre className={styles.receiptText}>{showReceipt.text}</pre>
            </div>
            <div className={styles.receiptActions}>
              <button
                className={styles.receiptPrintBtn}
                onClick={() => window.print()}
              >
                <Printer size={16} />
                Print
              </button>
              <button
                className={styles.receiptCloseBtn}
                onClick={() => setShowReceipt(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sales;