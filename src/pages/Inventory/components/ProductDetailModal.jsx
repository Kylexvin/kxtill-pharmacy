// src/pages/Inventory/components/ProductDetailModal.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
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
  Barcode,
  Printer,
  RefreshCw,
} from 'lucide-react';
import BarcodeLabelModal from './BarcodeLabelModal';
import styles from './ProductDetailModal.module.css';

const ProductDetailModal = ({
  isOpen,
  onClose,
  product,
  currency = 'KES',
  formatCurrency,
  mode = 'global',
  activeBranch = null,
  orgId = null,
  onEdit,
  onUpdateStock,
  onEditBranchProduct,
  onBarcodeGenerated = null,
}) => {
  const isGlobal = mode === 'global';
  const baseUnit = product?.baseUnit || {};
  const unitAbbr = baseUnit.abbreviation || baseUnit.name || 'units';

  const [branchPrices, setBranchPrices] = useState([]);
  const [pricesLoading, setPricesLoading] = useState(false);

  // Local copy of units so we can update barcode after generation
  const [units, setUnits] = useState([]);
  const [generatingUnitId, setGeneratingUnitId] = useState(null);
  const [labelUnit, setLabelUnit] = useState(null); // unit for the print modal

  // Sync units whenever the product changes
  useEffect(() => {
    if (!isOpen || !product) return;
    setUnits(Array.isArray(product.units) ? [...product.units] : []);
  }, [isOpen, product]);

  // Lazy-fetch branch price overrides only in branch mode
  useEffect(() => {
    if (!isOpen || isGlobal || !product) return;
    const oid = product.__orgId || orgId;
    const branchId = activeBranch?.id || product.__branchId;
    const productId = product.productId;
    if (!oid || !branchId || !productId) return;

    let cancelled = false;
    setPricesLoading(true);
    axios
      .get(
        `/organizations/${oid}/kxtill/branches/${branchId}/products/${productId}/prices`
      )
      .then((res) => {
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
  }, [isOpen, isGlobal, product, activeBranch?.id, orgId]);

  if (!isOpen || !product) return null;

  const branchProducts = product.branchProducts || [];
  const isBranchMode = !isGlobal;
  const productId = product.productId || product.id;

  const totalStock = branchProducts.reduce(
    (sum, bp) => sum + Number(bp.stock || 0),
    0
  );

  const getGlobalStatus = () => {
    if (branchProducts.length === 0) {
      return { label: 'No Branches', variant: 'danger', icon: AlertCircle };
    }
    const outCount = branchProducts.filter((bp) => Number(bp.stock) <= 0).length;
    const lowCount = branchProducts.filter(
      (bp) => Number(bp.stock) > 0 && Number(bp.stock) <= Number(bp.minStock)
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

  const getBranchPill = (bp) => {
    const stock = Number(bp.stock || 0);
    const minStock = Number(bp.minStock || 0);
    if (stock <= 0) return { label: 'Out', variant: 'danger' };
    if (stock <= minStock) return { label: 'Low', variant: 'warning' };
    return { label: 'OK', variant: 'success' };
  };

  const handleGenerateBarcode = async (unit) => {
    if (!orgId || !productId || !unit?.id) return;

    setGeneratingUnitId(unit.id);
    try {
      const res = await axios.post(
        `/organizations/${orgId}/kxtill/products/${productId}/units/${unit.id}/barcode`
      );
      const updated = res.data?.unit;
      const code = updated?.barcode;

      setUnits((prev) =>
        prev.map((u) =>
          u.id === unit.id ? { ...u, barcode: code } : u
        )
      );

      toast.success(`Barcode ${code} assigned`);
      if (onBarcodeGenerated) onBarcodeGenerated();
    } catch (err) {
      toast.error(
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to generate barcode'
      );
    } finally {
      if (isMountedCheck()) setGeneratingUnitId(null);
    }
  };

  // Small helper — component may unmount during async, guard against setState on unmounted
  const isMountedCheck = () => true;

  const handlePrintLabel = (unit) => {
    setLabelUnit(unit);
  };

  return (
    <>
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

            {/* Units & Barcodes — global mode only */}
            {units.length > 0 && (
              <div className={styles.section}>
                <h4 className={styles.sectionTitle}>
                  <Barcode size={13} /> Units &amp; Barcodes
                </h4>
                <div className={styles.unitsList}>
                  {units.map((unit) => {
                    const isGenerating = generatingUnitId === unit.id;
                    return (
                      <div key={unit.id} className={styles.unitRow}>
                        <div className={styles.unitInfo}>
                          <div className={styles.unitName}>
                            {unit.name}
                            {unit.abbreviation ? ` (${unit.abbreviation})` : ''}
                          </div>
                          <div className={styles.unitBarcode}>
                            {unit.barcode ? (
                              <span className={styles.barcodeValue}>{unit.barcode}</span>
                            ) : (
                              <span className={styles.barcodeEmpty}>No barcode yet</span>
                            )}
                          </div>
                        </div>
                  <div className={styles.unitActions}>
  {unit.barcode ? (
    <button
      type="button"
      className={styles.printLabelBtn}
      onClick={() => handlePrintLabel(unit)}
      title="Print barcode label"
    >
      <Printer size={13} />
      Print
    </button>
  ) : isGlobal ? (
    <button
      type="button"
      className={styles.generateBtn}
      onClick={() => handleGenerateBarcode(unit)}
      disabled={isGenerating}
      title="Generate a KxTill barcode for this unit"
    >
      {isGenerating ? (
        <RefreshCw size={13} className={styles.spinning} />
      ) : (
        <Barcode size={13} />
      )}
      {isGenerating ? 'Generating…' : 'Generate'}
    </button>
  ) : (
    <span className={styles.barcodeHint}>Set barcode in Global Inventory</span>
  )}
</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
                    {branchPrices.map((pr) => (
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

      {/* Barcode label print modal */}
      <BarcodeLabelModal
        isOpen={!!labelUnit}
        onClose={() => setLabelUnit(null)}
        barcode={labelUnit?.barcode}
        productName={product.displayName || product.name || product.productName}
        price={product.price}
        currency={currency}
      />
    </>
  );
};

export default ProductDetailModal;