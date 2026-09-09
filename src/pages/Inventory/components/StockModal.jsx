// src/pages/Inventory/components/StockModal.jsx
import React, { useState } from 'react';
import { X, RefreshCw, Plus, Minus } from 'lucide-react';
import toast from 'react-hot-toast';
import styles from '../Inventory.module.css';

const StockModal = ({
  isOpen,
  onClose,
  onSave,
  product,
  stockData,
  setStockData,
  isSubmitting,
  activeBranch,
  branches,
  isPostCreation = false,
}) => {
  const [selectedBranch, setSelectedBranch] = useState(
    product?.branchId || activeBranch?.id || ''
  );
  const [quantity, setQuantity] = useState('');
  const [operation, setOperation] = useState('add');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!selectedBranch) {
      toast.error('Please select a branch');
      return;
    }
    
    if (!quantity || parseFloat(quantity) <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    const payload = {
      branchId: selectedBranch,
      quantity: parseFloat(quantity),
      operation: operation,
    };

    onSave(payload);
  };

  const handleQuickAdd = (amount) => {
    const current = parseFloat(quantity) || 0;
    setQuantity((current + amount).toString());
  };

  if (!isOpen || !product) return null;

  const currentStock = product.stock || 0;
  const availableBranches = branches || [];

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            <RefreshCw size={18} />
            <span>{isPostCreation ? 'Add Stock to New Product' : 'Update Stock'}</span>
          </div>
          <button className={styles.modalClose} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalBody}>
          {/* Product Info */}
          <div className={styles.stockInfo}>
            <p><strong>Product:</strong> {product.name}</p>
            <p><strong>SKU:</strong> {product.sku || '-'}</p>
            <p><strong>Unit:</strong> {product.unit}</p>
            <p><strong>Current Stock:</strong> {currentStock} {product.unit}</p>
            {isPostCreation && (
              <p className={styles.postCreationHint}>
                ✨ Product created! Now add initial stock.
              </p>
            )}
          </div>

          {/* Branch Selection */}
          {availableBranches.length > 0 && (
            <div className={styles.formGroup}>
              <label>Select Branch *</label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                required
              >
                <option value="">Select a branch...</option>
                {availableBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Operation Type */}
          <div className={styles.formGroup}>
            <label>Operation</label>
            <div className={styles.operationButtons}>
              <button
                type="button"
                className={`${styles.operationBtn} ${operation === 'add' ? styles.active : ''}`}
                onClick={() => setOperation('add')}
              >
                <Plus size={14} /> Add Stock
              </button>
              <button
                type="button"
                className={`${styles.operationBtn} ${operation === 'set' ? styles.active : ''}`}
                onClick={() => setOperation('set')}
              >
                Set Exact Stock
              </button>
            </div>
          </div>

          {/* Quantity Input */}
          <div className={styles.formGroup}>
            <label>
              {operation === 'add' ? 'Quantity to Add' : 'New Stock Quantity'}
            </label>
            <div className={styles.quantityInput}>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={operation === 'add' ? 'Enter quantity to add' : 'Enter new stock quantity'}
                step={product.allowFractional ? 0.01 : 1}
                min="0"
                required
                autoFocus={isPostCreation}
              />
              <span className={styles.unitLabel}>{product.unit}</span>
            </div>
          </div>

          {/* Quick Add Buttons */}
          {operation === 'add' && (
            <div className={styles.quickAddButtons}>
              <span className={styles.quickAddLabel}>Quick add:</span>
              <button type="button" onClick={() => handleQuickAdd(1)}>+1</button>
              <button type="button" onClick={() => handleQuickAdd(5)}>+5</button>
              <button type="button" onClick={() => handleQuickAdd(10)}>+10</button>
              <button type="button" onClick={() => handleQuickAdd(20)}>+20</button>
              <button type="button" onClick={() => handleQuickAdd(50)}>+50</button>
            </div>
          )}

          {/* Current Stock Preview */}
          {operation === 'set' && quantity && (
            <div className={styles.stockPreview}>
              <span>Current: {currentStock} {product.unit}</span>
              <span>→</span>
              <span className={styles.stockPreviewNew}>
                New: {parseFloat(quantity) || 0} {product.unit}
              </span>
            </div>
          )}

          {operation === 'add' && quantity && (
            <div className={styles.stockPreview}>
              <span>Current: {currentStock} {product.unit}</span>
              <span>+ {parseFloat(quantity) || 0} {product.unit}</span>
              <span>→</span>
              <span className={styles.stockPreviewNew}>
                New: {(currentStock + (parseFloat(quantity) || 0))} {product.unit}
              </span>
            </div>
          )}

          <div className={styles.modalFooter}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              {isPostCreation ? 'Skip for now' : 'Cancel'}
            </button>
            <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Update Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StockModal;