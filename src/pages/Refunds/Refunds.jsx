// src/pages/Refunds/Refunds.jsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useSettings } from '../../contexts/SettingsContext';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FileText,
  RefreshCw,
  Clock,
  XCircle,
  AlertCircle,
  Receipt,
  Copy,
  Check,
  User,
  Building2,
  CreditCard,
  X,
  Banknote,
  Smartphone,
  WifiOff,
  TrendingDown,
  Layers,
  History,
  RotateCcw,
  Users
} from 'lucide-react';
import styles from './Refunds.module.css';

const Refunds = () => {
  const {
    activeOrganization,
    activeBranch,
    branches,
    setActiveBranch,
    isOffline: contextIsOffline,
  } = useAuth();

  const { isOwner, can, loading: permissionsLoading } = usePermissions();

  const {
    formatCurrency,
    formatDateTime,
  } = useSettings();

  // State
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [branchFilter, setBranchFilter] = useState(() => activeBranch?.id || 'all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isOnline, setIsOnline] = useState(!contextIsOffline);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [summary, setSummary] = useState(null);

  // Refund Modal State
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [refundProcessing, setRefundProcessing] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [refundReason, setRefundReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('ORIGINAL');
  const [refundError, setRefundError] = useState('');

  const isMountedRef = useRef(true);
  const fetchControllerRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);

  const orgId = activeOrganization?.id;
  const limit = 20;
  const canViewAllBranches = isOwner;
  const availableBranches = useMemo(() => branches || [], [branches]);
  const showBranchFilter = canViewAllBranches && availableBranches.length > 1;

  // Permission-derived flags
  const canRefund = isOwner || can('kxtill.sales.refund') || can('REFUND');
  const permissionsChecked = !permissionsLoading;

  // Helper functions
  const getServerBranchId = useCallback(() => {
    if (branchFilter !== 'all') return branchFilter;
    if (!canViewAllBranches) return activeBranch?.id || null;
    return null;
  }, [branchFilter, canViewAllBranches, activeBranch]);

  const getActiveBranchName = useCallback(() => {
    if (canViewAllBranches && branchFilter === 'all') {
      return 'All Branches';
    }
    if (branchFilter !== 'all') {
      const branch = availableBranches.find(b => b.id === branchFilter);
      return branch?.name || 'Unknown Branch';
    }
    return activeBranch?.name || 'No Branch Selected';
  }, [canViewAllBranches, branchFilter, availableBranches, activeBranch]);

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

  const getPaymentMethod = (method) => {
    const methodMap = {
      'CASH': { icon: Banknote, label: 'Cash' },
      'MPESA': { icon: Smartphone, label: 'M-PESA' },
      'CARD': { icon: CreditCard, label: 'Card' },
      'BANK': { icon: Building2, label: 'Bank Transfer' },
    };
    return methodMap[method] || { icon: CreditCard, label: method || 'N/A' };
  };

  const paymentMethodOf = (sale) => {
    if (sale.paymentMethod) return sale.paymentMethod;
    if (sale.payments?.length > 0) return sale.payments[0].method;
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

  const isAbortError = (error) =>
    error?.name === 'CanceledError' || error?.name === 'AbortError' || axios.isCancel?.(error);

  // Search sales
  const searchSales = useCallback(async () => {
    if (!orgId || !searchTerm.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setSearching(true);
    try {
      const params = {
        limit: 50,
        offset: 0,
        ...buildDateParams(),
        search: searchTerm.trim(),
      };

      const serverBranchId = getServerBranchId();
      if (serverBranchId) {
        params.branchId = serverBranchId;
      }

      const response = await axios.get(`/organizations/${orgId}/kxtill/sales`, {
        params,
        timeout: 10000,
      });

      const sales = response.data.items || [];
      const eligibleSales = sales.filter(s =>
        (s.status === 'COMPLETED' || s.status === 'PAID') &&
        s.status !== 'REFUNDED' &&
        s.status !== 'VOIDED'
      );

      setSearchResults(eligibleSales);
      setShowSearchResults(eligibleSales.length > 0);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
      setShowSearchResults(false);
    } finally {
      setSearching(false);
    }
  }, [orgId, searchTerm, buildDateParams, getServerBranchId]);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      searchSales();
    }, 400);
    return () => clearTimeout(handler);
  }, [searchSales]);

  // Fetch refunds
  const fetchRefunds = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    }

    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    try {
      const params = {
        limit: 100,
        offset: 0,
        ...buildDateParams(),
        status: 'REFUNDED',
      };

      const serverBranchId = getServerBranchId();
      if (serverBranchId) {
        params.branchId = serverBranchId;
      }

      const isCurrentlyOnline = !contextIsOffline && navigator.onLine;
      let refundedSales = [];

      if (isCurrentlyOnline) {
        try {
          const response = await axios.get(`/organizations/${orgId}/kxtill/sales`, {
            params,
            timeout: 10000,
            signal: controller.signal,
          });
          refundedSales = response.data.items || [];
          refundedSales = refundedSales.filter(s => s.status === 'REFUNDED');
        } catch (error) {
          if (isAbortError(error)) return;
          console.warn('Server fetch failed:', error.message);
        }
      }

      if (controller.signal.aborted || !isMountedRef.current) return;

      refundedSales.sort((a, b) =>
        new Date(b.refundedAt || b.updatedAt) - new Date(a.refundedAt || a.updatedAt)
      );

      setRefunds(refundedSales);
      hasLoadedOnceRef.current = true;

    } catch (error) {
      if (isAbortError(error)) return;
      console.error('Error fetching refunds:', error);
      if (isMountedRef.current) setRefunds([]);
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [orgId, contextIsOffline, buildDateParams, getServerBranchId]);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    if (!orgId) return;
    try {
      const params = { period: '30d' };
      const serverBranchId = getServerBranchId();
      if (serverBranchId) params.branchId = serverBranchId;

      const response = await axios.get(
        `/organizations/${orgId}/kxtill/dashboard/returns-summary`,
        { params }
      );
      if (isMountedRef.current) {
        setSummary(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch refund summary:', error);
    }
  }, [orgId, getServerBranchId]);

  // Apply filters
  const filteredRefunds = useMemo(() => {
    let result = refunds;

    if (statusFilter && statusFilter !== 'all') {
      const target = statusFilter.toUpperCase();
      result = result.filter(s => (s.status || '').toUpperCase() === target);
    }

    if (paymentFilter && paymentFilter !== 'all') {
      const target = paymentFilter.toUpperCase();
      result = result.filter(s => (paymentMethodOf(s) || '').toUpperCase() === target);
    }

    if (searchTerm && searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      result = result.filter(s => {
        const ref = referenceOf(s).toLowerCase();
        const customer = (s.customerName || '').toLowerCase();
        return ref.includes(term) || customer.includes(term);
      });
    }

    return result;
  }, [refunds, statusFilter, paymentFilter, searchTerm]);

  const totalItems = filteredRefunds.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));

  const paginatedRefunds = useMemo(() => {
    const start = (currentPage - 1) * limit;
    return filteredRefunds.slice(start, start + limit);
  }, [filteredRefunds, currentPage, limit]);

  const stats = useMemo(() => {
    const totalRefundAmount = filteredRefunds.reduce((sum, s) => sum + parseFloat(s.totalAmount || 0), 0);
    const uniqueCustomers = new Set(filteredRefunds.map(s => s.customerName || 'Walk-in Customer')).size;
    return {
      totalRefunds: filteredRefunds.length,
      totalRefundAmount,
      averageRefund: filteredRefunds.length > 0 ? totalRefundAmount / filteredRefunds.length : 0,
      uniqueCustomers,
    };
  }, [filteredRefunds]);

  // Effects
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      fetchControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setIsOnline(!contextIsOffline);
  }, [contextIsOffline]);

  useEffect(() => {
    setBranchFilter(activeBranch?.id || 'all');
    setCurrentPage(1);
  }, [activeBranch?.id]);

  useEffect(() => {
    hasLoadedOnceRef.current = false;
  }, [getServerBranchId, dateRange]);

  useEffect(() => {
    if (orgId) {
      fetchRefunds();
      fetchSummary();
    }
  }, [fetchRefunds, fetchSummary, orgId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, paymentFilter, searchTerm, branchFilter, dateRange]);

  // Auto-refresh
  useEffect(() => {
    if (!isOnline || contextIsOffline) return;

    const interval = setInterval(() => {
      if (navigator.onLine && !contextIsOffline) {
        fetchRefunds();
        fetchSummary();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isOnline, contextIsOffline, fetchRefunds, fetchSummary]);

  // Handlers
  const handleRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    Promise.all([fetchRefunds(), fetchSummary()])
      .then(() => toast.success('Refreshed successfully'))
      .catch(() => toast.error('Failed to refresh'))
      .finally(() => {
        if (isMountedRef.current) setIsRefreshing(false);
      });
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  const handleFilterChange = (type, value) => {
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
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setPaymentFilter('all');
    setDateRange('all');
    setBranchFilter(activeBranch?.id || 'all');
    setSearchInput('');
    setSearchTerm('');
    setCurrentPage(1);
    setShowSearchResults(false);
    setSearchResults([]);
  };

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setSearchTerm(searchInput);
    }
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSearchTerm('');
    setSearchResults([]);
    setShowSearchResults(false);
  };

  // Refund handlers
  const handleInitiateRefund = (sale) => {
    if (!canRefund) {
      toast.error('You do not have permission to process refunds');
      return;
    }

    setSelectedSale(sale);
    setSelectedItems(sale.items?.map(item => item.id) || []);
    setRefundReason('');
    setRefundMethod('ORIGINAL');
    setRefundError('');
    setShowRefundModal(true);
  };

  const handleToggleItem = (itemId) => {
    setSelectedItems(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(id => id !== itemId);
      }
      return [...prev, itemId];
    });
  };

  const handleSelectAll = () => {
    if (!selectedSale) return;
    if (selectedItems.length === selectedSale.items?.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(selectedSale.items.map(item => item.id));
    }
  };

  const handleProcessRefund = async () => {
    if (!selectedSale || !orgId) {
      toast.error('Invalid sale selection');
      return;
    }

    if (selectedItems.length === 0) {
      setRefundError('Please select at least one item to refund');
      return;
    }

    if (selectedSale.status === 'REFUNDED') {
      setRefundError('This sale has already been refunded');
      return;
    }

    if (!canRefund) {
      setRefundError('You do not have permission to process refunds');
      return;
    }

    setRefundError('');
    setRefundProcessing(true);

    try {
      const refundData = {
        items: selectedItems,
        reason: refundReason || 'Customer request',
        refundMethod: refundMethod,
      };

      await axios.post(
        `/organizations/${orgId}/kxtill/sales/${selectedSale.id}/refund`,
        refundData
      );

      toast.success('Refund processed successfully!');

      setShowRefundModal(false);
      setSelectedSale(null);
      setSelectedItems([]);
      setRefundReason('');
      setRefundMethod('ORIGINAL');
      setRefundError('');

      await Promise.all([fetchRefunds(), fetchSummary()]);

      if (searchTerm.trim()) {
        searchSales();
      }

    } catch (error) {
      console.error('Refund error:', error);

      if (error.response?.status === 403) {
        setRefundError('You do not have permission to process refunds');
      } else if (error.response?.status === 400) {
        setRefundError(error.response?.data?.message || 'Invalid refund request');
      } else if (error.response?.status === 404) {
        setRefundError('Sale not found or already refunded');
      } else if (error.response?.status === 500) {
        setRefundError('Server error processing refund. Please try again.');
      } else {
        setRefundError(error.response?.data?.message || 'Failed to process refund');
      }
    } finally {
      setRefundProcessing(false);
    }
  };

  const handleViewDetail = async (saleId) => {
    if (!orgId) return;
    setDetailLoading(true);
    try {
      const response = await axios.get(
        `/organizations/${orgId}/kxtill/sales/${saleId}`
      );
      setShowDetail(response.data.sale);
    } catch (error) {
      console.error('Error fetching sale detail:', error);
      toast.error('Failed to load refund details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handlePrintReceipt = async (saleId) => {
    if (!orgId) return;
    try {
      toast.loading('Loading receipt...', { id: 'receipt' });
      const response = await axios.get(
        `/organizations/${orgId}/kxtill/sales/${saleId}/receipt`
      );
      const receiptText = response.data.text || 'No receipt available';
      const win = window.open('', '_blank', 'width=400,height=600');
      if (!win) {
        toast.error('Please allow popups for this site');
        toast.dismiss('receipt');
        return;
      }
      win.document.write(`
        <html>
          <head>
            <title>Receipt</title>
            <style>
              body { font-family: 'Courier New', monospace; padding: 20px; max-width: 350px; margin: 0 auto; background: #fff; color: #000; }
              pre { white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 13px; margin: 0; }
              .actions { text-align: center; margin-top: 20px; }
              .actions button { padding: 8px 20px; font-size: 14px; cursor: pointer; margin: 0 4px; border: 1px solid #ccc; border-radius: 4px; background: #f5f5f5; }
              .actions button:hover { background: #e5e5e5; }
              @media print { .actions { display: none; } }
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
      toast.dismiss('receipt');
    } catch (error) {
      console.error('Error fetching receipt:', error);
      toast.error('Failed to load receipt', { id: 'receipt' });
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
    if (branchFilter !== 'all') count++;
    if (searchTerm && searchTerm.trim()) count++;
    return count;
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
          <div className={styles.headerTitle}>
            <RotateCcw size={20} />
            <h1>Refunds</h1>
          </div>
          <span className={styles.headerSubtitle}>
            {getActiveBranchName()}
          </span>
        </div>
        <div className={styles.headerRight}>
          {!isOnline && (
            <span className={styles.offlineBadge}>
              <WifiOff size={14} />
              Offline
            </span>
          )}
          {isOwner && (
            <span className={styles.ownerBadge}>Owner</span>
          )}
          {!canRefund && permissionsChecked && (
            <span className={styles.permissionBadge}>View Only</span>
          )}
        </div>
      </div>

      {/* Permission Notice */}
      {!canRefund && permissionsChecked && (
        <div className={styles.permissionNotice}>
          <AlertCircle size={16} />
          <span>You have view-only access. Contact your administrator for refund permissions.</span>
        </div>
      )}

      {/* Search Card */}
      <div className={styles.searchCard}>
        <div className={styles.searchCardHeader}>
          <RotateCcw size={16} className={styles.searchCardIcon} />
          <span>Search for a sale to refund</span>
          <span className={styles.searchCardHint}>
            Search by reference, customer name, or invoice number
          </span>
        </div>
        <div className={styles.searchCardInput}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            placeholder={canRefund ? "Enter reference, customer name, or invoice #..." : "Search sales (view only)"}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyPress={handleSearchKeyPress}
            className={styles.searchInputField}
            disabled={!canRefund}
          />
          {searchInput && (
            <button className={styles.clearSearchBtn} onClick={handleClearSearch}>
              <X size={16} />
            </button>
          )}
          {searching && <RefreshCw size={16} className={styles.spinning} />}
        </div>

        {/* Search Results */}
        {showSearchResults && searchResults.length > 0 && (
          <div className={styles.searchResults}>
            <div className={styles.searchResultsHeader}>
              <span>Found {searchResults.length} eligible sale{searchResults.length > 1 ? 's' : ''}</span>
              <button
                className={styles.clearResultsBtn}
                onClick={handleClearSearch}
              >
                Clear results
              </button>
            </div>
            {searchResults.map((sale) => (
              <div key={sale.id} className={styles.searchResultItem}>
                <div className={styles.searchResultInfo}>
                  <span className={styles.searchResultRef}>{referenceOf(sale)}</span>
                  <span className={styles.searchResultCustomer}>
                    {sale.customerName || 'Walk-in Customer'}
                  </span>
                  <span className={styles.searchResultDate}>
                    {formatDateTime(sale.createdAt)}
                  </span>
                  <span className={styles.searchResultAmount}>
                    {formatCurrency(sale.totalAmount)}
                  </span>
                  <span className={styles.searchResultBranch}>
                    {sale.branch?.name || 'N/A'}
                  </span>
                </div>
                {canRefund ? (
                  <button
                    className={styles.refundActionBtn}
                    onClick={() => handleInitiateRefund(sale)}
                  >
                    <RotateCcw size={14} />
                    Refund
                  </button>
                ) : (
                  <span className={styles.noPermissionBadge}>View Only</span>
                )}
              </div>
            ))}
          </div>
        )}

        {showSearchResults && searchResults.length === 0 && !searching && searchTerm.trim() && (
          <div className={styles.noResults}>
            <AlertCircle size={24} />
            <span>No eligible sales found. Try adjusting your search.</span>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.summaryIconTotal}`}>
            <TrendingDown size={20} />
          </div>
          <div className={styles.summaryInfo}>
            <span className={styles.summaryLabel}>Total Refunds</span>
            <span className={styles.summaryValue}>{summary?.totalReturns || 0}</span>
            {summary && (
              <span className={styles.summarySubtext}>
                {summary.returnRate?.toFixed(1)}% return rate
              </span>
            )}
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.summaryIconAmount}`}>
            <DollarSign size={20} />
          </div>
          <div className={styles.summaryInfo}>
            <span className={styles.summaryLabel}>Refund Amount</span>
            <span className={styles.summaryValue}>
              {formatCurrency(summary?.totalAmount || 0)}
            </span>
            <span className={styles.summarySubtext}>
              {summary?.thisMonth || 0} this month
            </span>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.summaryIconAvg}`}>
            <FileText size={20} />
          </div>
          <div className={styles.summaryInfo}>
            <span className={styles.summaryLabel}>Avg. Refund Value</span>
            <span className={styles.summaryValue}>
              {formatCurrency(stats.averageRefund)}
            </span>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.summaryIconCustomers}`}>
            <Users size={20} />
          </div>
          <div className={styles.summaryInfo}>
            <span className={styles.summaryLabel}>Customers</span>
            <span className={styles.summaryValue}>{stats.uniqueCustomers}</span>
          </div>
        </div>
      </div>

      {/* Top Returned Products */}
      {summary?.topReturnedProducts?.length > 0 && (
        <div className={styles.topProductsCard}>
          <div className={styles.topProductsHeader}>
            <Layers size={16} />
            <span>Top Returned Products</span>
          </div>
          <div className={styles.topProductsList}>
            {summary.topReturnedProducts.map((product, index) => (
              <div key={index} className={styles.topProductItem}>
                <span className={styles.topProductRank}>{index + 1}</span>
                <span className={styles.topProductName}>{product.name}</span>
                <span className={styles.topProductCount}>{product.count} returns</span>
                <span className={styles.topProductTotal}>{formatCurrency(product.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className={styles.filtersBar}>
        <div className={styles.filterGroup}>
          {showBranchFilter && (
            <select
              value={branchFilter}
              onChange={(e) => handleFilterChange('branch', e.target.value)}
              className={styles.filterSelect}
            >
              <option value="all">All Branches</option>
              {availableBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={statusFilter}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className={styles.filterSelect}
          >
            <option value="all">All Status</option>
            <option value="refunded">Refunded</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
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
            title="Refresh"
          >
            <RefreshCw size={16} className={isRefreshing ? styles.spinning : ''} />
            {isRefreshing ? '...' : 'Refresh'}
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

      {/* Refunds Table */}
      <div className={styles.tableContainer}>
        {showSkeleton ? (
          <div className={styles.loadingState}>
            <RefreshCw size={32} className={styles.spinning} />
            <p>Loading refunds...</p>
          </div>
        ) : paginatedRefunds.length === 0 ? (
          <div className={styles.emptyState}>
            <History size={48} />
            <h3>No refunds found</h3>
            <p>
              {getActiveFilterCount() > 0
                ? 'Try adjusting your filters to see more results'
                : 'No refunds have been processed yet. Use the search above to find and refund a sale.'}
            </p>
            {getActiveFilterCount() > 0 && (
              <button
                className={styles.clearFiltersBtnLarge}
                onClick={clearFilters}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className={styles.tableHeader}>
              <span className={styles.tableInfo}>
                Showing {paginatedRefunds.length} of {totalItems} refunds
              </span>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Refunded By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRefunds.map((sale) => {
                  const payment = getPaymentMethod(paymentMethodOf(sale));
                  const PaymentIcon = payment.icon;
                  const reference = referenceOf(sale);

                  return (
                    <tr key={sale.id} className={styles.tableRow}>
                      <td className={styles.referenceCell}>
                        <div className={styles.referenceWrapper}>
                          <span className={styles.referenceNumber}>
                            {reference}
                          </span>
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
                        {formatDateTime(sale.refundedAt || sale.updatedAt)}
                      </td>
                      <td>
                        <span className={styles.customerName}>
                          {sale.customerName || 'Walk-in Customer'}
                        </span>
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
                        <span className={styles.refundedBy}>
                          {sale.refundedByUser?.firstName || 'Unknown'}{' '}
                          {sale.refundedByUser?.lastName || ''}
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

      {/* Refund Modal */}
      {showRefundModal && selectedSale && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <RotateCcw size={18} className={styles.refundIcon} />
                <span>Process Refund</span>
                {selectedItems.length < selectedSale.items?.length && selectedItems.length > 0 && (
                  <span className={styles.partialBadge}>Partial Refund</span>
                )}
                {selectedSale.status === 'REFUNDED' && (
                  <span className={styles.refundedBadge}>Already Refunded</span>
                )}
              </div>
              <button
                className={styles.closeBtn}
                onClick={() => {
                  setShowRefundModal(false);
                  setSelectedSale(null);
                  setRefundError('');
                }}
                disabled={refundProcessing}
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.saleInfo}>
                <div className={styles.saleInfoRow}>
                  <span className={styles.saleInfoLabel}>Reference</span>
                  <span className={styles.saleInfoValue}>{referenceOf(selectedSale)}</span>
                </div>
                <div className={styles.saleInfoRow}>
                  <span className={styles.saleInfoLabel}>Customer</span>
                  <span className={styles.saleInfoValue}>{selectedSale.customerName || 'Walk-in Customer'}</span>
                </div>
                <div className={styles.saleInfoRow}>
                  <span className={styles.saleInfoLabel}>Date</span>
                  <span className={styles.saleInfoValue}>{formatDateTime(selectedSale.createdAt)}</span>
                </div>
                <div className={styles.saleInfoRow}>
                  <span className={styles.saleInfoLabel}>Branch</span>
                  <span className={styles.saleInfoValue}>{selectedSale.branch?.name || 'N/A'}</span>
                </div>
                <div className={styles.saleInfoRow}>
                  <span className={styles.saleInfoLabel}>Original Total</span>
                  <span className={styles.saleInfoValue}>{formatCurrency(selectedSale.totalAmount)}</span>
                </div>
                {selectedSale.status === 'REFUNDED' && (
                  <div className={`${styles.saleInfoRow} ${styles.alreadyRefunded}`}>
                    <span className={styles.saleInfoLabel}>Status</span>
                    <span className={styles.saleInfoValue}>Already Refunded</span>
                  </div>
                )}
              </div>

              {selectedSale.status !== 'REFUNDED' && (
                <>
                  <div className={styles.itemsSection}>
                    <div className={styles.itemsHeader}>
                      <span className={styles.itemsTitle}>Select items to refund</span>
                      <button className={styles.selectAllBtn} onClick={handleSelectAll}>
                        {selectedItems.length === selectedSale.items?.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>

                    <div className={styles.itemsList}>
                      {selectedSale.items?.map((item) => {
                        const isSelected = selectedItems.includes(item.id);
                        const itemTotal = parseFloat(item.total || 0);

                        return (
                          <div
                            key={item.id}
                            className={`${styles.itemRow} ${isSelected ? styles.selected : ''}`}
                            onClick={() => handleToggleItem(item.id)}
                          >
                            <div className={styles.itemCheck}>
                              <div className={`${styles.checkbox} ${isSelected ? styles.checked : ''}`}>
                                {isSelected && <Check size={12} />}
                              </div>
                            </div>
                            <div className={styles.itemInfo}>
                              <span className={styles.itemName}>
                                {item.product?.name || item.productName || 'Unknown'}
                              </span>
                              <span className={styles.itemDetails}>
                                {item.quantity} × {item.unitName || item.unitAbbrev}
                              </span>
                            </div>
                            <span className={styles.itemPrice}>
                              {formatCurrency(itemTotal)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className={styles.refundMethodSection}>
                    <label className={styles.methodLabel}>Refund Method</label>
                    <div className={styles.methodOptions}>
                      <button
                        className={`${styles.methodOption} ${refundMethod === 'ORIGINAL' ? styles.active : ''}`}
                        onClick={() => setRefundMethod('ORIGINAL')}
                      >
                        Original Payment
                      </button>
                      <button
                        className={`${styles.methodOption} ${refundMethod === 'CASH' ? styles.active : ''}`}
                        onClick={() => setRefundMethod('CASH')}
                      >
                        Cash
                      </button>
                      <button
                        className={`${styles.methodOption} ${refundMethod === 'MPESA' ? styles.active : ''}`}
                        onClick={() => setRefundMethod('MPESA')}
                      >
                        M-PESA
                      </button>
                      <button
                        className={`${styles.methodOption} ${refundMethod === 'CARD' ? styles.active : ''}`}
                        onClick={() => setRefundMethod('CARD')}
                      >
                        Card
                      </button>
                    </div>
                  </div>

                  <div className={styles.reasonSection}>
                    <label className={styles.reasonLabel}>Reason for Refund (Optional)</label>
                    <textarea
                      className={styles.reasonInput}
                      placeholder="e.g. Customer changed mind, Damaged product, etc."
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      rows={2}
                    />
                  </div>

                  {refundError && (
                    <div className={styles.errorMessage}>
                      <AlertCircle size={16} />
                      <span>{refundError}</span>
                    </div>
                  )}

                  <div className={styles.summarySection}>
                    <div className={styles.summaryRow}>
                      <span>Total Refund Amount</span>
                      <span className={styles.refundTotal}>
                        {formatCurrency(
                          selectedSale.items
                            ?.filter(item => selectedItems.includes(item.id))
                            .reduce((sum, item) => sum + parseFloat(item.total || 0), 0) || 0
                        )}
                      </span>
                    </div>
                    {selectedItems.length < selectedSale.items?.length && selectedItems.length > 0 && (
                      <div className={styles.summaryRow}>
                        <span className={styles.partialNote}>
                          <AlertCircle size={14} />
                          Partial refund - only selected items will be refunded
                        </span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {selectedSale.status === 'REFUNDED' && (
                <div className={styles.alreadyRefundedMessage}>
                  <AlertCircle size={24} />
                  <p>This sale has already been refunded.</p>
                  <span>Refunded on {formatDateTime(selectedSale.refundedAt)}</span>
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                className={styles.cancelBtn}
                onClick={() => {
                  setShowRefundModal(false);
                  setSelectedSale(null);
                  setRefundError('');
                }}
                disabled={refundProcessing}
              >
                Cancel
              </button>
              {selectedSale.status !== 'REFUNDED' && (
                <button
                  className={styles.refundBtn}
                  onClick={handleProcessRefund}
                  disabled={refundProcessing || selectedItems.length === 0}
                >
                  {refundProcessing ? (
                    <>
                      <span className={styles.spinner} />
                      Processing...
                    </>
                  ) : (
                    <>
                      <RotateCcw size={16} />
                      Process Refund
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && (
        <div className={styles.modalOverlay} onClick={() => setShowDetail(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <FileText size={18} />
                <span>Refund Details</span>
                <span className={styles.refundedBadge}>Refunded</span>
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
                      <span className={`${styles.statusBadge} ${styles.statusRefunded}`}>
                        <XCircle size={12} />
                        Refunded
                      </span>
                    </div>
                  </div>

                  <div className={styles.detailMeta}>
                    <div className={styles.detailMetaItem}>
                      <Clock size={14} />
                      <span>Refunded: {formatDateTime(showDetail.refundedAt || showDetail.updatedAt)}</span>
                    </div>
                    <div className={styles.detailMetaItem}>
                      <User size={14} />
                      <span>Refunded by: {showDetail.refundedByUser?.firstName || 'Unknown'} {showDetail.refundedByUser?.lastName || ''}</span>
                    </div>
                    <div className={styles.detailMetaItem}>
                      <Building2 size={14} />
                      <span>Branch: {showDetail.branch?.name || 'N/A'}</span>
                    </div>
                    <div className={styles.detailMetaItem}>
                      <Users size={14} />
                      <span>Customer: {showDetail.customerName || 'Walk-in Customer'}</span>
                    </div>
                  </div>

                  <div className={styles.detailItems}>
                    <h4>Refunded Items</h4>
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
                    <div className={`${styles.detailTotalRow} ${styles.detailGrandTotal}`}>
                      <span>Total Refunded</span>
                      <span className={styles.refundTotal}>{formatCurrency(showDetail.totalAmount)}</span>
                    </div>
                  </div>

                  {showDetail.payments && showDetail.payments.length > 0 && (
                    <div className={styles.detailPayments}>
                      <h4>Original Payment</h4>
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
                </>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                className={styles.modalPrintBtn}
                onClick={() => {
                  const id = showDetail.id;
                  setShowDetail(null);
                  handlePrintReceipt(id);
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
    </div>
  );
};

export default Refunds;