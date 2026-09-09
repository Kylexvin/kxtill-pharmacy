// src/pages/POS/ProductSearch.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Package, Layers, X } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import styles from './POS.module.css';

const ProductSearch = ({ products, loading, onAddToCart }) => {
  const [openUnitsFor, setOpenUnitsFor] = useState(null);
  const gridRef = useRef(null);
  
  // Use settings for currency and decimal places
  const { getCurrency, getDecimalPlaces } = useSettings();
  const currency = getCurrency();
  const decimals = getDecimalPlaces();

  useEffect(() => {
    if (!openUnitsFor) return;

    const handleClickOutside = (e) => {
      if (gridRef.current && !gridRef.current.contains(e.target)) {
        setOpenUnitsFor(null);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setOpenUnitsFor(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openUnitsFor]);

  useEffect(() => {
    setOpenUnitsFor(null);
  }, [products]);

  const handleCardClick = (product) => {
    const units = product.units || [];
    if (units.length <= 1) {
      onAddToCart(product, units[0] || { id: 'default', name: 'Unit', price: product.price || 0 });
      return;
    }
    setOpenUnitsFor((current) => (current === product.id ? null : product.id));
  };

  const handleUnitPick = (product, unit) => {
    onAddToCart(product, unit);
    setOpenUnitsFor(null);
  };

  // Format price with proper decimal places
  const formatPrice = (amount) => {
    return Number(amount || 0).toFixed(decimals);
  };

  if (loading) {
    return (
      <div className={styles.productsGrid}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className={`${styles.productCard} ${styles.skeleton}`}>
            <div className={styles.productInfo}>
              <div className={styles.productTopText}>
                <div className={styles.productName} />
                <div className={styles.productSkuBar} />
              </div>
              <div className={styles.productPrice} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <div className={styles.emptyState}>
        <Package size={40} />
        <p>No products found</p>
        <span>Try a different search or category</span>
      </div>
    );
  }

  return (
    <div className={styles.productsGrid} ref={gridRef}>
      {products.map((product) => {
        const stock = Number(product.stock || 0);
        const minStock = Number(product.minStock || 0);
        const isOutOfStock = stock <= 0;
        const isLow = Number.isFinite(stock) && Number.isFinite(minStock) && stock <= minStock && !isOutOfStock;
        const unavailable = product.isAvailable === false || isOutOfStock;
        const units = product.units || [];
        const isOpen = openUnitsFor === product.id;

        return (
          <div key={product.id} className={styles.productCardWrap}>
            <button
              type="button"
              className={`${styles.productCard} ${unavailable ? styles.disabledCard : ''}`}
              onClick={() => !unavailable && handleCardClick(product)}
              disabled={unavailable}
            >
              {isOutOfStock && <span className={styles.lowStockBadge}>Out of Stock</span>}
              {isLow && !isOutOfStock && <span className={styles.lowStockBadge}>Low stock</span>}
              {unavailable && !isOutOfStock && <span className={styles.lowStockBadge}>Unavailable</span>}

              <div className={styles.productInfo}>
                <div className={styles.productTopText}>
                  <span className={styles.productNameText}>{product.displayName || product.name}</span>
                  <span className={styles.productSku}>{product.sku}</span>
                </div>
                <div className={styles.productBottomRow}>
                  <span className={styles.productPriceText}>
                    {formatPrice(product.price)} {currency}
                  </span>
                  {units.length > 1 && (
                    <span className={styles.unitsHint}>
                      <Layers size={11} />
                      {units.length}
                    </span>
                  )}
                </div>
              </div>
            </button>

            {isOpen && units.length > 1 && (
              <div className={styles.unitPopover}>
                <button
                  type="button"
                  className={styles.unitPopoverLabel}
                  onClick={() => setOpenUnitsFor(null)}
                >
                  <span>Choose unit</span>
                  <X size={12} />
                </button>
                {units.map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    className={styles.unitOption}
                    onClick={() => handleUnitPick(product, unit)}
                  >
                    <span>{unit.name}</span>
                    <span className={styles.unitPrice}>{formatPrice(unit.price)} {currency}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ProductSearch;