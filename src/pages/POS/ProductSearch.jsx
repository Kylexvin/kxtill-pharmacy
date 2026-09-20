// src/pages/POS/ProductSearch.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Package, Layers, X } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import styles from './POS.module.css';

const POPOVER_MIN_WIDTH = 200;
const POPOVER_MAX_HEIGHT = 260;
const GAP = 6;

const ProductSearch = ({ products, loading, onAddToCart }) => {
  const [openUnitsFor, setOpenUnitsFor] = useState(null);
  const [popoverStyle, setPopoverStyle] = useState(null);

  const cardRefs = useRef({});
  const popoverRef = useRef(null);

  const { getCurrency, getDecimalPlaces } = useSettings();
  const currency = getCurrency();
  const decimals = getDecimalPlaces();

  // Close on click-outside, Escape, or scroll/resize (position would go
  // stale otherwise — simplest correct behavior is to just close it).
  useEffect(() => {
    if (!openUnitsFor) return;

    const handleClickOutside = (e) => {
      const cardEl = cardRefs.current[openUnitsFor];
      const clickedCard = cardEl && cardEl.contains(e.target);
      const clickedPopover = popoverRef.current && popoverRef.current.contains(e.target);
      if (!clickedCard && !clickedPopover) {
        setOpenUnitsFor(null);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setOpenUnitsFor(null);
    };
    const handleClose = () => setOpenUnitsFor(null);

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    // capture:true so this also fires for scrolling inside .productsGrid,
    // not just window-level scroll
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('resize', handleClose);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, [openUnitsFor]);

  useEffect(() => {
    setOpenUnitsFor(null);
  }, [products]);

  // Measures the clicked card and computes where the popover should sit:
  // below by default, flipped above if there's not enough room below,
  // and clamped horizontally so it never runs off the screen edge.
  const openPickerForCard = (productId) => {
    const cardEl = cardRefs.current[productId];
    if (!cardEl) return;

    const rect = cardEl.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const spaceBelow = viewportH - rect.bottom - GAP;
    const spaceAbove = rect.top - GAP;
    const openAbove = spaceBelow < POPOVER_MAX_HEIGHT && spaceAbove > spaceBelow;

    const availableSpace = openAbove ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(120, Math.min(POPOVER_MAX_HEIGHT, availableSpace));

    const width = Math.max(rect.width, POPOVER_MIN_WIDTH);
    let left = rect.left;
    if (left + width > viewportW - GAP) {
      left = viewportW - width - GAP;
    }
    if (left < GAP) left = GAP;

    setPopoverStyle({
      position: 'fixed',
      left,
      width,
      maxHeight,
      ...(openAbove
        ? { bottom: viewportH - rect.top + GAP, top: 'auto' }
        : { top: rect.bottom + GAP, bottom: 'auto' }),
    });
    setOpenUnitsFor(productId);
  };

  const handleCardClick = (product) => {
    const units = product.units || [];
    if (units.length <= 1) {
      onAddToCart(product, units[0] || { id: 'default', name: 'Unit', price: product.price || 0 });
      return;
    }
    if (openUnitsFor === product.id) {
      setOpenUnitsFor(null);
      return;
    }
    openPickerForCard(product.id);
  };

  const handleUnitPick = (product, unit) => {
    onAddToCart(product, unit);
    setOpenUnitsFor(null);
  };

  const formatPrice = (amount) => Number(amount || 0).toFixed(decimals);

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

  const openProduct = openUnitsFor
    ? products.find((p) => p.id === openUnitsFor)
    : null;

  return (
    <div className={styles.productsGrid}>
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
              ref={(el) => { cardRefs.current[product.id] = el; }}
              type="button"
              className={`${styles.productCard} ${unavailable ? styles.disabledCard : ''} ${isOpen ? styles.selected : ''}`}
              onClick={() => !unavailable && handleCardClick(product)}
              disabled={unavailable}
            >
              {isOutOfStock && <span className={styles.lowStockBadge}>Out of Stock</span>}
              {isLow && !isOutOfStock && <span className={styles.lowStockBadge}>Low stock</span>}
              {unavailable && !isOutOfStock && <span className={styles.lowStockBadge}>Unavailable</span>}
              {!isOutOfStock && <span className={styles.stockTag}>{stock}</span>}

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
          </div>
        );
      })}

      {openProduct && (
        <div ref={popoverRef} className={styles.unitPopover} style={popoverStyle || {}}>
          <button
            type="button"
            className={styles.unitPopoverLabel}
            onClick={() => setOpenUnitsFor(null)}
          >
            <span>Choose unit</span>
            <X size={12} />
          </button>
          <div className={styles.unitPopoverList}>
            {(openProduct.units || []).map((unit) => (
              <button
                key={unit.id}
                type="button"
                className={styles.unitOption}
                onClick={() => handleUnitPick(openProduct, unit)}
              >
                <span>{unit.name}</span>
                <span className={styles.unitPrice}>
                  {formatPrice(unit.price)} {currency}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductSearch;