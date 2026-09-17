// src/pages/Inventory/components/BranchStockModal.jsx
import React, { useState, useEffect } from 'react';
import { X, Package, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import styles from './BranchStockModal.module.css';

const BranchStockModal = ({
  isOpen,
  onClose,
  onSave,
  product,
  isSubmitting,
  // Optional — pass these to enable a branch dropdown
  branches,
  selectedBranchId,
  onBranchChange,
}) => {
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('');

  useEffect(() => {
    if (!isOpen || !product) return;
    setStock(String(product.stock ?? 0));
    setMinStock(String(product.minStock ?? 0));
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const unit = product.unit || 'units';
  const currentStock = Number(product.stock || 0);
  const parsedStock = parseFloat(stock);
  const parsedMinStock = parseFloat(minStock);

  const showBranchPicker = Array.isArray(branches) && branches.length > 1;
  const activeBranch = branches?.find((b) => b.id === selectedBranchId);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (stock === '' || isNaN(parsedStock) || parsedStock < 0) {
      toast.error('Enter a valid stock quantity');
      return;
    }
    if (minStock !== '' && (isNaN(parsedMinStock) || parsedMinStock < 0)) {
      toast.error('Enter a valid minimum stock');
      return;
    }

    onSave({
      stock: parsedStock,
      minStock: minStock === '' ? 0 : parsedMinStock,
    });
  };

  const stockChanged = parsedStock !== currentStock;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerText}>
            <div className={styles.title}>
              <Package size={18} />
              <span>Set Initial Stock</span>
            </div>
            <p className={styles.subtitle}>
              {product.displayName || product.name || product.productName}
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className={styles.body}>
          {showBranchPicker && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                <Building2 size={13} style={{ display: 'inline', marginRight: 6 }} />
                Branch
              </label>
              <select
                value={selectedBranchId || ''}
                onChange={(e) => onBranchChange?.(e.target.value)}
                className={styles.input}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <span className={styles.fieldHint}>
                Set stock for this branch. Repeat for other branches in Inventory.
              </span>
            </div>
          )}

          {!showBranchPicker && activeBranch && (
            <div className={styles.currentRow}>
              <span className={styles.currentLabel}>Branch</span>
              <span className={styles.currentValue}>{activeBranch.name}</span>
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Stock</label>
            <div className={styles.inputWithSuffix}>
              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="0"
                step="0.01"
                min="0"
                autoFocus
              />
              <span className={styles.inputSuffix}>{unit}</span>
            </div>
            {stockChanged && (
              <span className={styles.fieldHint}>
                {currentStock} → <strong>{parsedStock} {unit}</strong>
              </span>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              Minimum stock <span className={styles.labelMuted}>(low stock alert)</span>
            </label>
            <div className={styles.inputWithSuffix}>
              <input
                type="number"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                placeholder="0"
                step="0.01"
                min="0"
              />
              <span className={styles.inputSuffix}>{unit}</span>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Save Stock'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BranchStockModal;