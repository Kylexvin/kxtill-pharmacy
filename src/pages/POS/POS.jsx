// src/pages/POS/POS.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import toast from 'react-hot-toast';
import { ScanLine, Store, RefreshCw, ShoppingCart } from 'lucide-react';
import ProductSearch from './ProductSearch';
import Cart from './Cart';
import PaymentModal from './PaymentModal';
import ReceiptModal from './ReceiptModal';
import styles from './POS.module.css';
import {
  getAllProducts,
  getBranchProducts,
  saveCart,
  clearCart,
  getActiveCart,
  createLocalSale,
  enqueueSync,
  getDb,
} from '../../db/sqlite';
import { initialSync, sync } from '../../sync/engine';

// ============================================================
// HELPERS
// ============================================================
function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

// ============================================================
// POS
// ============================================================
const POS = () => {
  const { activeOrganization, activeBranch, branches } = useAuth();

  const {
    formatCurrency,
    getCurrency,
    getDecimalPlaces,
    getDefaultPaymentMethod,    
  } = useSettings();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeValue, setBarcodeValue] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [initialSyncDone, setInitialSyncDone] = useState(false);

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [cartOpen, setCartOpen] = useState(false);

  const barcodeInputRef = useRef(null);
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const orgId = activeOrganization?.id;
  const branchId = activeBranch?.id;
  const currency = getCurrency();
  const decimalPlaces = getDecimalPlaces();
  const defaultPaymentMethod = getDefaultPaymentMethod();

  const hasValidBranch = branchId && branches?.some((b) => b.id === branchId);
  const shouldFetch = orgId && hasValidBranch && dbReady;

  const syncFlagKey =
    orgId && branchId ? `initialSyncDone:${orgId}:${branchId}` : null;

  // ---------- responsive ----------
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) setCartOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleCart = () => setCartOpen((open) => !open);
  const closeCart = () => setCartOpen(false);

  // ---------- DB readiness ----------
  useEffect(() => {
    let cancelled = false;
    let retryTimeout;

    const checkDb = async () => {
      try {
        await getDb();
        if (!cancelled) setDbReady(true);
      } catch (err) {
        if (!cancelled) {
          setDbReady(false);
          retryTimeout = setTimeout(checkDb, 1000);
        }
      }
    };
    checkDb();

    return () => {
      cancelled = true;
      clearTimeout(retryTimeout);
    };
  }, []);

  // ---------- persist cart ----------
  // Saves cart + customer to SQLite. Clears the row entirely when
  // both cart and customer are gone.
  useEffect(() => {
    if (!dbReady || !branchId) return;

    const persistCart = async () => {
      try {
        if (cartItems.length === 0 && !customer?.name) {
          await clearCart(branchId);
          return;
        }

        const cartSubtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
        await saveCart({
          branchId,
          customerName: customer?.name || null,
          customerId: customer?.id || null,
          customerTempId: customer?.tempId || null,
          customerPhone: customer?.phone || null,
          items: JSON.stringify(cartItems),
          total: cartSubtotal,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Failed to save cart:', err);
      }
    };

    persistCart();
  }, [cartItems, customer, branchId, dbReady]);
// ---------- restore cart from SQLite on mount / branch change ----------
useEffect(() => {
  if (!dbReady || !branchId) return;

  const restore = async () => {
    try {
      const saved = await getActiveCart(branchId);
      if (!saved) return;

      // Don't clobber an in-memory cart if POS is already mid-sale
      setCartItems((current) => {
        if (current.length > 0) return current;
        try {
          const parsed = JSON.parse(saved.items || '[]');
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      });

      if (saved.customerName) {
        setCustomer((current) => {
          if (current) return current;
          return {
            id: saved.customerId || saved.customerTempId || null,
            tempId: saved.customerTempId || null,
            name: saved.customerName,
            phone: saved.customerPhone || null,
          };
        });
      }
    } catch (err) {
      console.error('Failed to restore cart:', err);
    }
  };

  restore();
}, [dbReady, branchId]);

  // ---------- product fetch ----------
  const fetchProducts = useCallback(async () => {
    if (!dbReady || !shouldFetch || !branchId) return;
    setLoading(true);

    try {
      const allProducts = await getAllProducts();
      const branchProds = await getBranchProducts(branchId);

      const branchProductIds = new Set(branchProds.map((bp) => bp.productId));
      const filteredByBranch = allProducts.filter((p) =>
        branchProductIds.has(p.id)
      );

      let filtered = filteredByBranch;

      if (selectedCategory !== 'All') {
        filtered = filtered.filter((p) => p.category === selectedCategory);
      }

      if (debouncedSearch.trim()) {
        const query = debouncedSearch.trim().toLowerCase();
        filtered = filtered.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            (p.sku && p.sku.toLowerCase().includes(query))
        );
      }

      const merged = filtered.map((p) => {
        const bp = branchProds.find((b) => b.productId === p.id);
        const firstUnit = p.units && p.units.length > 0 ? p.units[0] : null;
        return {
          ...p,
          price: Number(firstUnit?.price) || 0,
          stock: Number(bp?.stock) || 0,
          minStock: Number(bp?.minStock) || 0,
          isAvailable: bp?.isAvailable === 1 || bp?.isAvailable === true,
          branchProductId: bp?.id,
          units: p.units || [],
          displayName: p.name,
        };
      });

      setProducts(merged);
    } catch (err) {
      console.error('Failed to fetch products:', err);
    } finally {
      setLoading(false);
    }
  }, [dbReady, branchId, shouldFetch, debouncedSearch, selectedCategory]);

  // ---------- initial sync + auto fetch ----------
  useEffect(() => {
    if (!dbReady || !shouldFetch || !branchId || !orgId || !syncFlagKey) {
      return;
    }

    const runInitialSync = async () => {
      const done = localStorage.getItem(syncFlagKey);
      if (done === 'true') {
        setInitialSyncDone(true);
        fetchProducts();
        return;
      }

      setSyncing(true);
      try {
        toast.loading('Syncing products...', { id: 'initial-sync' });
        await initialSync(branchId);
        localStorage.setItem(syncFlagKey, 'true');
        setInitialSyncDone(true);
        toast.success('Products synced', { id: 'initial-sync' });
        fetchProducts();
      } catch (err) {
        console.error('Initial sync failed:', err);
        toast.error('Failed to sync products', { id: 'initial-sync' });
        setInitialSyncDone(false);
      } finally {
        setSyncing(false);
      }
    };

    runInitialSync();
  }, [dbReady, shouldFetch, branchId, orgId, syncFlagKey, fetchProducts]);

  // ---------- categories ----------
  useEffect(() => {
    if (!dbReady || !shouldFetch || !initialSyncDone) return;

    const loadCategories = async () => {
      try {
        const allProducts = await getAllProducts();
        const unique = Array.from(
          new Set(allProducts.map((p) => p.category).filter(Boolean))
        );
        setCategories(['All', ...unique]);
      } catch (err) {
        console.error('Failed to load categories:', err);
      }
    };
    loadCategories();
  }, [dbReady, shouldFetch, initialSyncDone]);

  // ---------- refetch on branch / sync change ----------
  useEffect(() => {
    if (initialSyncDone && branchId) {
      fetchProducts();
      sync(branchId).catch(() => {});
    }
  }, [branchId, initialSyncDone, fetchProducts]);

  useEffect(() => {
    if (initialSyncDone) {
      fetchProducts();
    }
  }, [initialSyncDone, fetchProducts]);

  // ---------- manual sync ----------
  const handleManualSync = useCallback(async () => {
    if (syncing || !branchId || !syncFlagKey) return;
    setSyncing(true);
    try {
      toast.loading('Syncing...', { id: 'manual-sync' });
      const result = await sync(branchId);
      if (result.success) {
        localStorage.setItem(syncFlagKey, 'true');
        setInitialSyncDone(true);
        toast.success('Sync completed', { id: 'manual-sync' });
        fetchProducts();
      } else {
        toast.error('Sync failed: ' + (result.error || 'Unknown error'), {
          id: 'manual-sync',
        });
      }
    } catch (err) {
      toast.error('Sync failed', { id: 'manual-sync' });
    } finally {
      setSyncing(false);
    }
  }, [syncing, branchId, syncFlagKey, fetchProducts]);

  // ---------- barcode ----------
  const handleBarcodeSubmit = async (e) => {
    e.preventDefault();
    const code = barcodeValue.trim();
    if (!code || !orgId || !branchId || !dbReady) return;

    try {
      const allProducts = await getAllProducts();
      const branchProds = await getBranchProducts(branchId);
      const branchProductIds = new Set(branchProds.map((bp) => bp.productId));
      const availableProducts = allProducts.filter((p) =>
        branchProductIds.has(p.id)
      );

      let foundProduct = null;
      let foundUnit = null;

      for (const p of availableProducts) {
        const units = p.units || [];
        const match = units.find((u) => u.barcode === code);
        if (match) {
          foundProduct = p;
          foundUnit = match;
          break;
        }
        if (p.sku === code) {
          foundProduct = p;
          foundUnit = units[0];
          break;
        }
      }

      if (!foundProduct) {
        toast.error('Product not found');
        return;
      }

      const bp = branchProds.find((b) => b.productId === foundProduct.id);

      if (!bp || !bp.isAvailable || bp.stock <= 0) {
        toast.error(`${foundProduct.name} is not available`);
        return;
      }

      if (!foundUnit) {
        toast.error(`${foundProduct.name} has no sellable unit`);
        return;
      }

      addToCart(
        {
          id: foundProduct.id,
          productId: foundProduct.id,
          name: foundProduct.name,
          sku: foundProduct.sku,
          stock: bp.stock,
          branchProductId: bp.id,
        },
        foundUnit
      );
    } catch (err) {
      console.error('Barcode scan error:', err);
      toast.error('Barcode not found');
    } finally {
      setBarcodeValue('');
      barcodeInputRef.current?.focus();
    }
  };

  // ---------- cart operations ----------
  const addToCart = (product, unit) => {
    const productId = product.productId || product.id;
    const stock = Number(product.stock || 0);

    if (stock <= 0) {
      toast.error('This product is out of stock');
      return;
    }

    const existing = cartItems.find(
      (item) => item.productId === productId && item.unitId === unit.id
    );
    const currentQty = existing?.quantity || 0;
    const newQty = currentQty + 1;

    if (newQty > stock) {
      toast.error(`Not enough stock. Available: ${stock}`);
      return;
    }

    setCartItems((prev) => {
      if (existing) {
        return prev.map((item) =>
          item.productId === productId && item.unitId === unit.id
            ? {
                ...item,
                quantity: newQty,
                total: newQty * item.unitPrice,
                stock,
              }
            : item
        );
      }
return [
  ...prev,
  {
    id: `${productId}-${unit.id}-${Date.now()}`,
    productId,
    productName: product.name,
    unitId: unit.id,
    unitName: unit.name || unit.abbreviation || '',
    unitAbbrev: unit.abbreviation || unit.name || '',
    unitType: unit.unitType || 'unit',
    conversionQty: Number(unit.conversionQty || 1),
    unitPrice: Number(unit.price || 0),
    quantity: 1,
    total: Number(unit.price || 0),
    sku: product.sku,
    stock,
    branchProductId: product.branchProductId,
  },
];
    });
    toast.success(`${product.name} added to cart`);
  };

  const handleUpdateQuantity = (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      setCartItems((items) => items.filter((item) => item.id !== itemId));
      return;
    }

    const item = cartItems.find((i) => i.id === itemId);
    if (item) {
      const stock = Number(item.stock || 0);
      if (newQuantity > stock) {
        toast.error(`Not enough stock. Available: ${stock}`);
        return;
      }
    }

    setCartItems((items) =>
      items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              quantity: newQuantity,
              total: item.unitPrice * newQuantity,
            }
          : item
      )
    );
  };

  const handleRemoveItem = (itemId) => {
    setCartItems((items) => items.filter((item) => item.id !== itemId));
    toast.success('Item removed from cart');
  };

  const handleClearCart = () => {
    if (cartItems.length === 0) return;
    if (window.confirm('Clear all items from cart?')) {
      setCartItems([]);
      toast.success('Cart cleared');
    }
  };

  // ---------- totals ----------
  const subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
  // TODO: compute tax from settings once tax config exists
  const taxAmount = 0;
  const total = subtotal + taxAmount;
  const cartItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // ---------- checkout ----------
  const handleCheckout = () => {
    if (cartItems.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    if (!branchId) {
      toast.error('No active branch selected');
      return;
    }

    for (const item of cartItems) {
      const stock = Number(item.stock || 0);
      if (stock < item.quantity) {
        toast.error(
          `Not enough stock for ${item.productName}. Available: ${stock}`
        );
        return;
      }
    }

    setCartOpen(false);
    setShowPaymentModal(true);
  };

  const handlePaymentComplete = async ({ method, reference }) => {
    setCheckingOut(true);
    try {
      const clientSaleId = `sale_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}`;
      const now = new Date().toISOString();

// Denormalize items: persist display fields + computed totals alongside
// the references, so offline receipts and detail views work without the
// server. Anything the server needs is a subset of what we store here.
const saleItems = cartItems.map((item) => {
  const quantity = Number(item.quantity || 0);
  const unitPrice = Number(item.unitPrice || 0);
  const lineTotal = Number(item.total) || unitPrice * quantity;

  return {
    // References (needed by the server)
    productId: item.productId,
    branchProductId: item.branchProductId,
    unitId: item.unitId,

    // Denormalized display fields (needed by offline receipt + detail modal)
    productName: item.productName || item.name || 'Unknown',
    sku: item.sku || null,
    unitName: item.unitName || '',
    unitAbbrev: item.unitAbbrev || item.unitName || '',
    unitType: item.unitType || 'unit',
    conversionQty: Number(item.conversionQty || 1),

    // Numbers
    quantity,
    unitPrice,
    taxRate: Number(item.taxRate || 0),
    taxAmount: Number(item.taxAmount || 0),
    discount: Number(item.discount || 0),
    total: lineTotal,
  };
}); 

      const payments = [
        {
          method,
          amount: total,
          reference: reference || `PAY_${Date.now()}`,
        },
      ];

      const hasSyncedCustomer = customer && customer.id && !customer.tempId;
      const hasTempCustomer = customer && customer.tempId;

      const localSale = {
        id: clientSaleId,
        branchId,
        customerName: customer?.name || null,
        customerId: hasSyncedCustomer ? customer.id : null,
        customerTempId: hasTempCustomer ? customer.tempId : null,
        items: JSON.stringify(saleItems),
        payments: JSON.stringify(payments),
        subtotal,
        taxAmount,
        totalAmount: total,
        status: 'PENDING',
        syncedAt: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      };

      await createLocalSale(localSale);

      await enqueueSync('sale', clientSaleId, 'CREATE', {
        clientSaleId,
        branchId,
        customerId: hasSyncedCustomer ? customer.id : null,
        customerTempId: hasTempCustomer ? customer.tempId : null,
        customerName: customer?.name || null,
        items: saleItems,
        paymentMethod: method,
        paymentReference: reference,
      });

      sync(branchId).catch(() => {});

      // Hand raw data to ReceiptModal — it builds the text from settings.
      const receipt = {
        sale: {
          id: clientSaleId,
          reference: clientSaleId,
          createdAt: now,
          customerName: customer?.name || null,
        },
        items: cartItems.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.unitPrice * item.quantity,
        })),
        subtotal,
        taxAmount,
        total,
        payments,
        branchName: activeBranch?.name,
      };

      setCartItems([]);
      await clearCart(branchId);
      setCustomer(null);
      setShowPaymentModal(false);
      setCartOpen(false);
      setLastReceipt(receipt);
      fetchProducts();

      toast.success(`Sale completed — ${clientSaleId}`);
    } catch (err) {
      toast.error(err.message || 'Payment failed');
      throw err;
    } finally {
      setCheckingOut(false);
    }
  };

  // ---------- render helpers ----------
  const cartElement = (
    <Cart
      items={cartItems}
      subtotal={subtotal}
      taxAmount={taxAmount}
      total={total}
      customer={customer}
      onUpdateQuantity={handleUpdateQuantity}
      onRemoveItem={handleRemoveItem}
      onClearCart={handleClearCart}
      onCheckout={handleCheckout}
      onCustomerSelect={setCustomer}
    />
  );

  const cartRegion = isMobile ? (
    <>
      {cartOpen && <div className={styles.cartOverlay} onClick={closeCart} />}
      <div className={`${styles.cartSheet} ${cartOpen ? styles.open : ''}`}>
        <div className={styles.cartSheetHandle} onClick={closeCart}>
          <div className={styles.cartSheetDrag} />
        </div>
        {cartElement}
      </div>
    </>
  ) : (
    cartElement
  );

  const cartToggleButton = isMobile && (
    <button
      type="button"
      className={styles.cartToggle}
      onClick={toggleCart}
      title="View cart"
    >
      <ShoppingCart size={18} />
      {cartItemCount > 0 && (
        <span className={styles.cartBadge}>{cartItemCount}</span>
      )}
    </button>
  );

  // ---------- guard screens ----------
  if (!dbReady) {
    return (
      <div className={styles.pos}>
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>Loading database...</p>
        </div>
      </div>
    );
  }

  if (!activeOrganization || !activeBranch || !hasValidBranch) {
    return (
      <div className={styles.pos}>
        <div className={styles.noBranch}>
          <Store size={40} />
          <p>
            {!activeOrganization
              ? 'Select an organization to start selling'
              : "No branch selected or you don't have access"}
          </p>
        </div>
      </div>
    );
  }

  if (syncing && !initialSyncDone) {
    return (
      <div className={styles.pos}>
        <div className={styles.loadingState}>
          <RefreshCw size={40} className={styles.spinning} />
          <p>Syncing products...</p>
          <span>This may take a moment</span>
        </div>
      </div>
    );
  }

  // ---------- empty products state ----------
  if (!loading && products.length === 0 && initialSyncDone) {
    return (
      <div className={styles.pos}>
        <div className={styles.productsPanel}>
          <div className={styles.searchBar}>
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
            <form onSubmit={handleBarcodeSubmit} className={styles.barcodeForm}>
              <ScanLine size={16} className={styles.barcodeIcon} />
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Scan barcode..."
                value={barcodeValue}
                onChange={(e) => setBarcodeValue(e.target.value)}
                className={styles.barcodeInput}
              />
            </form>
            {cartToggleButton}
          </div>
          <div className={styles.emptyStateFull}>
            <Store size={48} />
            <p>No products available</p>
            <button
              className={styles.syncBtnLarge}
              onClick={handleManualSync}
              disabled={syncing}
              type="button"
            >
              <RefreshCw size={16} className={syncing ? styles.spinning : ''} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </div>
        {cartRegion}
      </div>
    );
  }

  // ---------- main render ----------
  return (
    <div className={styles.pos}>
      <div className={styles.productsPanel}>
        <div className={styles.searchBar}>
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
          <form onSubmit={handleBarcodeSubmit} className={styles.barcodeForm}>
            <ScanLine size={16} className={styles.barcodeIcon} />
            <input
              ref={barcodeInputRef}
              type="text"
              placeholder="Scan barcode..."
              value={barcodeValue}
              onChange={(e) => setBarcodeValue(e.target.value)}
              className={styles.barcodeInput}
            />
          </form>
          <button
            className={styles.syncBtn}
            onClick={handleManualSync}
            disabled={syncing}
            title="Sync now"
            type="button"
          >
            <RefreshCw size={16} className={syncing ? styles.spinning : ''} />
          </button>
          {cartToggleButton}
        </div>

        <div className={styles.categories}>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`${styles.categoryBtn} ${
                selectedCategory === cat ? styles.active : ''
              }`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <ProductSearch
          products={products}
          loading={loading}
          onAddToCart={addToCart}
          currency={currency}
        />
      </div>

      {cartRegion}

      {showPaymentModal && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          onPaymentComplete={handlePaymentComplete}
          total={total}
          currency={currency}
          decimalPlaces={decimalPlaces}
          formatCurrency={formatCurrency}
          cartItems={cartItems}
          customer={customer}
          isProcessing={checkingOut}
          defaultPaymentMethod={defaultPaymentMethod}
        />
      )}

      {lastReceipt && (
        <ReceiptModal
          receipt={lastReceipt}
          onClose={() => setLastReceipt(null)}
        />
      )}
    </div>
  );
};

export default POS;