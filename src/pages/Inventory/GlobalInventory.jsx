// src/pages/Inventory/GlobalInventory.jsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useSettings } from '../../contexts/SettingsContext';
import { KXTILL } from '../../constants/permissions';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  Globe,
  Search,
  Plus,
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
  Package,
  Building2,
  Activity,
  Archive,
  RotateCcw,
  Filter,
} from 'lucide-react';
import styles from './GlobalInventory.module.css';
import ProductModal from './components/ProductModal';
import ProductDetailModal from './components/ProductDetailModal';
import BranchStockModal from './components/BranchStockModal';
import usePolling from '../../hooks/usePolling';

const GlobalInventory = () => {
  const {
    activeOrganization,
    activeBranch,
    branches,
    isOffline: contextIsOffline,
  } = useAuth();

  const { can, isOwner } = usePermissions();
  const { formatCurrency } = useSettings();

  // Permissions
  const canCreate = can(KXTILL.INVENTORY.CREATE);
  const canUpdate = can(KXTILL.INVENTORY.UPDATE);
  const canDelete = can(KXTILL.INVENTORY.DELETE);
  const canUpdateStock = can(KXTILL.INVENTORY.UPDATE);

  // State
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [categories, setCategories] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isOnline, setIsOnline] = useState(!contextIsOffline);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('globalInventoryViewMode') || 'list'
  );

  // Aggregates
  const [health, setHealth] = useState(null);

  // Modal states
  const [showProductModal, setShowProductModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productToArchive, setProductToArchive] = useState(null);
  const [newlyCreatedProduct, setNewlyCreatedProduct] = useState(null);
  const [stockModalBranchId, setStockModalBranchId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const isMountedRef = useRef(true);
  const fetchControllerRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);
  const filterMenuRef = useRef(null);

  const orgId = activeOrganization?.id;
  const limit = 20;

  // Branch list for the stock modal dropdown — restrict to what the user can access
  const availableBranches = useMemo(() => branches || [], [branches]);

  // ---------- helpers ----------
  const getStockStatus = (product) => {
    const bps = product.branchProducts || [];

    if (bps.length === 0) {
      return { label: 'No Branches', variant: 'muted', icon: AlertCircle };
    }

    const outCount = bps.filter((bp) => Number(bp.stock) <= 0).length;
    const lowCount = bps.filter(
      (bp) =>
        Number(bp.stock) > 0 && Number(bp.stock) <= Number(bp.minStock)
    ).length;
    const total = bps.length;

    if (outCount === total) {
      return { label: 'Out of Stock', variant: 'danger', icon: AlertCircle };
    }

    if (lowCount + outCount === total) {
      return { label: 'Low Stock', variant: 'warning', icon: AlertTriangle };
    }

    if (outCount > 0 || lowCount > 0) {
      const needAttention = lowCount + outCount;
      return {
        label: `${needAttention} of ${total} branches need attention`,
        variant: 'warning',
        icon: AlertTriangle,
      };
    }

    return { label: 'In Stock', variant: 'success', icon: Check };
  };

  // ---------- fetching ----------
  const fetchHealth = useCallback(async () => {
    if (!orgId) return;
    try {
      const response = await axios.get(
        `/organizations/${orgId}/kxtill/inventory/health`
      );
      if (isMountedRef.current) setHealth(response.data);
    } catch (error) {
      console.error('Failed to fetch health:', error);
    }
  }, [orgId]);

  const fetchSummary = useCallback(async () => {
    if (!orgId) return;
    try {
      await axios.get(
        `/organizations/${orgId}/kxtill/inventory/summary`
      );
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    }
  }, [orgId]);

  const fetchProducts = useCallback(async () => {
    if (!orgId) {
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
      if (showArchived) params.includeArchived = 'true';

      const endpoint = `/organizations/${orgId}/kxtill/products`;

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
          console.warn('Global fetch failed:', error.message);
        }
      }

      if (controller.signal.aborted || !isMountedRef.current) return;

      const transformed = productData.map((p) => {
        const baseUnit =
          p.baseUnit || p.units?.find((u) => u.isBaseUnit) || {};
        const sellingUnits = (p.units || []).filter((u) => !u.isBaseUnit);
        const branchProducts = p.branchProducts || [];

        const totalStock = branchProducts.reduce(
          (sum, bp) => sum + Number(bp.stock || 0),
          0
        );
        const totalMinStock = branchProducts.reduce(
          (sum, bp) => sum + Number(bp.minStock || 0),
          0
        );
        const lowCount = branchProducts.filter(
          (bp) =>
            Number(bp.stock) > 0 &&
            Number(bp.stock) <= Number(bp.minStock)
        ).length;
        const outCount = branchProducts.filter(
          (bp) => Number(bp.stock) <= 0
        ).length;

        return {
          id: p.id,
          productId: p.productId || p.id,
          name: p.name,
          sku: p.sku || '-',
          category: p.category || '-',
          description: p.description,
          taxRate: parseFloat(p.taxRate) || 0,
          isActive: p.isActive !== false,
          trackInventory: p.trackInventory !== false,

          baseUnit,
          baseUnitId: p.baseUnitId,
          price: parseFloat(baseUnit.price || 0),
          cost: parseFloat(baseUnit.cost || p.cost || 0),
          unit: baseUnit.abbreviation || baseUnit.name || 'units',
          allowFractional: !!baseUnit.allowFractional,
          unitType: baseUnit.unitType || 'WHOLE',

          units: p.units || [],
          sellingUnits,

          branchProducts,
          branchCount: branchProducts.length,
          lowCount,
          outCount,
          totalStock,
          totalMinStock,
          stock: totalStock,

          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
      });

      let filtered = transformed;
      if (statusFilter === 'in-stock') {
        filtered = filtered.filter((p) => p.outCount === 0 && p.lowCount === 0);
      } else if (statusFilter === 'low-stock') {
        filtered = filtered.filter((p) => p.lowCount > 0 || p.outCount > 0);
      } else if (statusFilter === 'out-of-stock') {
        filtered = filtered.filter(
          (p) => p.branchCount > 0 && p.outCount === p.branchCount
        );
      }

      setProducts(filtered);
      hasLoadedOnceRef.current = true;

      const uniqueCategories = [
        ...new Set(productData.map((p) => p.category).filter(Boolean)),
      ];
      setCategories(uniqueCategories);
    } catch (error) {
      if (error.name === 'CanceledError' || error.name === 'AbortError')
        return;
      console.error('Error fetching global products:', error);
      if (isMountedRef.current) setProducts([]);
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) setLoading(false);
    }
  }, [orgId, searchTerm, categoryFilter, statusFilter, showArchived, contextIsOffline]);

  // ---------- effects ----------
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
    localStorage.setItem('globalInventoryViewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('globalInventoryShowArchived', String(showArchived));
  }, [showArchived]);

  // Restore persisted filter on mount
  useEffect(() => {
    const stored = localStorage.getItem('globalInventoryShowArchived');
    if (stored === 'true') setShowArchived(true);
  }, []);

  // Close filter popover on outside click
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

  useEffect(() => {
    hasLoadedOnceRef.current = false;
  }, [categoryFilter, statusFilter, showArchived]);

  useEffect(() => {
    if (orgId) {
      fetchProducts();
      fetchHealth();
      fetchSummary();
    }
  }, [fetchProducts, fetchHealth, fetchSummary, orgId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, statusFilter, showArchived]);

  useEffect(() => {
    const handler = setTimeout(() => setSearchTerm(searchInput), 400);
    return () => clearTimeout(handler);
  }, [searchInput]);

  usePolling(
    () => {
      if (contextIsOffline) return;
      if (!navigator.onLine) return;
      fetchProducts();
      fetchHealth();
      fetchSummary();
    },
    60_000,
    [orgId]
  );

  // ---------- handlers ----------
  const handleRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    Promise.all([fetchProducts(), fetchHealth(), fetchSummary()])
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
    setShowArchived(false);
    setCurrentPage(1);
  };

  const openProductModal = (product = null) => {
    setEditingProduct(product);
    setShowProductModal(true);
  };

  const closeProductModal = () => {
    setShowProductModal(false);
    setEditingProduct(null);
  };

  const openDetailModal = (product) => {
    setSelectedProduct(product);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedProduct(null);
  };

  const openArchiveModal = (product) => {
    setProductToArchive(product);
    setShowArchiveModal(true);
  };

  const closeArchiveModal = () => {
    setShowArchiveModal(false);
    setProductToArchive(null);
  };

  // ---------- create / update ----------
  const handleProductSave = async (productData) => {
    if (!orgId) return;
    setSubmitting(true);
    try {
      if (editingProduct) {
        await axios.patch(
          `/organizations/${orgId}/kxtill/products/${
            editingProduct.productId || editingProduct.id
          }`,
          productData
        );
        toast.success('Product updated successfully');
        closeProductModal();
        fetchProducts();
        fetchHealth();
        fetchSummary();
      } else {
        const response = await axios.post(
          `/organizations/${orgId}/kxtill/products`,
          productData
        );
        const created = response.data?.product || response.data;

        closeProductModal();
        fetchProducts();
        fetchHealth();
        fetchSummary();

        // Hand off to the stock modal so the user can set stock in-flow.
        // Only if: user has permission, has access to at least one branch.
        if (created && canUpdateStock && availableBranches.length > 0) {
          const initialBranchId =
            activeBranch?.id || availableBranches[0]?.id || null;

          setNewlyCreatedProduct({
            productId: created.id,
            id: created.id,
            name: created.name,
            displayName: created.name,
            unit:
              created.baseUnit?.abbreviation ||
              created.baseUnit?.name ||
              'units',
            stock: 0,
            minStock: 0,
          });
          setStockModalBranchId(initialBranchId);
          setShowStockModal(true);
          toast.success('Product created — set stock');
        } else if (created) {
          toast.success(
            'Product created. Set stock per branch in Inventory.'
          );
        }
      }
    } catch (error) {
      console.error('Save failed:', error);
      toast.error(error.response?.data?.message || 'Failed to save product');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- stock save (from newly-created flow) ----------
  const handleNewProductStockSave = async ({ stock, minStock }) => {
    if (!newlyCreatedProduct || !orgId || !stockModalBranchId) return;

    setSubmitting(true);
    try {
      await axios.patch(
        `/organizations/${orgId}/kxtill/branches/${stockModalBranchId}/products/${newlyCreatedProduct.productId}/stock`,
        {
          stock,
          minStock: minStock ?? 0,
        }
      );

      const branchName =
        availableBranches.find((b) => b.id === stockModalBranchId)?.name ||
        'branch';

      toast.success(
        `Stock set: ${stock} ${newlyCreatedProduct.unit} at ${branchName}`
      );

      setShowStockModal(false);
      setNewlyCreatedProduct(null);
      setStockModalBranchId(null);

      fetchProducts();
      fetchHealth();
      fetchSummary();
    } catch (error) {
      console.error('Stock update failed:', error);
      toast.error(error.response?.data?.message || 'Failed to set stock');
    } finally {
      setSubmitting(false);
    }
  };

  const closeStockModal = () => {
    setShowStockModal(false);
    setNewlyCreatedProduct(null);
    setStockModalBranchId(null);
  };

  // ---------- archive / restore ----------
  const confirmArchive = async () => {
    if (!productToArchive || !orgId) return;
    setSubmitting(true);
    try {
      await axios.delete(
        `/organizations/${orgId}/kxtill/products/${
          productToArchive.productId || productToArchive.id
        }`
      );
      toast.success('Product archived');
      closeArchiveModal();
      fetchProducts();
      fetchHealth();
      fetchSummary();
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to archive product'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestoreProduct = async (product) => {
    if (!orgId || submitting) return;
    setSubmitting(true);
    try {
      await axios.patch(
        `/organizations/${orgId}/kxtill/products/${
          product.productId || product.id
        }`,
        { isActive: true }
      );

      // Count how many branches still have this product enabled. Restore
      // does not touch branch_products, so their availability is preserved.
      const availableCount = (product.branchProducts || []).filter(
        (bp) => bp.isAvailable !== false
      ).length;

      toast.success(
        availableCount > 0
          ? `${product.name} restored — back at ${availableCount} branch${
              availableCount === 1 ? '' : 'es'
            }`
          : `${product.name} restored`
      );

      fetchProducts();
      fetchHealth();
      fetchSummary();
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'Failed to restore product'
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
    if (showArchived) count++;
    return count;
  };

  const totalItems = products.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * limit;
    return products.slice(start, start + limit);
  }, [products, currentPage, limit]);

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
  const healthScore = health?.health ?? 0;
  const showBranchPicker = availableBranches.length > 1;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerTitle}>
            <Globe size={20} />
            <h1>Global Inventory</h1>
          </div>
          <span className={styles.headerSubtitle}>
            All Branches · Organization-wide
          </span>
        </div>
        <div className={styles.headerRight}>
          {!isOnline && (
            <span className={styles.offlineBadge}>
              <Clock size={14} /> Offline
            </span>
          )}
          {isOwner && <span className={styles.ownerBadge}>Owner</span>}
          {canCreate && (
            <button
              className={styles.addProductBtn}
              onClick={() => openProductModal()}
              type="button"
            >
              <Plus size={16} /> Add Product
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconHealth}`}>
            <Activity size={18} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Inventory Health</span>
            <span className={styles.statValue}>{healthScore}%</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconTotal}`}>
            <Check size={18} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>In Stock</span>
            <span className={styles.statValue}>{health?.inStock ?? 0}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconLow}`}>
            <AlertTriangle size={18} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Low Stock</span>
            <span className={styles.statValue}>{health?.lowStock ?? 0}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconOut}`}>
            <AlertCircle size={18} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Out of Stock</span>
            <span className={styles.statValue}>{health?.outOfStock ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
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
            <option value="low-stock">Needs Attention</option>
            <option value="out-of-stock">Out of Stock</option>
          </select>

          {/* Secondary filters popover */}
          <div className={styles.filterMenu} ref={filterMenuRef}>
            <button
              type="button"
              className={`${styles.iconBtn} ${
                showArchived ? styles.iconBtnActive : ''
              }`}
              onClick={() => setShowFilterMenu((v) => !v)}
              title="More filters"
            >
              <Filter size={16} />
              {showArchived && <span className={styles.filterDot} />}
            </button>

            {showFilterMenu && (
              <div className={styles.filterPopover}>
                <label className={styles.filterOption}>
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                  />
                  <span>Show archived</span>
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

      {/* Products Display */}
      {showSkeleton ? (
        <div className={styles.loadingState}>
          <RefreshCw size={32} className={styles.spinning} />
          <p>Loading global products...</p>
        </div>
      ) : paginatedProducts.length === 0 ? (
        <div className={styles.emptyState}>
          <Globe size={48} />
          <h3>No products found</h3>
          <p>
            {getActiveFilterCount() > 0
              ? 'Try adjusting your filters to see more results'
              : canCreate
              ? 'Start by adding your first global product'
              : 'No products in the catalog yet'}
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
          {canCreate && (
            <button
              className={styles.addProductBtnLarge}
              onClick={() => openProductModal()}
              type="button"
            >
              <Plus size={16} /> Add Product
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className={styles.productsGrid}>
          {paginatedProducts.map((product) => {
            const status = getStockStatus(product);
            const StatusIcon = status.icon;
            const totalStock = Number(product.totalStock || 0);
            const archived = !product.isActive;

            return (
              <div
                key={product.id}
                className={`${styles.productCard} ${
                  archived ? styles.archivedCard : ''
                }`}
              >
                <div className={styles.productCardHeader}>
                  <div className={styles.productCardIcon}>
                    <Package size={20} />
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
                  {archived && (
                    <span className={styles.archivedTag}>Archived</span>
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
                  <span className={styles.productCardBranch}>
                    <Building2 size={12} /> {product.branchCount} branch
                    {product.branchCount === 1 ? '' : 'es'}
                  </span>
                  <div className={styles.productCardStock}>
                    <span className={styles.productCardStockLabel}>
                      Total Stock:
                    </span>
                    <span
                      className={
                        totalStock <= 0 ? styles.productCardStockLow : ''
                      }
                    >
                      {totalStock} {product.unit}
                    </span>
                  </div>
                  <div className={styles.productCardPrice}>
                    <span className={styles.productCardPriceLabel}>
                      Base Price:
                    </span>
                    <span className={styles.productCardPriceValue}>
                      {formatCurrency(product.price)}
                    </span>
                  </div>
                </div>
                <div className={styles.productCardActions}>
                  <button
                    type="button"
                    className={styles.productCardActionBtn}
                    onClick={() => openDetailModal(product)}
                    title="View Details"
                  >
                    <Eye size={14} />
                  </button>

                  {canUpdate && !archived && (
                    <button
                      type="button"
                      className={styles.productCardActionBtn}
                      onClick={() => openProductModal(product)}
                      title="Edit Product"
                    >
                      <Edit size={14} />
                    </button>
                  )}

                  {canDelete && !archived && (
                    <button
                      type="button"
                      className={`${styles.productCardActionBtn} ${styles.danger}`}
                      onClick={() => openArchiveModal(product)}
                      title="Archive"
                    >
                      <Archive size={14} />
                    </button>
                  )}

                  {canUpdate && archived && (
                    <button
                      type="button"
                      className={`${styles.productCardActionBtn} ${styles.restore}`}
                      onClick={() => handleRestoreProduct(product)}
                      disabled={submitting}
                      title="Restore product"
                    >
                      <RotateCcw size={14} />
                    </button>
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
                <th>Branches</th>
                <th>Total Stock</th>
                <th>Base Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map((product) => {
                const status = getStockStatus(product);
                const StatusIcon = status.icon;
                const totalStock = Number(product.totalStock || 0);
                const archived = !product.isActive;

                return (
                  <tr
                    key={product.id}
                    className={`${styles.tableRow} ${
                      archived ? styles.archivedRow : ''
                    }`}
                  >
                    <td>
                      <div className={styles.productCell}>
                        <div className={styles.productCellIcon}>
                          <Package size={16} />
                        </div>
                        <div className={styles.productCellInfo}>
                          <span className={styles.productCellName}>
                            {product.name}
                          </span>
                          {archived && (
                            <span className={styles.archivedTag}>
                              Archived
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{product.sku !== '-' ? product.sku : '-'}</td>
                    <td>{product.category !== '-' ? product.category : '-'}</td>
                    <td>
                      {product.branchCount > 0
                        ? `${product.branchCount - product.lowCount - product.outCount}/${product.branchCount} ok`
                        : '—'}
                    </td>
                    <td>
                      <span className={totalStock <= 0 ? styles.stockLow : ''}>
                        {totalStock} {product.unit}
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
                          onClick={() => openDetailModal(product)}
                          title="View Details"
                        >
                          <Eye size={14} />
                        </button>

                        {canUpdate && !archived && (
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() => openProductModal(product)}
                            title="Edit Product"
                          >
                            <Edit size={14} />
                          </button>
                        )}

                        {canDelete && !archived && (
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.danger}`}
                            onClick={() => openArchiveModal(product)}
                            title="Archive"
                          >
                            <Archive size={14} />
                          </button>
                        )}

                        {canUpdate && archived && (
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.restore}`}
                            onClick={() => handleRestoreProduct(product)}
                            disabled={submitting}
                            title="Restore product"
                          >
                            <RotateCcw size={14} />
                          </button>
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

      {/* Pagination */}
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

      {/* Modals */}
      <ProductModal
        isOpen={showProductModal}
        onClose={closeProductModal}
        onSave={handleProductSave}
        product={editingProduct}
        isSubmitting={submitting}
      />

      <ProductDetailModal
        isOpen={showDetailModal}
        onClose={closeDetailModal}
        product={selectedProduct}
        formatCurrency={formatCurrency}
        mode="global"
        onEdit={
          canUpdate
            ? () => {
                closeDetailModal();
                if (selectedProduct) openProductModal(selectedProduct);
              }
            : undefined
        }
      />

      {/* Stock modal — opened right after a new product is created */}
      <BranchStockModal
        isOpen={showStockModal}
        onClose={closeStockModal}
        onSave={handleNewProductStockSave}
        product={newlyCreatedProduct}
        isSubmitting={submitting}
        branches={showBranchPicker ? availableBranches : undefined}
        selectedBranchId={stockModalBranchId}
        onBranchChange={setStockModalBranchId}
      />

      {/* Archive Confirmation Modal */}
      {showArchiveModal && productToArchive && (
        <div className={styles.modalOverlay}>
          <div className={styles.confirmModal}>
            <div className={styles.confirmModalIcon}>
              <Archive size={32} />
            </div>
            <h3>Archive Product</h3>
            <p>
              Archive <strong>{productToArchive.name}</strong>? It will be
              hidden from POS and inventory lists, but its sales history stays
              intact. You can reactivate it later.
            </p>
            <div className={styles.confirmModalActions}>
              <button
                className={styles.confirmCancelBtn}
                onClick={closeArchiveModal}
                disabled={submitting}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.confirmDeleteBtn}
                onClick={confirmArchive}
                disabled={submitting}
                type="button"
              >
                {submitting ? 'Archiving...' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GlobalInventory;