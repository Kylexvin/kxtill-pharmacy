// src/pages/Inventory/Inventory.jsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useSettings } from '../../contexts/SettingsContext';
import { KXTILL } from '../../constants/permissions';
import { sync } from '../../sync/engine';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  Package,
  Search,
  Edit,
  Eye,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  AlertCircle,
  AlertTriangle,
  Check,
  Clock,
  List,
  Grid,
  Pill,
  Building2,
  SlidersHorizontal,
  RotateCcw,
  Filter,
  Plus,
  Layers,
  CalendarClock,
} from 'lucide-react';
import styles from './Inventory.module.css';
import BranchProductModal from './components/BranchProductModal';
import ProductDetailModal from './components/ProductDetailModal';
import BranchStockModal from './components/BranchStockModal';
import ReceiveBatchModal from './components/ReceiveBatchModal';
import ProductBatchesModal from './components/ProductBatchesModal';
import usePolling from '../../hooks/usePolling';

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

const Inventory = () => {
  const { activeOrganization, activeBranch, isOffline: contextIsOffline } = useAuth();
  const { can } = usePermissions();
  const { formatCurrency } = useSettings();

  const canUpdate = can(KXTILL.INVENTORY.UPDATE);

  const orgId = activeOrganization?.id;
  const branchId = activeBranch?.id;

  // ============================================================
  // PHARMACY MODE
  // ============================================================
  const [isPharmacyOrg, setIsPharmacyOrg] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!orgId) return;

    (async () => {
      try {
        const res = await axios.get(`/products/organizations/${orgId}/products`);
        const products = res.data?.products || [];
        const kxtill = products.find((p) => p.productKey === 'kxtill');
        const hasPharmacy = (kxtill?.instances || []).some(
          (i) => i.vertical === 'pharmacy' && i.isActive !== false
        );
        if (!cancelled) setIsPharmacyOrg(hasPharmacy);
      } catch (err) {
        console.error('Failed to check pharmacy instance:', err);
        if (!cancelled) setIsPharmacyOrg(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // ============================================================
  // STATE
  // ============================================================
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [categories, setCategories] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isOnline, setIsOnline] = useState(!contextIsOffline);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('inventoryViewMode') || 'list'
  );

  // Modals
  const [showBranchProductModal, setShowBranchProductModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showReceiveBatchModal, setShowReceiveBatchModal] = useState(false);
  const [showBatchesModal, setShowBatchesModal] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [receiveBatchForProduct, setReceiveBatchForProduct] = useState(null);
  const [batchesModalProduct, setBatchesModalProduct] = useState(null);
  const [branchProductData, setBranchProductData] = useState({
    displayName: '',
    description: '',
    isAvailable: true,
  });

  const isMountedRef = useRef(true);
  const fetchControllerRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);
  const filterMenuRef = useRef(null);

  const limit = 20;

  // ============================================================
  // HELPERS
  // ============================================================
  const getStockStatus = (product) => {
    // Medicines with loaded batch info → expiry-aware
    if (product.pharmacyProduct && product.nearestExpiry) {
      const days = daysUntil(product.nearestExpiry);
      if (days !== null && days < 0) {
        return { label: 'Expired', variant: 'danger', icon: AlertTriangle };
      }
      if (days !== null && days <= 90) {
        return {
          label: `Expires in ${days}d`,
          variant: 'warning',
          icon: CalendarClock,
        };
      }
    }

    const stock = Number(product.stock || 0);
    const minStock = Number(product.minStock || 0);
    if (stock <= 0) {
      return { label: 'Out of Stock', variant: 'danger', icon: AlertCircle };
    }
    if (stock <= minStock) {
      return { label: 'Low Stock', variant: 'warning', icon: AlertTriangle };
    }
    return { label: 'In Stock', variant: 'success', icon: Check };
  };

  const stats = useMemo(() => {
    const total = products.length;
    let inStock = 0;
    let low = 0;
    let out = 0;
    let expiringSoon = 0;

    for (const p of products) {
      const stock = Number(p.stock || 0);
      const minStock = Number(p.minStock || 0);
      if (stock <= 0) out++;
      else if (stock <= minStock) low++;
      else inStock++;

      if (p.pharmacyProduct) {
        const days = daysUntil(p.nearestExpiry);
        if (days !== null && days >= 0 && days <= 90 && stock > 0) {
          expiringSoon++;
        }
      }
    }

    return { total, inStock, low, out, expiringSoon };
  }, [products]);

  // ============================================================
  // ENRICH MEDICINES WITH BATCH INFO (async, non-blocking)
  // ============================================================
  const enrichWithBatchInfo = useCallback(
    async (productList, signal) => {
      if (!orgId || !branchId) return;

      const medicines = productList.filter(
        (p) => p.pharmacyProduct && p.productId
      );
      if (medicines.length === 0) return;

      const results = await Promise.all(
        medicines.map(async (p) => {
          try {
            const res = await axios.get(
              `/organizations/${orgId}/kxtill/pharmacy/products/${p.productId}/batches`,
              { params: { branchId }, signal }
            );
            const batches = res.data?.batches || [];

            const inBranch = batches
              .map((b) => {
                const stockRow = (b.stocks || []).find(
                  (s) => s.branchId === branchId
                );
                return stockRow ? { batch: b, stock: stockRow } : null;
              })
              .filter(Boolean)
              .filter((x) => Number(x.stock.quantityOnHand) > 0);

            if (inBranch.length === 0) {
              return { id: p.id, batchCount: 0, nearestExpiry: null };
            }

            const sorted = [...inBranch].sort(
              (a, b) =>
                new Date(a.batch.expiryDate) - new Date(b.batch.expiryDate)
            );
            return {
              id: p.id,
              batchCount: inBranch.length,
              nearestExpiry: sorted[0].batch.expiryDate,
            };
          } catch (err) {
            return { id: p.id, batchCount: null, nearestExpiry: null };
          }
        })
      );

      if (signal?.aborted || !isMountedRef.current) return;

      const byId = Object.fromEntries(results.map((r) => [r.id, r]));

      setProducts((prev) =>
        prev.map((p) => {
          const info = byId[p.id];
          if (!info) return p;
          return {
            ...p,
            batchCount: info.batchCount,
            nearestExpiry: info.nearestExpiry,
          };
        })
      );
    },
    [orgId, branchId]
  );

  // ============================================================
  // FETCH PRODUCTS
  // ============================================================
  const fetchProducts = useCallback(async () => {
    if (!orgId || !branchId) {
      setLoading(false);
      return;
    }

    if (!hasLoadedOnceRef.current) setLoading(true);

    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    try {
      const params = { limit: 100, offset: 0 };
      if (searchTerm) params.search = searchTerm;
      if (categoryFilter !== 'all') params.category = categoryFilter;
      if (showUnavailable) params.includeUnavailable = 'true';

      const endpoint = `/organizations/${orgId}/kxtill/branches/${branchId}/products`;

      const isCurrentlyOnline = !contextIsOffline && navigator.onLine;
      let productData = [];

      if (isCurrentlyOnline) {
        try {
          const response = await axios.get(endpoint, {
            params,
            timeout: 10000,
            signal: controller.signal,
          });
          productData = response.data.items || [];
        } catch (error) {
          if (error.name === 'CanceledError' || error.name === 'AbortError')
            return;
          console.warn('Branch fetch failed:', error.message);
        }
      }

      if (controller.signal.aborted || !isMountedRef.current) return;

      const transformed = productData.map((p) => {
        const baseUnit = p.baseUnit || {};
        return {
          id: p.id,
          branchProductId: p.id,
          productId: p.productId,
          productName: p.productName || p.name,
          name: p.displayName || p.productName || p.name,
          displayName: p.displayName,
          description: p.description,
          sku: p.sku || '-',
          category: p.category || '-',
          stock: Number(p.stock) || 0,
          minStock: Number(p.minStock) || 0,
          isAvailable: p.isAvailable !== false,
          unit: baseUnit.abbreviation || baseUnit.name || 'units',
          unitName: baseUnit.name || 'units',
          price: parseFloat(baseUnit.price) || 0,
          baseUnit,
          units: p.units || [],
          // ← source of truth for medicine detection
          pharmacyProduct: p.pharmacyProduct || null,
          // ← filled async, does NOT drive isMedicine
          batchCount: undefined,
          nearestExpiry: undefined,
        };
      });

      let filtered = transformed;
      if (statusFilter === 'in-stock') {
        filtered = filtered.filter((p) => p.stock > p.minStock);
      } else if (statusFilter === 'low-stock') {
        filtered = filtered.filter((p) => p.stock > 0 && p.stock <= p.minStock);
      } else if (statusFilter === 'out-of-stock') {
        filtered = filtered.filter((p) => p.stock <= 0);
      }

      setProducts(filtered);
      hasLoadedOnceRef.current = true;

      // Async batch enrichment — never blocks render, never changes isMedicine
      if (isPharmacyOrg) {
        enrichWithBatchInfo(filtered, controller.signal);
      }

      const uniqueCategories = [
        ...new Set(productData.map((p) => p.category).filter(Boolean)),
      ];
      setCategories(uniqueCategories);
    } catch (error) {
      if (error.name === 'CanceledError' || error.name === 'AbortError')
        return;
      console.error('Error fetching branch products:', error);
      if (isMountedRef.current) setProducts([]);
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) setLoading(false);
    }
  }, [
    orgId,
    branchId,
    searchTerm,
    categoryFilter,
    statusFilter,
    showUnavailable,
    contextIsOffline,
    isPharmacyOrg,
    enrichWithBatchInfo,
  ]);

  // ============================================================
  // EFFECTS
  // ============================================================
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
    localStorage.setItem('inventoryViewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('inventoryShowUnavailable', String(showUnavailable));
  }, [showUnavailable]);

  useEffect(() => {
    const stored = localStorage.getItem('inventoryShowUnavailable');
    if (stored === 'true') setShowUnavailable(true);
  }, []);

  useEffect(() => {
    hasLoadedOnceRef.current = false;
    setCurrentPage(1);
  }, [branchId, categoryFilter, statusFilter, showUnavailable]);

  useEffect(() => {
    if (!orgId || !branchId) return;
    fetchProducts();
  }, [
    orgId,
    branchId,
    searchTerm,
    categoryFilter,
    statusFilter,
    showUnavailable,
    fetchProducts,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    const handler = setTimeout(() => setSearchTerm(searchInput), 400);
    return () => clearTimeout(handler);
  }, [searchInput]);

  useEffect(() => {
    if (!showFilterMenu) return;
    const handler = (e) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target)) {
        setShowFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFilterMenu]);

  usePolling(
    () => {
      if (contextIsOffline) return;
      if (!navigator.onLine) return;
      fetchProducts();
    },
    60_000,
    [orgId, branchId]
  );

  // ============================================================
  // HANDLERS
  // ============================================================
  const handleRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    fetchProducts()
      .then(() => toast.success('Refreshed successfully'))
      .catch(() => toast.error('Failed to refresh'))
      .finally(() => {
        if (isMountedRef.current) setIsRefreshing(false);
      });
  };

  const handlePageChange = (newPage) => setCurrentPage(newPage);

  const clearFilters = () => {
    setSearchInput('');
    setSearchTerm('');
    setCategoryFilter('all');
    setStatusFilter('all');
    setShowUnavailable(false);
    setCurrentPage(1);
  };

  const openBranchProductModal = (product) => {
    setSelectedProduct(product);
    setBranchProductData({
      displayName: product.displayName || product.productName || product.name,
      description: product.description || '',
      isAvailable: product.isAvailable !== false,
    });
    setShowBranchProductModal(true);
  };

  const closeBranchProductModal = () => {
    setShowBranchProductModal(false);
    setSelectedProduct(null);
  };

  const openDetailModal = (product) => {
    setSelectedProduct(product);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedProduct(null);
  };

  const openStockModal = (product) => {
    // Guard — medicines never go through direct stock edit
    if (product.pharmacyProduct) {
      toast.error('Medicines use batch receiving, not direct stock edit.');
      return;
    }
    setSelectedProduct(product);
    setShowStockModal(true);
  };

  const closeStockModal = () => {
    setShowStockModal(false);
    setSelectedProduct(null);
  };

  const openReceiveBatchModal = (product = null) => {
    setReceiveBatchForProduct(product);
    setShowReceiveBatchModal(true);
  };

  const closeReceiveBatchModal = () => {
    setShowReceiveBatchModal(false);
    setReceiveBatchForProduct(null);
  };

  const openBatchesModal = (product) => {
    setBatchesModalProduct(product);
    setShowBatchesModal(true);
  };

  const closeBatchesModal = () => {
    setShowBatchesModal(false);
    setBatchesModalProduct(null);
  };

  const handleViewProduct = (product) => openDetailModal(product);
  const handleEditBranchProduct = (product) => openBranchProductModal(product);
  const handleUpdateStock = (product) => openStockModal(product);

  const handleRestoreAvailability = async (product) => {
    if (!orgId || !branchId || submitting) return;
    setSubmitting(true);
    try {
      await axios.patch(
        `/organizations/${orgId}/kxtill/branches/${branchId}/products/${product.productId}`,
        { isAvailable: true }
      );
      toast.success(`${product.name} restored to this branch`);
      fetchProducts();
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to restore product'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleBranchProductUpdate = async () => {
    if (!selectedProduct || !orgId || !branchId) return;
    const productId = selectedProduct.productId;

    setSubmitting(true);
    try {
      await axios.patch(
        `/organizations/${orgId}/kxtill/branches/${branchId}/products/${productId}`,
        {
          displayName:
            branchProductData.displayName?.trim() ||
            selectedProduct.productName,
          description: branchProductData.description?.trim() || undefined,
          isAvailable: branchProductData.isAvailable,
        }
      );
      toast.success('Branch product updated successfully');
      closeBranchProductModal();
      fetchProducts();
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to update branch product'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleStockUpdate = async (payload) => {
    if (!selectedProduct || !orgId || !branchId) return;
    const productId = selectedProduct.productId;

    setSubmitting(true);
    try {
      await axios.patch(
        `/organizations/${orgId}/kxtill/branches/${branchId}/products/${productId}/stock`,
        { stock: payload.stock, minStock: payload.minStock }
      );

      toast.success(`Stock updated: ${payload.stock} ${selectedProduct.unit}`);
      closeStockModal();
      fetchProducts();

      sync(branchId).catch(() => {});
    } catch (error) {
      console.error('Stock update failed:', error);
      toast.error(error.response?.data?.message || 'Failed to update stock');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceiveBatchSave = async (payload) => {
    if (!orgId) return;
    setSubmitting(true);
    try {
      await axios.post(
        `/organizations/${orgId}/kxtill/pharmacy/batches/receive`,
        payload
      );
      toast.success('Batch received');
      closeReceiveBatchModal();
      fetchProducts();

      if (branchId) sync(branchId).catch(() => {});
    } catch (error) {
      console.error('Receive batch failed:', error);
      toast.error(
        error.response?.data?.error ||
          error.response?.data?.message ||
          'Failed to receive batch'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (categoryFilter !== 'all') count++;
    if (statusFilter !== 'all') count++;
    if (searchTerm?.trim()) count++;
    if (showUnavailable) count++;
    return count;
  };

  const totalItems = products.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * limit;
    return products.slice(start, start + limit);
  }, [products, currentPage, limit]);

  if (!orgId || !branchId) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>
          <AlertCircle size={40} />
          <p>No branch selected</p>
        </div>
      </div>
    );
  }

  const showSkeleton = loading && !hasLoadedOnceRef.current;

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className={styles.page}>
      {/* ─── Header ─── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerTitle}>
            <Package size={20} />
            <h1>Inventory</h1>
          </div>
          <span className={styles.headerSubtitle}>
            <Building2 size={12} /> {activeBranch?.name}
          </span>
        </div>
        <div className={styles.headerRight}>
          {!isOnline && (
            <span className={styles.offlineBadge}>
              <Clock size={14} /> Offline
            </span>
          )}
          {isPharmacyOrg && canUpdate && (
            <button
              className={styles.receiveBatchBtn}
              onClick={() => openReceiveBatchModal()}
              type="button"
            >
              <Plus size={16} /> Receive Batch
            </button>
          )}
        </div>
      </div>

      {/* ─── Stats ─── */}
      <div className={styles.statsGrid}>
        {isPharmacyOrg ? (
          <>
            <div className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles.statIconTotal}`}>
                <Package size={18} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Total Products</span>
                <span className={styles.statValue}>{stats.total}</span>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles.statIconExpiring}`}>
                <CalendarClock size={18} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Expiring (90d)</span>
                <span className={styles.statValue}>{stats.expiringSoon}</span>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles.statIconLow}`}>
                <AlertTriangle size={18} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Low Stock</span>
                <span className={styles.statValue}>{stats.low}</span>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles.statIconOut}`}>
                <AlertCircle size={18} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Out of Stock</span>
                <span className={styles.statValue}>{stats.out}</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles.statIconTotal}`}>
                <Package size={18} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Total Products</span>
                <span className={styles.statValue}>{stats.total}</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles.statIconValue}`}>
                <Check size={18} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>In Stock</span>
                <span className={styles.statValue}>{stats.inStock}</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles.statIconLow}`}>
                <AlertTriangle size={18} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Low Stock</span>
                <span className={styles.statValue}>{stats.low}</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles.statIconOut}`}>
                <AlertCircle size={18} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Out of Stock</span>
                <span className={styles.statValue}>{stats.out}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── Filters ─── */}
      <div className={styles.filtersBar}>
        <div className={styles.searchWrapper}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search products..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filterGroup}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="all">All Status</option>
            <option value="in-stock">In Stock</option>
            <option value="low-stock">Low Stock</option>
            <option value="out-of-stock">Out of Stock</option>
          </select>

          <div className={styles.filterMenu} ref={filterMenuRef}>
            <button
              type="button"
              className={`${styles.iconBtn} ${
                showUnavailable ? styles.iconBtnActive : ''
              }`}
              onClick={() => setShowFilterMenu((v) => !v)}
              title="More filters"
            >
              <Filter size={16} />
              {showUnavailable && <span className={styles.filterDot} />}
            </button>

            {showFilterMenu && (
              <div className={styles.filterPopover}>
                <label className={styles.filterOption}>
                  <input
                    type="checkbox"
                    checked={showUnavailable}
                    onChange={(e) => setShowUnavailable(e.target.checked)}
                  />
                  <span>Show unavailable</span>
                </label>
              </div>
            )}
          </div>

          <button
            className={styles.refreshBtn}
            onClick={handleRefresh}
            disabled={isRefreshing}
            type="button"
          >
            <RefreshCw
              size={14}
              className={isRefreshing ? styles.spinning : ''}
            />
          </button>

          <div className={styles.viewToggle}>
            <button
              type="button"
              className={`${styles.viewBtn} ${
                viewMode === 'grid' ? styles.active : ''
              }`}
              onClick={() => setViewMode('grid')}
            >
              <Grid size={14} />
            </button>
            <button
              type="button"
              className={`${styles.viewBtn} ${
                viewMode === 'list' ? styles.active : ''
              }`}
              onClick={() => setViewMode('list')}
            >
              <List size={14} />
            </button>
          </div>

          {getActiveFilterCount() > 0 && (
            <button
              className={styles.clearFiltersBtn}
              onClick={clearFilters}
              type="button"
            >
              <X size={14} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ─── Products Display ─── */}
      {showSkeleton ? (
        <div className={styles.loadingState}>
          <RefreshCw size={32} className={styles.spinning} />
          <p>Loading products...</p>
        </div>
      ) : paginatedProducts.length === 0 ? (
        <div className={styles.emptyState}>
          <Package size={48} />
          <h3>No products found</h3>
          <p>
            {getActiveFilterCount() > 0
              ? 'Try adjusting your filters to see more results'
              : 'No products available for this branch yet or not globally added.'}
          </p>
          {getActiveFilterCount() > 0 && (
            <button
              className={styles.clearFiltersBtnLarge}
              onClick={clearFilters}
              type="button"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className={styles.productsGrid}>
          {paginatedProducts.map((product) => {
            const status = getStockStatus(product);
            const StatusIcon = status.icon;
            const stock = Number(product.stock || 0);
            const minStock = Number(product.minStock || 0);
            const unavailable = !product.isAvailable;
            const isMedicine = !!product.pharmacyProduct;
            const nearestDays =
              product.nearestExpiry !== null && product.nearestExpiry !== undefined
                ? daysUntil(product.nearestExpiry)
                : null;

            return (
              <div
                key={product.id}
                className={`${styles.productCard} ${
                  unavailable ? styles.unavailableCard : ''
                } ${isMedicine ? styles.medicineCard : ''}`}
              >
                <div className={styles.productCardHeader}>
                  <div
                    className={`${styles.productCardIcon} ${
                      isMedicine ? styles.medicineIcon : ''
                    }`}
                  >
                    {isMedicine ? <Pill size={20} /> : <Package size={20} />}
                  </div>
                  <div
                    className={`${styles.productCardStatus} ${
                      styles[status.variant]
                    }`}
                  >
                    <StatusIcon size={10} /> {status.label}
                  </div>
                </div>
                <div className={styles.productCardBody}>
                  <h3 className={styles.productCardName}>{product.name}</h3>
                  {unavailable && (
                    <span className={styles.unavailableTag}>Unavailable</span>
                  )}
                  {product.sku && product.sku !== '-' && (
                    <span className={styles.productCardSku}>
                      SKU: {product.sku}
                    </span>
                  )}
                  {product.category && product.category !== '-' && (
                    <span className={styles.productCardCategory}>
                      {product.category}
                    </span>
                  )}

                  {isPharmacyOrg && isMedicine && (
                    <div className={styles.productCardBatches}>
                      {product.batchCount === undefined ? (
                        <span className={styles.mutedCell}>…</span>
                      ) : product.batchCount === null ? (
                        <span className={styles.mutedCell}>—</span>
                      ) : product.batchCount === 0 ? (
                        <span className={styles.mutedCell}>No batches</span>
                      ) : (
                        <>
                          <span className={styles.batchCount}>
                            {product.batchCount} batch
                            {product.batchCount === 1 ? '' : 'es'}
                          </span>
                          {nearestDays !== null && (
                            <span
                              className={`${styles.batchExpiry} ${
                                nearestDays < 0
                                  ? styles.expired
                                  : nearestDays <= 90
                                  ? styles.expiringSoon
                                  : ''
                              }`}
                            >
                              {nearestDays < 0
                                ? `Expired ${formatExpiry(product.nearestExpiry)}`
                                : `Expires ${formatExpiry(product.nearestExpiry)} (${nearestDays}d)`}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  <div className={styles.productCardStock}>
                    <span className={styles.productCardStockLabel}>Stock:</span>
                    <span
                      className={
                        stock <= minStock ? styles.productCardStockLow : ''
                      }
                    >
                      {stock} {product.unit}
                    </span>
                    {minStock > 0 && (
                      <span className={styles.productCardMinStock}>
                        Min: {minStock}
                      </span>
                    )}
                  </div>
                  <div className={styles.productCardPrice}>
                    <span className={styles.productCardPriceLabel}>Price:</span>
                    <span className={styles.productCardPriceValue}>
                      {formatCurrency(product.price)}
                    </span>
                  </div>
                </div>
                <div className={styles.productCardActions}>
                  <button
                    type="button"
                    className={styles.productCardActionBtn}
                    onClick={() => handleViewProduct(product)}
                    title="View Details"
                  >
                    <Eye size={14} />
                  </button>

                  {canUpdate && (
                    <>
                      {isPharmacyOrg && isMedicine ? (
                        <>
                          <button
                            type="button"
                            className={`${styles.productCardActionBtn} ${styles.actionReceive}`}
                            onClick={() => openReceiveBatchModal(product)}
                            title="Receive batch"
                          >
                            <Plus size={14} />
                          </button>
                          <button
                            type="button"
                            className={`${styles.productCardActionBtn} ${styles.actionBatches}`}
                            onClick={() => openBatchesModal(product)}
                            title="View batches"
                          >
                            <Layers size={14} />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.productCardActionBtn}
                          onClick={() => handleUpdateStock(product)}
                          title="Update Stock"
                        >
                          <SlidersHorizontal size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.productCardActionBtn}
                        onClick={() => handleEditBranchProduct(product)}
                        title="Edit Branch Product"
                      >
                        <Edit size={14} />
                      </button>
                      {unavailable && (
                        <button
                          type="button"
                          className={`${styles.productCardActionBtn} ${styles.restore}`}
                          onClick={() => handleRestoreAvailability(product)}
                          disabled={submitting}
                          title="Restore to branch"
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Category</th>
                {isPharmacyOrg && <th>Batches</th>}
                <th>Stock</th>
                <th>Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map((product) => {
                const status = getStockStatus(product);
                const StatusIcon = status.icon;
                const stock = Number(product.stock || 0);
                const minStock = Number(product.minStock || 0);
                const unavailable = !product.isAvailable;
                const isMedicine = !!product.pharmacyProduct;
                const nearestDays =
                  product.nearestExpiry !== null && product.nearestExpiry !== undefined
                    ? daysUntil(product.nearestExpiry)
                    : null;

                return (
                  <tr
                    key={product.id}
                    className={`${styles.tableRow} ${
                      unavailable ? styles.unavailableRow : ''
                    }`}
                  >
                    <td>
                      <div className={styles.productCell}>
                        <div
                          className={`${styles.productCellIcon} ${
                            isMedicine ? styles.medicineIcon : ''
                          }`}
                        >
                          {isMedicine ? (
                            <Pill size={16} />
                          ) : (
                            <Package size={16} />
                          )}
                        </div>
                        <div className={styles.productCellInfo}>
                          <span className={styles.productCellName}>
                            {product.name}
                          </span>
                          {unavailable && (
                            <span className={styles.unavailableTag}>
                              Unavailable
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{product.sku !== '-' ? product.sku : '-'}</td>
                    <td>{product.category !== '-' ? product.category : '-'}</td>

                    {isPharmacyOrg && (
                      <td>
                        {isMedicine ? (
                          product.batchCount === undefined ? (
                            <span className={styles.mutedCell}>…</span>
                          ) : product.batchCount === null ? (
                            <span className={styles.mutedCell}>—</span>
                          ) : product.batchCount === 0 ? (
                            <span className={styles.mutedCell}>No batches</span>
                          ) : (
                            <div className={styles.batchCell}>
                              <span className={styles.batchCount}>
                                {product.batchCount} batch
                                {product.batchCount === 1 ? '' : 'es'}
                              </span>
                              {nearestDays !== null && (
                                <span
                                  className={`${styles.batchExpiry} ${
                                    nearestDays < 0
                                      ? styles.expired
                                      : nearestDays <= 90
                                      ? styles.expiringSoon
                                      : ''
                                  }`}
                                >
                                  {nearestDays < 0
                                    ? `Expired ${formatExpiry(product.nearestExpiry)}`
                                    : `${formatExpiry(product.nearestExpiry)} (${nearestDays}d)`}
                                </span>
                              )}
                            </div>
                          )
                        ) : (
                          <span className={styles.mutedCell}>—</span>
                        )}
                      </td>
                    )}

                    <td>
                      <span
                        className={stock <= minStock ? styles.stockLow : ''}
                      >
                        {stock} {product.unit}
                        {minStock > 0 && (
                          <span className={styles.minStockLabel}>
                            (min: {minStock})
                          </span>
                        )}
                      </span>
                    </td>
                    <td>{formatCurrency(product.price)}</td>
                    <td>
                      <span
                        className={`${styles.statusBadge} ${
                          styles[status.variant]
                        }`}
                      >
                        <StatusIcon size={10} /> {status.label}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actionButtons}>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => handleViewProduct(product)}
                          title="View Details"
                        >
                          <Eye size={14} />
                        </button>

                        {canUpdate && (
                          <>
                            {isPharmacyOrg && isMedicine ? (
                              <>
                                <button
                                  type="button"
                                  className={`${styles.actionBtn} ${styles.actionReceive}`}
                                  onClick={() => openReceiveBatchModal(product)}
                                  title="Receive batch"
                                >
                                  <Plus size={14} />
                                </button>
                                <button
                                  type="button"
                                  className={`${styles.actionBtn} ${styles.actionBatches}`}
                                  onClick={() => openBatchesModal(product)}
                                  title="View batches"
                                >
                                  <Layers size={14} />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className={styles.actionBtn}
                                onClick={() => handleUpdateStock(product)}
                                title="Update Stock"
                              >
                                <SlidersHorizontal size={14} />
                              </button>
                            )}
                            <button
                              type="button"
                              className={styles.actionBtn}
                              onClick={() => handleEditBranchProduct(product)}
                              title="Edit Branch Product"
                            >
                              <Edit size={14} />
                            </button>
                            {unavailable && (
                              <button
                                type="button"
                                className={`${styles.actionBtn} ${styles.restore}`}
                                onClick={() =>
                                  handleRestoreAvailability(product)
                                }
                                disabled={submitting}
                                title="Restore to branch"
                              >
                                <RotateCcw size={14} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Pagination ─── */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageBtn}
            onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
            disabled={currentPage === 1}
            type="button"
          >
            <ChevronLeft size={16} /> Previous
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
            type="button"
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* ─── Modals ─── */}
      <BranchProductModal
        isOpen={showBranchProductModal}
        onClose={closeBranchProductModal}
        onSave={handleBranchProductUpdate}
        product={selectedProduct}
        branchProductData={branchProductData}
        setBranchProductData={setBranchProductData}
        isSubmitting={submitting}
        activeBranch={activeBranch}
      />

      <ProductDetailModal
        isOpen={showDetailModal}
        onClose={closeDetailModal}
        product={selectedProduct}
        formatCurrency={formatCurrency}
        mode="branch"
        activeBranch={activeBranch}
        isPharmacyOrg={isPharmacyOrg}
        onUpdateStock={
          canUpdate && selectedProduct && !selectedProduct.pharmacyProduct
            ? () => {
                closeDetailModal();
                if (selectedProduct) handleUpdateStock(selectedProduct);
              }
            : undefined
        }
        onReceiveBatch={
          canUpdate && isPharmacyOrg && selectedProduct?.pharmacyProduct
            ? () => {
                const p = selectedProduct;
                closeDetailModal();
                openReceiveBatchModal(p);
              }
            : undefined
        }
        onViewBatches={
          isPharmacyOrg && selectedProduct?.pharmacyProduct
            ? () => {
                const p = selectedProduct;
                closeDetailModal();
                openBatchesModal(p);
              }
            : undefined
        }
        onEditBranchProduct={
          canUpdate
            ? () => {
                closeDetailModal();
                if (selectedProduct) handleEditBranchProduct(selectedProduct);
              }
            : undefined
        }
      />

      <BranchStockModal
        isOpen={showStockModal}
        onClose={closeStockModal}
        onSave={handleStockUpdate}
        product={selectedProduct}
        isSubmitting={submitting}
      />

      {isPharmacyOrg && (
        <ReceiveBatchModal
          isOpen={showReceiveBatchModal}
          onClose={closeReceiveBatchModal}
          onSave={handleReceiveBatchSave}
          product={receiveBatchForProduct}
          isSubmitting={submitting}
          branches={activeBranch ? [activeBranch] : []}
          defaultBranchId={activeBranch?.id}
          currency={activeOrganization?.currency || 'KES'}
        />
      )}

      {isPharmacyOrg && (
        <ProductBatchesModal
          isOpen={showBatchesModal}
          onClose={closeBatchesModal}
          product={batchesModalProduct}
          orgId={orgId}
          currency={activeOrganization?.currency || 'KES'}
          formatCurrency={formatCurrency}
          fixedBranchId={branchId}
        />
      )}
    </div>
  );
};

export default Inventory;