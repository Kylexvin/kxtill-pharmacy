// src/pages/Inventory/Inventory.jsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  Package,
  Search,
  Plus,
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
  DollarSign,
  List,
  Grid,
  Building2,
} from 'lucide-react';
import styles from './Inventory.module.css';
import ProductModal from './components/ProductModal';
import BranchProductModal from './components/BranchProductModal';
import ProductDetailModal from './components/ProductDetailModal';
import StockModal from './components/StockModal';

const Inventory = () => {
  const {
    activeOrganization,
    activeBranch,
    branches,
    isOffline: contextIsOffline,
    setActiveBranch,
    userPermissions,
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
  const [branchFilter, setBranchFilter] = useState(() => activeBranch?.id || 'all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isOnline, setIsOnline] = useState(!contextIsOffline);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [summary, setSummary] = useState(null);

  // Modal states
  const [showProductModal, setShowProductModal] = useState(false);
  const [showBranchProductModal, setShowBranchProductModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productToDelete, setProductToDelete] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [stockData, setStockData] = useState({ stock: '', minStock: '' });
  const [branchProductData, setBranchProductData] = useState({
    displayName: '',
    price: '',
    isAvailable: true,
  });
  // Track if we're in the "add stock after creation" flow
  const [isPostCreationFlow, setIsPostCreationFlow] = useState(false);

  const isMountedRef = useRef(true);
  const fetchControllerRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);

  const orgId = activeOrganization?.id;
  const limit = 20;
  const isOwner = userPermissions?.includes('*') || false;
  const canViewAllBranches = isOwner;
  const availableBranches = branches || [];

  // Helper functions
  const getServerBranchId = useCallback(() => {
    if (branchFilter !== 'all') return branchFilter;
    if (!canViewAllBranches) return activeBranch?.id || null;
    return null;
  }, [branchFilter, canViewAllBranches, activeBranch]);

  const getActiveBranchName = useCallback(() => {
    if (canViewAllBranches && branchFilter === 'all') return 'All Branches';
    if (branchFilter !== 'all') {
      const branch = availableBranches.find(b => b.id === branchFilter);
      return branch?.name || 'Unknown Branch';
    }
    return activeBranch?.name || 'No Branch Selected';
  }, [canViewAllBranches, branchFilter, availableBranches, activeBranch]);

  const getStockStatus = (product) => {
    const stock = Number(product.stock || 0);
    const minStock = Number(product.minStock || 0);
    if (stock <= 0) return { label: 'Out of Stock', variant: 'danger', icon: AlertCircle };
    if (stock <= minStock) return { label: 'Low Stock', variant: 'warning', icon: AlertTriangle };
    return { label: 'In Stock', variant: 'success', icon: Check };
  };

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    if (!orgId) return;
    try {
      const response = await axios.get(`/organizations/${orgId}/kxtill/inventory/summary`);
      if (isMountedRef.current) setSummary(response.data);
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    }
  }, [orgId]);

  // Fetch products
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

      const serverBranchId = getServerBranchId();
      let endpoint = `/organizations/${orgId}/kxtill/products`;
      if (serverBranchId) {
        endpoint = `/organizations/${orgId}/kxtill/branches/${serverBranchId}/products`;
      }

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
          console.warn('Server fetch failed:', error.message);
        }
      }

      if (controller.signal.aborted || !isMountedRef.current) return;

      const transformed = productData.map(p => {
        const baseUnit = p.baseUnit || {};
        const unit = p.units?.[0] || baseUnit;
        const branchProduct = p.branchProducts?.[0] || p;

        return {
          id: p.id,
          productId: p.productId || p.id,
          name: p.displayName || p.name,
          sku: p.sku || '-',
          category: p.category || '-',
          price: parseFloat(unit.price || p.price || 0),
          cost: parseFloat(unit.cost || p.cost || 0),
          stock: parseFloat(branchProduct.stock || p.stock || 0),
          minStock: parseFloat(branchProduct.minStock || p.minStock || 0),
          unit: unit.abbreviation || unit.name || 'units',
          allowFractional: unit.allowFractional || false,
          isAvailable: p.isAvailable !== false,
          branchProducts: p.branchProducts || [],
          units: p.units || [],
          baseUnit: baseUnit,
          branchId: p.branchId,
          branchName: p.branchName,
          displayName: p.displayName,
          branchProductId: branchProduct.id || p.id,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
      });

      let filtered = transformed;
      if (statusFilter === 'in-stock') {
        filtered = filtered.filter(p => p.stock > p.minStock);
      } else if (statusFilter === 'low-stock') {
        filtered = filtered.filter(p => p.stock <= p.minStock && p.stock > 0);
      } else if (statusFilter === 'out-of-stock') {
        filtered = filtered.filter(p => p.stock <= 0);
      }

      setProducts(filtered);
      hasLoadedOnceRef.current = true;

      const uniqueCategories = [...new Set(productData.map(p => p.category).filter(Boolean))];
      setCategories(uniqueCategories);

    } catch (error) {
      if (error.name === 'CanceledError' || error.name === 'AbortError') return;
      console.error('Error fetching products:', error);
      if (isMountedRef.current) setProducts([]);
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) setLoading(false);
    }
  }, [orgId, searchTerm, categoryFilter, statusFilter, getServerBranchId, contextIsOffline]);

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
  }, [getServerBranchId, categoryFilter, statusFilter]);

  useEffect(() => {
    if (orgId) {
      fetchProducts();
      fetchSummary();
    }
  }, [fetchProducts, fetchSummary, orgId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, statusFilter, branchFilter]);

  useEffect(() => {
    const handler = setTimeout(() => setSearchTerm(searchInput), 400);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Auto-refresh
  useEffect(() => {
    if (!isOnline || contextIsOffline) return;
    const interval = setInterval(() => {
      if (navigator.onLine && !contextIsOffline) {
        fetchProducts();
        fetchSummary();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [isOnline, contextIsOffline, fetchProducts, fetchSummary]);

  // Handlers
  const handleRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    Promise.all([fetchProducts(), fetchSummary()])
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
    setBranchFilter(activeBranch?.id || 'all');
    setCurrentPage(1);
  };

  // Modal handlers
  const openProductModal = (product = null) => {
    setEditingProduct(product);
    setIsPostCreationFlow(false);
    setShowProductModal(true);
  };

  const closeProductModal = () => {
    setShowProductModal(false);
    setEditingProduct(null);
  };

  const openBranchProductModal = (product) => {
    setSelectedProduct(product);
    setBranchProductData({
      displayName: product.displayName || product.name,
      price: product.price?.toString() || '',
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

  const openStockModal = (product, isPostCreation = false) => {
    setSelectedProduct(product);
    setStockData({
      stock: '',
      minStock: product.minStock?.toString() || '5',
    });
    setIsPostCreationFlow(isPostCreation);
    setShowStockModal(true);
  };

  const closeStockModal = () => {
    setShowStockModal(false);
    setSelectedProduct(null);
    setStockData({ stock: '', minStock: '' });
    setIsPostCreationFlow(false);
  };

  const openDeleteModal = (product) => {
    setProductToDelete(product);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setProductToDelete(null);
  };

  // Action handlers
  const handleViewProduct = (product) => {
    openDetailModal(product);
  };

  const handleEditProduct = (product) => {
    openProductModal(product);
  };

  const handleEditBranchProduct = (product) => {
    openBranchProductModal(product);
  };

  const handleUpdateStock = (product) => {
    openStockModal(product, false);
  };

  const handleDeleteProduct = (product) => {
    openDeleteModal(product);
  };

  const confirmDelete = async () => {
    if (!productToDelete || !orgId) return;
    setSubmitting(true);
    try {
      await axios.delete(
        `/organizations/${orgId}/kxtill/products/${productToDelete.productId || productToDelete.id}`
      );
      toast.success('Product deleted successfully');
      closeDeleteModal();
      fetchProducts();
      fetchSummary();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete product');
    } finally {
      setSubmitting(false);
    }
  };

  // ✅ Updated: Handle stock update with branch selection
  const handleStockUpdate = async (payload) => {
    if (!selectedProduct || !orgId) return;
    
    const { branchId, quantity, operation } = payload;
    const productId = selectedProduct.productId || selectedProduct.id;

    setSubmitting(true);
    try {
      let newStock;
      const currentStock = selectedProduct.stock || 0;
      
      if (operation === 'add') {
        newStock = currentStock + quantity;
      } else {
        newStock = quantity;
      }

      await axios.patch(
        `/organizations/${orgId}/kxtill/branches/${branchId}/products/${productId}/stock`,
        {
          stock: newStock,
        }
      );
      
      toast.success(`Stock updated! ${newStock} ${selectedProduct.unit}`);
      closeStockModal();
      fetchProducts();
      fetchSummary();
    } catch (error) {
      console.error('Stock update failed:', error);
      toast.error(error.response?.data?.message || 'Failed to update stock');
    } finally {
      setSubmitting(false);
    }
  };

  // ✅ Updated: Handle product save with auto-open stock modal
  const handleProductSave = async (productData) => {
    if (!orgId) return;
    setSubmitting(true);
    
    try {
      let response;
      if (editingProduct) {
        // Update existing product
        response = await axios.put(
          `/organizations/${orgId}/kxtill/products/${editingProduct.productId || editingProduct.id}`,
          productData
        );
        toast.success('Product updated successfully');
        closeProductModal();
        fetchProducts();
        fetchSummary();
      } else {
        // Create new product globally
        response = await axios.post(`/organizations/${orgId}/kxtill/products`, productData);
        const newProduct = response.data.product || response.data;
        
        // Get the branch ID from the form or use current branch
        const branchId = productData.branchId || activeBranch?.id || availableBranches[0]?.id;
        
        toast.success(`"${newProduct.name}" created successfully!`);
        closeProductModal();
        
        // ✅ Auto-open stock modal for the new product
        const productForStock = {
          id: newProduct.id,
          productId: newProduct.id,
          name: newProduct.name,
          sku: newProduct.sku || '-',
          unit: newProduct.baseUnit?.abbreviation || 'units',
          stock: 0,
          minStock: parseFloat(productData.minStock) || 5,
          branchId: branchId,
          allowFractional: newProduct.baseUnit?.allowFractional || false,
          branchName: availableBranches.find(b => b.id === branchId)?.name || 'Current Branch',
        };
        
        // Open stock modal with the new product
        setSelectedProduct(productForStock);
        setStockData({
          stock: '',
          minStock: productData.minStock?.toString() || '5',
        });
        setIsPostCreationFlow(true);
        setShowStockModal(true);
        
        // Refresh the list in background
        fetchProducts();
        fetchSummary();
      }
    } catch (error) {
      console.error('Save failed:', error);
      toast.error(error.response?.data?.message || 'Failed to save product');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBranchProductUpdate = async () => {
    if (!selectedProduct || !orgId) return;
    const branchId = selectedProduct.branchId || activeBranch?.id;
    const productId = selectedProduct.productId || selectedProduct.id;

    setSubmitting(true);
    try {
      await axios.put(
        `/organizations/${orgId}/kxtill/branches/${branchId}/products/${productId}`,
        {
          displayName: branchProductData.displayName || selectedProduct.name,
          price: parseFloat(branchProductData.price) || 0,
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

  const getActiveFilterCount = () => {
    let count = 0;
    if (categoryFilter !== 'all') count++;
    if (statusFilter !== 'all') count++;
    if (branchFilter !== 'all') count++;
    if (searchTerm?.trim()) count++;
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

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerTitle}>
            <Package size={20} />
            <h1>Inventory</h1>
          </div>
          <span className={styles.headerSubtitle}>{getActiveBranchName()}</span>
        </div>
        <div className={styles.headerRight}>
          {!isOnline && (
            <span className={styles.offlineBadge}>
              <Clock size={14} /> Offline
            </span>
          )}
          {isOwner && <span className={styles.ownerBadge}>Owner</span>}
          <button className={styles.addProductBtn} onClick={() => openProductModal()}>
            <Plus size={16} /> Add Product
          </button>
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
            <span className={styles.statValue}>{summary?.totalProducts || 0}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconValue}`}>
            <DollarSign size={18} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Stock Value</span>
            <span className={styles.statValue}>{formatCurrency(summary?.totalStockValue || 0)}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconLow}`}>
            <AlertTriangle size={18} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Low Stock</span>
            <span className={styles.statValue}>{summary?.lowStock || 0}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconOut}`}>
            <AlertCircle size={18} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Out of Stock</span>
            <span className={styles.statValue}>{summary?.outOfStock || 0}</span>
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
              : 'Start by adding your first product'}
          </p>
          {getActiveFilterCount() > 0 && (
            <button className={styles.clearFiltersBtnLarge} onClick={clearFilters}>
              Clear Filters
            </button>
          )}
          <button className={styles.addProductBtnLarge} onClick={() => openProductModal()}>
            <Plus size={16} /> Add Product
          </button>
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
                  {product.sku && product.sku !== '-' && (
                    <span className={styles.productCardSku}>SKU: {product.sku}</span>
                  )}
                  {product.category && product.category !== '-' && (
                    <span className={styles.productCardCategory}>{product.category}</span>
                  )}
                  {product.branchName && (
                    <span className={styles.productCardBranch}>
                      <Building2 size={12} /> {product.branchName}
                    </span>
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
                  <button className={styles.productCardActionBtn} onClick={() => handleViewProduct(product)}>
                    <Eye size={14} />
                  </button>
                  <button className={styles.productCardActionBtn} onClick={() => handleEditBranchProduct(product)}>
                    <Edit size={14} />
                  </button>
                  <button className={styles.productCardActionBtn} onClick={() => handleUpdateStock(product)}>
                    <RefreshCw size={14} />
                  </button>
                  {isOwner && (
                    <button className={`${styles.productCardActionBtn} ${styles.danger}`} onClick={() => handleDeleteProduct(product)}>
                      <Trash2 size={14} />
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
                <th>Branch</th>
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
                        <span className={styles.productCellName}>{product.name}</span>
                      </div>
                    </td>
                    <td>{product.sku !== '-' ? product.sku : '-'}</td>
                    <td>{product.category !== '-' ? product.category : '-'}</td>
                    <td>{product.branchName || '-'}</td>
                    <td>
                      <span className={stock <= minStock ? styles.stockLow : ''}>
                        {stock} {product.unit}
                        {minStock > 0 && <span className={styles.minStockLabel}>(min: {minStock})</span>}
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
                          onClick={() => handleEditBranchProduct(product)}
                          title="Edit Branch Product"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleUpdateStock(product)}
                          title="Update Stock"
                        >
                          <RefreshCw size={14} />
                        </button>
                        {isOwner && (
                          <button
                            className={`${styles.actionBtn} ${styles.danger}`}
                            onClick={() => handleDeleteProduct(product)}
                            title="Delete"
                          >
                            <Trash2 size={14} />
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
      <ProductModal
        isOpen={showProductModal}
        onClose={closeProductModal}
        onSave={handleProductSave}
        product={editingProduct}
        isSubmitting={submitting}
        currency={currency}
        branches={availableBranches}
        activeBranch={activeBranch}
      />

      <BranchProductModal
        isOpen={showBranchProductModal}
        onClose={closeBranchProductModal}
        onSave={handleBranchProductUpdate}
        product={selectedProduct}
        branchProductData={branchProductData}
        setBranchProductData={setBranchProductData}
        isSubmitting={submitting}
        currency={currency}
        activeBranch={activeBranch}
      />

      <ProductDetailModal
        isOpen={showDetailModal}
        onClose={closeDetailModal}
        product={selectedProduct}
        currency={currency}
        formatCurrency={formatCurrency}
        onEdit={() => {
          closeDetailModal();
          if (selectedProduct) handleEditBranchProduct(selectedProduct);
        }}
        onUpdateStock={() => {
          closeDetailModal();
          if (selectedProduct) handleUpdateStock(selectedProduct);
        }}
      />

      <StockModal
        isOpen={showStockModal}
        onClose={closeStockModal}
        onSave={handleStockUpdate}
        product={selectedProduct}
        stockData={stockData}
        setStockData={setStockData}
        isSubmitting={submitting}
        activeBranch={activeBranch}
        branches={availableBranches}
        isPostCreation={isPostCreationFlow}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && productToDelete && (
        <div className={styles.modalOverlay}>
          <div className={styles.confirmModal}>
            <div className={styles.confirmModalIcon}>
              <AlertCircle size={32} />
            </div>
            <h3>Delete Product</h3>
            <p>Are you sure you want to delete <strong>{productToDelete.name}</strong>? This action cannot be undone.</p>
            <div className={styles.confirmModalActions}>
              <button className={styles.confirmCancelBtn} onClick={closeDeleteModal} disabled={submitting}>
                Cancel
              </button>
              <button className={styles.confirmDeleteBtn} onClick={confirmDelete} disabled={submitting}>
                {submitting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;