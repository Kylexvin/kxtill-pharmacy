// src/pages/Inventory/Inventory.jsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  Package,
  Search,
  Edit,
  Trash2,
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
  Building2,
  SlidersHorizontal,
} from 'lucide-react';
import styles from './Inventory.module.css';
import BranchProductModal from './components/BranchProductModal';
import ProductDetailModal from './components/ProductDetailModal';
import BranchStockModal from './components/BranchStockModal';
import usePolling from '../../hooks/usePolling';

const Inventory = () => {
  const {
    activeOrganization,
    activeBranch,
    isOffline: contextIsOffline,
  } = useAuth();

  const { formatCurrency, getCurrency } = useSettings();
  const currency = getCurrency();

  // State
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [categories, setCategories] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isOnline, setIsOnline] = useState(!contextIsOffline);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('list');

  // Modal states
  const [showBranchProductModal, setShowBranchProductModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productToRemove, setProductToRemove] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [branchProductData, setBranchProductData] = useState({
    displayName: '',
    description: '',
    isAvailable: true,
  });

  const isMountedRef = useRef(true);
  const fetchControllerRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);
  const hasInitialLoadRef = useRef(false);

  const orgId = activeOrganization?.id;
  const branchId = activeBranch?.id;
  const limit = 20;
  // Permission check for branch-level remove is owner-only in this build.
  // TODO: migrate to usePermissions() (see TODO.md — Permissions migration).

  // ---------- helpers ----------
  const getStockStatus = (product) => {
    const stock = Number(product.stock || 0);
    const minStock = Number(product.minStock || 0);
    if (stock <= 0) return { label: 'Out of Stock', variant: 'danger', icon: AlertCircle };
    if (stock <= minStock) return { label: 'Low Stock', variant: 'warning', icon: AlertTriangle };
    return { label: 'In Stock', variant: 'success', icon: Check };
  };

  const stats = useMemo(() => {
    const total = products.length;
    let inStock = 0, low = 0, out = 0;
    for (const p of products) {
      const stock = Number(p.stock || 0);
      const minStock = Number(p.minStock || 0);
      if (stock <= 0) out++;
      else if (stock <= minStock) low++;
      else inStock++;
    }
    return { total, inStock, low, out };
  }, [products]);

  // ---------- fetching ----------
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
      if (statusFilter === 'low-stock') params.lowStock = true;

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
          if (error.name === 'CanceledError' || error.name === 'AbortError') return;
          console.warn('Branch fetch failed:', error.message);
        }
      }

      if (controller.signal.aborted || !isMountedRef.current) return;

      const transformed = productData.map(p => {
        const baseUnit = p.baseUnit || {};
        return {
          id: p.id,
          branchProductId: p.id,
          productId: p.productId,
          productName: p.productName,
          name: p.displayName || p.productName,
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
        };
      });

      let filtered = transformed;
      if (statusFilter === 'in-stock') {
        filtered = filtered.filter(p => p.stock > p.minStock);
      } else if (statusFilter === 'low-stock') {
        filtered = filtered.filter(p => p.stock > 0 && p.stock <= p.minStock);
      } else if (statusFilter === 'out-of-stock') {
        filtered = filtered.filter(p => p.stock <= 0);
      }

      setProducts(filtered);
      hasLoadedOnceRef.current = true;

      const uniqueCategories = [...new Set(productData.map(p => p.category).filter(Boolean))];
      setCategories(uniqueCategories);
    } catch (error) {
      if (error.name === 'CanceledError' || error.name === 'AbortError') return;
      console.error('Error fetching branch products:', error);
      if (isMountedRef.current) setProducts([]);
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) setLoading(false);
    }
  }, [orgId, branchId, searchTerm, categoryFilter, statusFilter, contextIsOffline]);

  // ---------- lifecycle ----------
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

  // Reset paging + skeleton when branch/filters change (not search)
  useEffect(() => {
    hasLoadedOnceRef.current = false;
    setCurrentPage(1);
  }, [branchId, categoryFilter, statusFilter]);

  // Fetch immediately when filters or branch change.
  // This replaces the "fetch inside the interval effect" behavior.
  useEffect(() => {
    if (!orgId || !branchId) return;
    fetchProducts();
  }, [orgId, branchId, searchTerm, categoryFilter, statusFilter, fetchProducts]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => setSearchTerm(searchInput), 400);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // ---------- periodic background refresh ----------
  // Pauses when tab is hidden. Also skips while offline (fetchProducts
  // handles the online check internally, but we short-circuit here so
  // the callback doesn't spin needlessly).
  usePolling(
    () => {
      if (contextIsOffline) return;
      if (!navigator.onLine) return;
      fetchProducts();
    },
    60_000,
    [orgId, branchId]
  );

  // ---------- handlers ----------
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
    setCurrentPage(1);
  };

  // Modal handlers
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
    setSelectedProduct(product);
    setShowStockModal(true);
  };

  const closeStockModal = () => {
    setShowStockModal(false);
    setSelectedProduct(null);
  };

  const openRemoveModal = (product) => {
    setProductToRemove(product);
    setShowRemoveModal(true);
  };

  const closeRemoveModal = () => {
    setShowRemoveModal(false);
    setProductToRemove(null);
  };

  // Action handlers
  const handleViewProduct = (product) => openDetailModal(product);
  const handleEditBranchProduct = (product) => openBranchProductModal(product);
  const handleUpdateStock = (product) => openStockModal(product);
  const handleRemoveProduct = (product) => openRemoveModal(product);

  // Branch product update — PATCH, no price
  const handleBranchProductUpdate = async () => {
    if (!selectedProduct || !orgId || !branchId) return;
    const productId = selectedProduct.productId;

    setSubmitting(true);
    try {
      await axios.patch(
        `/organizations/${orgId}/kxtill/branches/${branchId}/products/${productId}`,
        {
          displayName: branchProductData.displayName?.trim() || selectedProduct.productName,
          description: branchProductData.description?.trim() || undefined,
          isAvailable: branchProductData.isAvailable,
        }
      );
      toast.success('Branch product updated successfully');
      closeBranchProductModal();
      fetchProducts();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update branch product');
    } finally {
      setSubmitting(false);
    }
  };

  // Stock update — PATCH /stock with absolute values
  const handleStockUpdate = async (payload) => {
    if (!selectedProduct || !orgId || !branchId) return;
    const productId = selectedProduct.productId;

    setSubmitting(true);
    try {
      await axios.patch(
        `/organizations/${orgId}/kxtill/branches/${branchId}/products/${productId}/stock`,
        {
          stock: payload.stock,
          minStock: payload.minStock,
        }
      );

      toast.success(`Stock updated: ${payload.stock} ${selectedProduct.unit}`);
      closeStockModal();
      fetchProducts();
    } catch (error) {
      console.error('Stock update failed:', error);
      toast.error(error.response?.data?.message || 'Failed to update stock');
    } finally {
      setSubmitting(false);
    }
  };

  // Remove product from branch — soft (isAvailable: false)
  const confirmRemove = async () => {
    if (!productToRemove || !orgId || !branchId) return;
    setSubmitting(true);
    try {
      await axios.delete(
        `/organizations/${orgId}/kxtill/branches/${branchId}/products/${productToRemove.productId}`
      );
      toast.success('Product removed from this branch');
      closeRemoveModal();
      fetchProducts();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove product');
    } finally {
      setSubmitting(false);
    }
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (categoryFilter !== 'all') count++;
    if (statusFilter !== 'all') count++;
    if (searchTerm?.trim()) count++;
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

  return (
    <div className={styles.page}>
      {/* Header */}
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
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
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
              <option key={cat} value={cat}>{cat}</option>
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

          <button className={styles.refreshBtn} onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw size={14} className={isRefreshing ? styles.spinning : ''} />
          </button>

          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.active : ''}`}
              onClick={() => setViewMode('grid')}
            >
              <Grid size={14} />
            </button>
            <button
              className={`${styles.viewBtn} ${viewMode === 'list' ? styles.active : ''}`}
              onClick={() => setViewMode('list')}
            >
              <List size={14} />
            </button>
          </div>

          {getActiveFilterCount() > 0 && (
            <button className={styles.clearFiltersBtn} onClick={clearFilters}>
              <X size={14} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Products Display */}
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
              : 'No products available for this branch yet'}
          </p>
          {getActiveFilterCount() > 0 && (
            <button className={styles.clearFiltersBtnLarge} onClick={clearFilters}>
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

            return (
              <div key={product.id} className={styles.productCard}>
                <div className={styles.productCardHeader}>
                  <div className={styles.productCardIcon}>
                    <Package size={20} />
                  </div>
                  <div className={`${styles.productCardStatus} ${styles[status.variant]}`}>
                    <StatusIcon size={10} /> {status.label}
                  </div>
                </div>
                <div className={styles.productCardBody}>
                  <h3 className={styles.productCardName}>{product.name}</h3>
                  {!product.isAvailable && (
                    <span className={styles.unavailableTag}>Unavailable</span>
                  )}
                  {product.sku && product.sku !== '-' && (
                    <span className={styles.productCardSku}>SKU: {product.sku}</span>
                  )}
                  {product.category && product.category !== '-' && (
                    <span className={styles.productCardCategory}>{product.category}</span>
                  )}
                  <div className={styles.productCardStock}>
                    <span className={styles.productCardStockLabel}>Stock:</span>
                    <span className={stock <= minStock ? styles.productCardStockLow : ''}>
                      {stock} {product.unit}
                    </span>
                    {minStock > 0 && (
                      <span className={styles.productCardMinStock}>Min: {minStock}</span>
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
                    className={styles.productCardActionBtn}
                    onClick={() => handleViewProduct(product)}
                    title="View Details"
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    className={styles.productCardActionBtn}
                    onClick={() => handleUpdateStock(product)}
                    title="Update Stock"
                  >
                    <SlidersHorizontal size={14} />
                  </button>
                  <button
                    className={styles.productCardActionBtn}
                    onClick={() => handleEditBranchProduct(product)}
                    title="Edit Branch Product"
                  >
                    <Edit size={14} />
                  </button>
                  <button
                    className={`${styles.productCardActionBtn} ${styles.danger}`}
                    onClick={() => handleRemoveProduct(product)}
                    title="Remove from Branch"
                  >
                    <Trash2 size={14} />
                  </button>
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

                return (
                  <tr key={product.id} className={styles.tableRow}>
                    <td>
                      <div className={styles.productCell}>
                        <div className={styles.productCellIcon}>
                          <Package size={16} />
                        </div>
                        <div className={styles.productCellInfo}>
                          <span className={styles.productCellName}>{product.name}</span>
                          {!product.isAvailable && (
                            <span className={styles.unavailableTag}>Unavailable</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{product.sku !== '-' ? product.sku : '-'}</td>
                    <td>{product.category !== '-' ? product.category : '-'}</td>
                    <td>
                      <span className={stock <= minStock ? styles.stockLow : ''}>
                        {stock} {product.unit}
                        {minStock > 0 && (
                          <span className={styles.minStockLabel}>(min: {minStock})</span>
                        )}
                      </span>
                    </td>
                    <td>{formatCurrency(product.price)}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[status.variant]}`}>
                        <StatusIcon size={10} /> {status.label}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actionButtons}>
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleViewProduct(product)}
                          title="View Details"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleUpdateStock(product)}
                          title="Update Stock"
                        >
                          <SlidersHorizontal size={14} />
                        </button>
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleEditBranchProduct(product)}
                          title="Edit Branch Product"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          className={`${styles.actionBtn} ${styles.danger}`}
                          onClick={() => handleRemoveProduct(product)}
                          title="Remove from Branch"
                        >
                          <Trash2 size={14} />
                        </button>
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
          >
            <ChevronLeft size={16} /> Previous
          </button>
          <span className={styles.pageInfo}>
            Page {currentPage} of {totalPages} ({totalItems} items)
          </span>
          <button
            className={styles.pageBtn}
            onClick={() => handlePageChange(Math.min(currentPage + 1, totalPages))}
            disabled={currentPage === totalPages}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Modals */}
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
        currency={currency}
        formatCurrency={formatCurrency}
        mode="branch"
        activeBranch={activeBranch}
        onUpdateStock={() => {
          closeDetailModal();
          if (selectedProduct) handleUpdateStock(selectedProduct);
        }}
        onEditBranchProduct={() => {
          closeDetailModal();
          if (selectedProduct) handleEditBranchProduct(selectedProduct);
        }}
      />

      <BranchStockModal
        isOpen={showStockModal}
        onClose={closeStockModal}
        onSave={handleStockUpdate}
        product={selectedProduct}
        isSubmitting={submitting}
      />

      {/* Remove from Branch Confirmation */}
      {showRemoveModal && productToRemove && (
        <div className={styles.modalOverlay}>
          <div className={styles.confirmModal}>
            <div className={styles.confirmModalIcon}>
              <AlertCircle size={32} />
            </div>
            <h3>Remove from Branch</h3>
            <p>
              Remove <strong>{productToRemove.name}</strong> from{' '}
              <strong>{activeBranch?.name}</strong>? The product stays in the
              global catalog and can be re-added later.
            </p>
            <div className={styles.confirmModalActions}>
              <button
                className={styles.confirmCancelBtn}
                onClick={closeRemoveModal}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className={styles.confirmDeleteBtn}
                onClick={confirmRemove}
                disabled={submitting}
              >
                {submitting ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;