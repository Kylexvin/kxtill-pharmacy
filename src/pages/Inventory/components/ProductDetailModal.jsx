// src/pages/Inventory/components/ProductDetailModal.jsx
import React from 'react';
import { X, Package, Edit, RefreshCw } from 'lucide-react';
import styles from '../Inventory.module.css';

const ProductDetailModal = ({
  isOpen,
  onClose,
  product,
  currency,
  formatCurrency,
  onEdit,
  onUpdateStock,
}) => {
  if (!isOpen || !product) return null;

  const status = product.stock > 0
    ? (product.stock <= product.minStock ? 'Low Stock' : 'In Stock')
    : 'Out of Stock';

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.detailModal}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            <Package size={18} />
            <span>Product Details</span>
          </div>
          <button className={styles.modalClose} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.detailGrid}>
            <div className={styles.detailSection}>
              <h4>Product Information</h4>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Name</span>
                <span className={styles.detailValue}>{product.name}</span>
              </div>
              {product.sku && product.sku !== '-' && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>SKU</span>
                  <span className={styles.detailValue}>{product.sku}</span>
                </div>
              )}
              {product.category && product.category !== '-' && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Category</span>
                  <span className={styles.detailValue}>{product.category}</span>
                </div>
              )}
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Unit</span>
                <span className={styles.detailValue}>{product.unit}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Branch</span>
                <span className={styles.detailValue}>{product.branchName || 'N/A'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Fractional</span>
                <span className={styles.detailValue}>{product.allowFractional ? 'Yes' : 'No'}</span>
              </div>
            </div>

            <div className={styles.detailSection}>
              <h4>Pricing & Stock</h4>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Price</span>
                <span className={styles.detailValue}>{formatCurrency(product.price)}</span>
              </div>
              {product.cost > 0 && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Cost</span>
                  <span className={styles.detailValue}>{formatCurrency(product.cost)}</span>
                </div>
              )}
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Stock</span>
                <span className={`${styles.detailValue} ${product.stock <= product.minStock ? styles.stockLow : ''}`}>
                  {product.stock} {product.unit}
                </span>
              </div>
              {product.minStock > 0 && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Min Stock</span>
                  <span className={styles.detailValue}>{product.minStock}</span>
                </div>
              )}
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Status</span>
                <span className={`${styles.statusBadge} ${status === 'In Stock' ? styles.success : status === 'Low Stock' ? styles.warning : styles.danger}`}>
                  {status}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Available</span>
                <span className={styles.detailValue}>{product.isAvailable ? 'Yes' : 'No'}</span>
              </div>
            </div>

            {product.branchProducts && product.branchProducts.length > 0 && (
              <div className={styles.detailSection}>
                <h4>All Branch Stock Levels</h4>
                <div className={styles.branchStockList}>
                  {product.branchProducts.map((bp) => (
                    <div key={bp.branchId || bp.id} className={styles.branchStockItem}>
                      <span className={styles.branchStockName}>{bp.branchName || bp.branch?.name || 'Unknown'}</span>
                      <span className={styles.branchStockQty}>
                        {bp.stock || 0} {product.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {product.units && product.units.length > 1 && (
              <div className={styles.detailSection}>
                <h4>Unit Pricing</h4>
                <div className={styles.branchStockList}>
                  {product.units.map((unit, idx) => (
                    <div key={idx} className={styles.branchStockItem}>
                      <span className={styles.branchStockName}>{unit.name}</span>
                      <span className={styles.branchStockQty}>
                        {formatCurrency(unit.price)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>Close</button>
          <button className={styles.editBtn} onClick={onUpdateStock}>
            <RefreshCw size={16} /> Update Stock
          </button>
          <button className={styles.editBtn} onClick={onEdit}>
            <Edit size={16} /> Edit Branch Product
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailModal;