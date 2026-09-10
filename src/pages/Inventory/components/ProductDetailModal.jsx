// src/pages/Inventory/components/ProductDetailModal.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  X,
  Package,
  Edit,
  SlidersHorizontal,
  AlertCircle,
  AlertTriangle,
  Check,
  Building2,
  Tag,
} from 'lucide-react';
import styles from './ProductDetailModal.module.css';

const ProductDetailModal = ({
  isOpen,
  onClose,
  product,
  currency,
  formatCurrency,
  mode = 'global',
  activeBranch = null,
  onEdit,
  onUpdateStock,
  onEditBranchProduct,
}) => {
  const isGlobal = mode === 'global';
  const baseUnit = product?.baseUnit || {};
  const unitAbbr = baseUnit.abbreviation || baseUnit.name || 'units';

  const [branchPrices, setBranchPrices] = useState([]);
  const [pricesLoading, setPricesLoading] = useState(false);

  // Lazy-fetch branch price overrides only in branch mode
  useEffect(() => {
    if (!isOpen || isGlobal || !product) return;
    const orgId = product.__orgId;
    const branchId = activeBranch?.id || product.__branchId;
    const productId = product.productId;
    if (!orgId || !branchId || !productId) return;

    let cancelled = false;
    setPricesLoading(true);
    axios
      .get(
        `/organizations/${orgId}/kxtill/branches/${branchId}/products/${productId}/prices`
      )
      .then(res => {
        if (!cancelled) setBranchPrices(res.data.unitPrices || []);
      })
      .catch(() => {
        if (!cancelled) setBranchPrices([]);
      })
      .finally(() => {
        if (!cancelled) setPricesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, isGlobal, product, activeBranch?.id]);

  if (!isOpen || !product) return null;

  const branchProducts = product.branchProducts || [];
  const isBranchMode = !isGlobal;

  // ---- Aggregate stats for global mode ----
  const totalStock = branchProducts.reduce(
    (sum, bp) => sum + Number(bp.stock || 0),
    0
  );
  const totalMinStock = branchProducts.reduce(
    (sum, bp) => sum + Number(bp.minStock || 0),
    0
  );

  // ---- Status ----
  const getGlobalStatus = () => {
    if (branchProducts.length === 0) {
      return { label: 'No Branches', variant: 'danger', icon: AlertCircle };
    }
    const outCount = branchProducts.filter(bp => Number(bp.stock) <= 0).length;
    const lowCount = branchProducts.filter(
      bp => Number(bp.stock) > 0 && Number(bp.stock) <= Number(bp.minStock)
    ).length;

    if (outCount === branchProducts.length) {
      return { label: 'Out of Stock', variant: 'danger', icon: AlertCircle };
    }
    if (lowCount + outCount > 0) {
      return { label: 'Low Stock', variant: 'warning', icon: AlertTriangle };
    }
    return { label: 'In Stock', variant: 'success', icon: Check };
  };

  const getBranchStatus = () => {
    const stock = Number(product.stock || 0);
    const minStock = Number(product.minStock || 0);
    if (stock <= 0) return { label: 'Out of Stock', variant: 'danger', icon: AlertCircle };
    if (stock <= minStock) return { label: 'Low Stock', variant: 'warning', icon: AlertTriangle };
    return { label: 'In Stock', variant: 'success', icon: Check };
  };

  const status = isGlobal ? getGlobalStatus() : getBranchStatus();
  const StatusIcon = status.icon;

  const displayedStock = isGlobal ? totalStock : Number(product.stock || 0);
  const stockLabel = isGlobal
    ? 'Total Stock'
    : `Stock — ${activeBranch?.name || 'Branch'}`;

  // ---- Per-branch pill helper ----
  const getBranchPill = (bp) => {
    const stock = Number(bp.stock || 0);
    const minStock = Number(bp.minStock || 0);
    if (stock <= 0) return { label: 'Out', variant: 'danger' };
    if (stock <= minStock) return { label: 'Low', variant: 'warning' };
    return { label: 'OK', variant: 'success' };
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.title}>
            <Package size={18} />
            <span>Product Details</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Product Information */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Product Information</h4>
            <div className={styles.detailGrid}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Name</span>
                <span className={styles.detailValue}>
                  {product.displayName || product.name || product.productName}
                </span>
              </div>
              {isBranchMode && product.displayName && product.productName &&
                product.displayName !== product.productName && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Catalog name</span>
                    <span className={styles.detailValue}>{product.productName}</span>
                  </div>
                )}
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>SKU</span>
                <span className={styles.detailValue}>{product.sku || '—'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Category</span>
                <span className={styles.detailValue}>{product.category || '—'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Unit</span>
                <span className={styles.detailValue}>
                  {baseUnit.name ? `${baseUnit.name} (${unitAbbr})` : '—'}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Fractional</span>
                <span className={styles.detailValue}>
                  {baseUnit.allowFractional ? 'Yes' : 'No'}
                </span>
              </div>
              {isBranchMode && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Available</span>
                  <span className={styles.detailValue}>
                    {product.isAvailable ? 'Yes' : 'No'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Pricing & Stock */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Pricing &amp; Stock</h4>
            <div className={styles.detailGrid}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Price</span>
                <span className={styles.detailValue}>
                  {formatCurrency(product.price)}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Cost</span>
                <span className={styles.detailValue}>
                  {formatCurrency(product.cost)}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{stockLabel}</span>
                <span className={styles.detailValue}>
                  {displayedStock} {unitAbbr}
                </span>
              </div>
              {!isGlobal && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Min Stock</span>
                  <span className={styles.detailValue}>
                    {product.minStock} {unitAbbr}
                  </span>
                </div>
              )}
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Status</span>
                <span className={`${styles.statusBadge} ${styles[status.variant]}`}>
                  <StatusIcon size={10} /> {status.label}
                </span>
              </div>
            </div>
          </div>

          {/* Branch Price Overrides — branch mode only */}
          {isBranchMode && (
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>
                <Tag size={13} /> Branch Price Overrides
              </h4>
              {pricesLoading ? (
                <div className={styles.detailGrid}>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Loading…</span>
                  </div>
                </div>
              ) : branchPrices.length === 0 ? (
                <div className={styles.infoBox}>
                  Using global prices. No branch overrides set.
                </div>
              ) : (
                <div className={styles.detailGrid}>
                  {branchPrices.map(pr => (
                    <div key={pr.id} className={styles.detailRow}>
                      <span className={styles.detailLabel}>
                        {pr.unitName} {pr.unitAbbreviation ? `(${pr.unitAbbreviation})` : ''}
                      </span>
                      <span className={styles.detailValue}>
                        {formatCurrency(pr.price)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* All Branch Stock Levels — global mode only */}
          {isGlobal && branchProducts.length > 0 && (
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>
                <Building2 size={13} /> All Branch Stock Levels
              </h4>
              <div className={styles.branchList}>
                {branchProducts.map((bp) => {
                  const pill = getBranchPill(bp);
                  return (
                    <div key={bp.id || bp.branchId} className={styles.branchRow}>
                      <div className={styles.branchInfo}>
                        <span className={styles.branchName}>
                          {bp.branch?.name || bp.branchName || 'Unknown Branch'}
                        </span>
                        <span className={styles.branchMeta}>
                          min {bp.minStock} {unitAbbr}
                        </span>
                      </div>
                      <div className={styles.branchRight}>
                        <span className={styles.branchStock}>
                          {Number(bp.stock || 0)} {unitAbbr}
                        </span>
                        <span className={`${styles.branchStatus} ${styles[pill.variant]}`}>
                          {pill.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose} type="button">
            Close
          </button>

          {isGlobal ? (
            onEdit && (
              <button className={styles.editBtn} onClick={onEdit} type="button">
                <Edit size={14} /> Edit Product
              </button>
            )
          ) : (
            <>
              {onUpdateStock && (
                <button
                  className={styles.cancelBtn}
                  onClick={onUpdateStock}
                  type="button"
                >
                  <SlidersHorizontal size={14} /> Adjust Stock
                </button>
              )}
              {onEditBranchProduct && (
                <button
                  className={styles.editBtn}
                  onClick={onEditBranchProduct}
                  type="button"
                >
                  <Edit size={14} /> Edit Branch Product
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductDetailModal;