// src/pages/Sales/Sales.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import toast from 'react-hot-toast';
import {
  Search, Filter, Eye, ChevronLeft, ChevronRight,
  DollarSign, ShoppingBag, Users, FileText, Printer,
  RefreshCw, Clock, CheckCircle, XCircle, AlertCircle,
  Receipt, Copy, Check, User, Building2, CreditCard, X,
  Banknote, Smartphone, CloudOff, RotateCw, WifiOff, 
} from 'lucide-react';
import axios from 'axios';
import {
  getAllLocalSalesForBranch,
  getLocalSaleFormatted,
  getLocalSaleByServerId,
  retryLocalSale,
  getPendingSalesCount,
  getFailedSalesCount
} from '../../db/sqlite';
import styles from './Sales.module.css';

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------
const POLL_INTERVAL_IDLE_MS = 30000;     // normal background refresh
const POLL_INTERVAL_PENDING_MS = 8000;   // faster refresh while anything is pending/failed
const SEARCH_DEBOUNCE_MS = 400;
const SYNC_EVENT_NAME = 'kxtill:sync-complete';

const paymentMethodOf = (sale) => {
  if (sale.paymentMethod) return sale.paymentMethod;
  if (sale.payments && sale.payments.length > 0) return sale.payments[0].method;
  return null;
};

const referenceOf = (sale) => {
  if (sale.reference) return sale.reference;
  if (sale.id) return sale.id.slice(-8).toUpperCase();
  return 'N/A';
};

const itemsCountOf = (sale) => {
  if (typeof sale.itemsCount === 'number') return sale.itemsCount;
  if (Array.isArray(sale.items)) return sale.items.length;
  return 0;
};

const applyClientFilters = (items, { statusFilter, paymentFilter, searchTerm }) => {
  let result = items;

  if (statusFilter && statusFilter !== 'all') {
    const target = statusFilter.toUpperCase();
    result = result.filter(sale => (sale.status || '').toUpperCase() === target);
  }

  if (paymentFilter && paymentFilter !== 'all') {
    const target = paymentFilter.toUpperCase();
    result = result.filter(sale => (paymentMethodOf(sale) || '').toUpperCase() === target);
  }

  if (searchTerm && searchTerm.trim()) {
    const term = searchTerm.trim().toLowerCase();
    result = result.filter(sale => {
      const ref = referenceOf(sale).toLowerCase();
      const customer = (sale.customerName || '').toLowerCase();
      const id = (sale.id || '').toLowerCase();
      return ref.includes(term) || customer.includes(term) || id.includes(term);
    });
  }

  return result;
};

const isAbortError = (error) =>
  error?.name === 'CanceledError' || error?.name === 'AbortError' || axios.isCancel?.(error);

const Sales = () => {
  const navigate = useNavigate();
  const {
    activeOrganization,
    activeBranch,
    branches,

    accessToken,
    setActiveBranch,
    isOffline: contextIsOffline
  } = useAuth();

  // Use settings from SettingsContext
  const {

    formatCurrency,
    formatDate,
    formatDateTime,
  } = useSettings();

  // Raw merged (server + local) sales for the current branch/date scope.
  const [rawSales, setRawSales] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');

  const [branchFilter, setBranchFilter] = useState(() => activeBranch?.id || 'all');

  const [currentPage, setCurrentPage] = useState(1);
  const [userPermissions, setUserPermissions] = useState([]);
  const [hasAllBranches, setHasAllBranches] = useState(false);
  const [localPendingCount, setLocalPendingCount] = useState(0);
  const [localFailedCount, setLocalFailedCount] = useState(0);
  const [showReceipt, setShowReceipt] = useState(null);
  const [showDetail, setShowDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [isOnline, setIsOnline] = useState(!contextIsOffline);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [retryingIds, setRetryingIds] = useState(new Set());

  const orgId = activeOrganization?.id;
  const limit = 20;

  const isMountedRef = useRef(true);
  const fetchSalesControllerRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      fetchSalesControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setIsOnline(!contextIsOffline);
  }, [contextIsOffline]);

  useEffect(() => {
    setBranchFilter(activeBranch?.id || 'all');
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranch?.id]);

  useEffect(() => {
    const fetchPermissions = async () => {
      if (!orgId || !accessToken) return;
      try {
        const response = await axios.get(
          `/auth/me/dashboard?organizationId=${orgId}`
        );
        const data = response.data;
        setUserPermissions(data.permissions || []);
        setHasAllBranches(data.membership?.hasAllBranches || false);
      } catch (error) {
        console.error('Failed to fetch permissions:', error);
      }
    };
    fetchPermissions();
  }, [orgId, accessToken]);

  const isOwner = userPermissions.includes('*');
  const canViewAllBranches = hasAllBranches || isOwner;
  const availableBranches = useMemo(() => branches || [], [branches]);
  const showBranchFilter = canViewAllBranches && availableBranches.length > 1;

  const getActiveBranchName = useCallback(() => {
    if (canViewAllBranches && branchFilter === 'all') {
      return 'All Branches';
    }
    if (branchFilter !== 'all') {
      const branch = availableBranches.find(b => b.id === branchFilter);
      return branch?.name || 'Unknown Branch';
    }
    if (activeBranch) {
      return activeBranch.name;
    }
    return 'No Branch Selected';
  }, [canViewAllBranches, branchFilter, availableBranches, activeBranch]);

  const getActiveBranchId = useCallback(() => {
    if (branchFilter !== 'all') {
      return branchFilter;
    }
    if (activeBranch) {
      return activeBranch.id;
    }
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

  const mergeSales = useCallback((serverSales, localSales) => {
    const localMap = {};
    localSales.forEach(local => {
      const key = local.serverSaleId || local.id;
      localMap[key] = local;
    });

    const merged = serverSales.map(server => {
      const local = localMap[server.id] || localMap[server.clientSaleId];

      if (local) {
        return {
          ...server,
          isLocal: true,
          localStatus: local.localStatus || local.status,
          error: local.error,
          receiptText: local.receiptText,
        };
      }
      return { ...server, isLocal: false };
    });

    const serverIds = new Set(serverSales.map(s => s.id));
    const localOnly = localSales.filter(local =>
      !serverIds.has(local.serverSaleId) &&
      !serverIds.has(local.id) &&
      (local.localStatus === 'PENDING' || local.localStatus === 'FAILED')
    );

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

  const fetchSales = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    }

    fetchSalesControllerRef.current?.abort();
    const controller = new AbortController();
    fetchSalesControllerRef.current = controller;

    let serverSales = [];
    let localSales = [];
    const isCurrentlyOnline = !contextIsOffline && navigator.onLine;

    try {
      const params = {
        limit: 100,
        offset: 0,
        ...buildDateParams(),
      };

      const serverBranchId = getServerBranchId();
      if (serverBranchId) {
        params.branchId = serverBranchId;
      }

      if (isCurrentlyOnline) {
        try {
          const response = await axios.get(`/organizations/${orgId}/kxtill/sales`, {
            params,
            timeout: 10000,
            signal: controller.signal,
          });
          serverSales = response.data.items || [];
          if (!controller.signal.aborted) setLastSyncTime(new Date());
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
            hasLoadedOnceRef.current = true;
          }
        }
      } catch (localError) {
        console.error('Failed to load local sales:', localError);
        if (isMountedRef.current) setRawSales([]);
      }
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) setLoading(false);
    }
  }, [
    orgId, getActiveBranchId, getServerBranchId, fetchLocalCounts, mergeSales,
    buildDateParams, contextIsOffline
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

  const stats = useMemo(() => {
    const totalRevenue = filteredSales.reduce((sum, s) => sum + parseFloat(s.totalAmount || 0), 0);
    return {
      totalSales: filteredSales.length,
      totalRevenue,
      averageOrderValue: filteredSales.length > 0 ? totalRevenue / filteredSales.length : 0,
      uniqueCustomers: new Set(filteredSales.map(s => s.customerName || 'Walk-in Customer')).size,
    };
  }, [filteredSales]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    const handle = setTimeout(() => setSearchTerm(searchInput), SEARCH_DEBOUNCE_MS);
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

  useEffect(() => {
    if (!isOnline || contextIsOffline) return;

    const hasPendingWork = localPendingCount > 0 || localFailedCount > 0;
    const intervalMs = hasPendingWork ? POLL_INTERVAL_PENDING_MS : POLL_INTERVAL_IDLE_MS;

    const interval = setInterval(() => {
      if (navigator.onLine && !contextIsOffline) {
        handleRefresh();
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isOnline, contextIsOffline, handleRefresh, localPendingCount, localFailedCount]);

  useEffect(() => {
    const onOnline = () => { if (orgId) handleRefresh(); };
    const onSyncComplete = () => { if (orgId) handleRefresh(); };

    window.addEventListener('online', onOnline);
    window.addEventListener(SYNC_EVENT_NAME, onSyncComplete);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener(SYNC_EVENT_NAME, onSyncComplete);
    };
  }, [orgId, handleRefresh]);

  const handleSearch = () => {
    setSearchTerm(searchInput);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  const handleFilterChange = useCallback((type, value) => {
    switch (type) {
      case 'status':
        setStatusFilter(value);
        break;
      case 'payment':
        setPaymentFilter(value);
        break;
      case 'date':
        setDateRange(value);
        break;
      case 'branch': {
        setBranchFilter(value);
        if (canViewAllBranches && value !== 'all') {
          const selectedBranch = availableBranches.find(b => b.id === value);
          if (selectedBranch) {
            setActiveBranch(selectedBranch);
          }
        }
        break;
      }
      default:
        break;
    }
  }, [canViewAllBranches, availableBranches, setActiveBranch]);

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

    setRetryingIds(prev => new Set(prev).add(saleId));
    try {
      toast.loading('Retrying sync...', { id: 'retry' });
      await retryLocalSale(saleId);
      toast.success('Sale re-queued for sync', { id: 'retry' });
      fetchSales();
    } catch (error) {
      toast.error(error.message || 'Failed to retry', { id: 'retry' });
    } finally {
      setRetryingIds(prev => {
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
      let localSale = await getLocalSaleFormatted(saleId);

      if (!localSale) {
        localSale = await getLocalSaleByServerId(saleId);
      }

      if (localSale) {
        setShowDetail(localSale);
        setDetailLoading(false);
        return;
      }

      const response = await axios.get(
        `/organizations/${orgId}/kxtill/sales/${saleId}`
      );
      setShowDetail(response.data.sale);
    } catch (error) {
      console.error('Error fetching sale detail:', error);
      toast.error('Failed to load sale details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handlePrintReceipt = async (saleId) => {
    if (!orgId) return;
    try {
      let localSale = await getLocalSaleByServerId(saleId);

      if (!localSale) {
        localSale = await getLocalSaleFormatted(saleId);
      }

      if (localSale && localSale.receiptText) {
        setShowReceipt({ text: localSale.receiptText, data: {} });
        return;
      }

      toast.loading('Loading receipt...', { id: 'receipt' });
      const response = await axios.get(
        `/organizations/${orgId}/kxtill/sales/${saleId}/receipt`
      );

      setShowReceipt(response.data);
      toast.dismiss('receipt');
    } catch (error) {
      console.error('Error fetching receipt:', error);
      toast.error('Failed to load receipt', { id: 'receipt' });
    }
  };

  const handlePrint = () => {
    const receiptText = showReceipt?.text;
    if (!receiptText) return;

    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) {
      toast.error('Please allow popups for this site');
      return;
    }

    win.document.write(`
      <html>
        <head>
          <title>Receipt</title>
          <style>
            body {
              font-family: 'Courier New', monospace;
              padding: 20px;
              max-width: 350px;
              margin: 0 auto;
              background: #fff;
              color: #000;
            }
            pre {
              white-space: pre-wrap;
              font-family: 'Courier New', monospace;
              font-size: 13px;
              margin: 0;
            }
            .actions {
              text-align: center;
              margin-top: 20px;
            }
            .actions button {
              padding: 8px 20px;
              font-size: 14px;
              cursor: pointer;
              margin: 0 4px;
              border: 1px solid #ccc;
              border-radius: 4px;
              background: #f5f5f5;
            }
            .actions button:hover {
              background: #e5e5e5;
            }
            @media print {
              .actions { display: none; }
            }
          </style>
        </head>
        <body>
          <pre>${receiptText}</pre>
          <div class="actions">
            <button onclick="window.print()">Print</button>
            <button onclick="window.close()">Close</button>
          </div>
        </body>
      </html>
    `);
    win.document.close();
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
    if (branchFilter !== 'all') count++;
    if (searchTerm && searchTerm.trim()) count++;
    return count;
  };

  const getStatusBadgeWithLocal = (sale) => {
    if (sale.isLocal) {
      const statusMap = {
        'PENDING': { label: 'Pending Sync', className: styles.statusPending, icon: Clock },
        'SYNCED': { label: 'Synced', className: styles.statusSynced, icon: CheckCircle },
        'FAILED': { label: 'Sync Failed', className: styles.statusFailed, icon: XCircle },
      };
      const match = statusMap[sale.localStatus] || statusMap['PENDING'];
      return match;
    }

    const statusMap = {
      'COMPLETED': { label: 'Completed', className: styles.statusCompleted, icon: CheckCircle },
      'PAID': { label: 'Paid', className: styles.statusCompleted, icon: CheckCircle },
      'PENDING': { label: 'Pending', className: styles.statusPending, icon: Clock },
      'REFUNDED': { label: 'Refunded', className: styles.statusRefunded, icon: XCircle },
      'VOIDED': { label: 'Voided', className: styles.statusVoided, icon: XCircle },
      'CANCELLED': { label: 'Cancelled', className: styles.statusVoided, icon: XCircle }
    };
    const match = statusMap[sale.status] || statusMap['PENDING'];
    return match;
  };

  // REMOVED: formatCurrency function (now using from SettingsContext)
  // REMOVED: formatDate function (now using from SettingsContext)

  const getPaymentMethod = (method) => {
    const methodMap = {
      'CASH': { icon: Banknote, label: 'Cash' },
      'MPESA': { icon: Smartphone, label: 'M-PESA' },
      'CARD': { icon: CreditCard, label: 'Card' },
      'BANK': { icon: Building2, label: 'Bank Transfer' },
      'MOBILE': { icon: Smartphone, label: 'Mobile Money' }
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
    <div className={styles.salesPage}>
      {/* Branch Card */}
      <div className={styles.branchCard}>
        <div className={styles.branchCardContent}>
          <Building2 size={20} className={styles.branchCardIcon} />
          <div className={styles.branchCardInfo}>
            <span className={styles.branchCardLabel}>Current View</span>
            <span className={styles.branchCardName}>{getActiveBranchName()}</span>
          </div>
          {showOffline && (
            <span className={styles.offlineBadge}>
              <WifiOff size={12} />
              Offline
            </span>
          )}
          {isOwner && (
            <span className={styles.ownerBadge}>Owner</span>
          )}
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

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconTotal}`}>
            <ShoppingBag size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Sales</span>
            <span className={styles.statValue}>{stats.totalSales}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconRevenue}`}>
            <DollarSign size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Revenue</span>
            <span className={styles.statValue}>{formatCurrency(stats.totalRevenue)}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconAvg}`}>
            <FileText size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Avg. Order Value</span>
            <span className={styles.statValue}>{formatCurrency(stats.averageOrderValue)}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconCustomers}`}>
            <Users size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Unique Customers</span>
            <span className={styles.statValue}>{stats.uniqueCustomers}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filtersBar}>
        <div className={styles.searchWrapper}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search by reference or customer name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyPress={handleKeyPress}
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
            <RefreshCw size={16} className={isRefreshing ? styles.spinning : ''} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            className={styles.filterBtn}
            onClick={handleSearch}
          >
            <Filter size={16} />
            Apply
            {getActiveFilterCount() > 0 && (
              <span className={styles.filterBadge}>{getActiveFilterCount()}</span>
            )}
          </button>

          {getActiveFilterCount() > 0 && (
            <button
              className={styles.clearFiltersBtn}
              onClick={clearFilters}
            >
              Clear All
            </button>
          )}
        </div>
      </div>

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
                  style={{ marginTop: getActiveFilterCount() > 0 ? '8px' : '12px' }}
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
                {isRefreshing && (
                  <span className={styles.lastSyncTime}>
                    {' '}• <RefreshCw size={11} className={styles.spinning} style={{ display: 'inline', verticalAlign: 'middle' }} /> refreshing…
                  </span>
                )}
              </span>
              {showOffline && (
                <span className={styles.offlineIndicator}>
                  <WifiOff size={14} />
                  Offline Mode
                </span>
              )}
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
                  const isLocal = sale.isLocal || false;
                  const isRetrying = retryingIds.has(sale.id);

                  return (
                    <tr key={sale.id} className={`${styles.tableRow} ${isLocal ? styles.localRow : ''}`}>
                      <td className={styles.referenceCell}>
                        <div className={styles.referenceWrapper}>
                          <span className={styles.referenceNumber}>
                            {reference}
                          </span>
                          {isLocal && (
                            <span className={styles.localBadge} title="Offline Sale">
                              <CloudOff size={12} />
                            </span>
                          )}
                          <button
                            className={styles.copyBtn}
                            onClick={() => handleCopyReference(reference, sale.id)}
                            title="Copy reference"
                          >
                            {copiedId === sale.id ? <Check size={12} /> : <Copy size={12} />}
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
                          {isLocal && (
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
                        <span className={`${styles.statusBadge} ${status.className}`}>
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
                            onClick={() => handlePrintReceipt(sale.id)}
                            title="Print Receipt"
                          >
                            <Receipt size={16} />
                          </button>
                          {isLocal && sale.localStatus === 'FAILED' && (
                            <button
                              className={styles.retryBtn}
                              onClick={() => handleRetryLocalSale(sale.id)}
                              disabled={isRetrying}
                              title="Retry Sync"
                            >
                              {isRetrying ? (
                                <RefreshCw size={16} className={styles.spinning} />
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  className={styles.pageBtn}
                  onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
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
                  onClick={() => handlePageChange(Math.min(currentPage + 1, totalPages))}
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
        <div className={styles.modalOverlay} onClick={() => setShowDetail(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <FileText size={18} />
                <span>Sale Details</span>
                {showDetail.isLocal && (
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
                          <span className={`${styles.statusBadge} ${status.className}`}>
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
                      <span>{showDetail.user?.firstName || 'Offline'} {showDetail.user?.lastName || 'Sale'}</span>
                    </div>
                    <div className={styles.detailMetaItem}>
                      <Building2 size={14} />
                      <span>{showDetail.branch?.name || getActiveBranchName()}</span>
                    </div>
                    <div className={styles.detailMetaItem}>
                      <Users size={14} />
                      <span>{showDetail.customerName || 'Walk-in Customer'}</span>
                    </div>
                    {showDetail.isLocal && showDetail.localStatus === 'FAILED' && (
                      <div className={styles.detailMetaItem}>
                        <AlertCircle size={14} />
                        <span className={styles.errorText}>Sync Failed: {showDetail.error || 'Unknown error'}</span>
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
                            <td>{item.product?.name || item.productName || 'Unknown'}</td>
                            <td>{item.quantity}</td>
                            <td>{item.unitName || item.unitAbbrev}</td>
                            <td>{formatCurrency(item.unitPrice)}</td>
                            <td>{formatCurrency(item.total)}</td>
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
                    {parseFloat(showDetail.taxAmount) > 0 && (
                      <div className={styles.detailTotalRow}>
                        <span>Tax</span>
                        <span>{formatCurrency(showDetail.taxAmount)}</span>
                      </div>
                    )}
                    {parseFloat(showDetail.discount) > 0 && (
                      <div className={styles.detailTotalRow}>
                        <span>Discount</span>
                        <span>-{formatCurrency(showDetail.discount)}</span>
                      </div>
                    )}
                    <div className={`${styles.detailTotalRow} ${styles.detailGrandTotal}`}>
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

                  {showDetail.status === 'REFUNDED' && showDetail.refundedByUser && (
                    <div className={styles.detailRefund}>
                      <XCircle size={14} />
                      <span>
                        Refunded by {showDetail.refundedByUser.firstName} {showDetail.refundedByUser.lastName}
                        {' '}on {formatDate(showDetail.refundedAt)}
                      </span>
                    </div>
                  )}

                  {showDetail.isLocal && showDetail.localStatus === 'FAILED' && (
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
                            <RefreshCw size={16} className={styles.spinning} />
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
              <button
                className={styles.modalPrintBtn}
                onClick={() => {
                  setShowDetail(null);
                  handlePrintReceipt(showDetail.id);
                }}
              >
                <Receipt size={16} />
                View Receipt
              </button>
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

      {/* Receipt Modal */}
      {showReceipt && (
        <div className={styles.receiptOverlay} onClick={() => setShowReceipt(null)}>
          <div className={styles.receiptModal} onClick={(e) => e.stopPropagation()}>
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
              <pre className={styles.receiptText}>
                {showReceipt.text}
              </pre>
            </div>
            <div className={styles.receiptActions}>
              <button
                className={styles.receiptPrintBtn}
                onClick={handlePrint}
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