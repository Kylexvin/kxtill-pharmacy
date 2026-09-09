// src/pages/Inventory/components/BranchProductModal.jsx
import React from 'react';
import { X, Edit } from 'lucide-react';
import styles from '../Inventory.module.css';

const BranchProductModal = ({
  isOpen,
  onClose,
  onSave,
  product,
  branchProductData,
  setBranchProductData,
  isSubmitting,
  currency,
  activeBranch,
}) => {
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setBranchProductData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave();
  };

  if (!isOpen || !product) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            <Edit size={18} />
            <span>Edit Branch Product</span>
          </div>
          <button className={styles.modalClose} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalBody}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Display Name</label>
              <input
                type="text"
                name="displayName"
                value={branchProductData.displayName}
                onChange={handleChange}
                placeholder="Display name for this branch"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Price ({currency})</label>
              <input
                type="number"
                name="price"
                value={branchProductData.price}
                onChange={handleChange}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>

            <div className={styles.formGroupFull}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  name="isAvailable"
                  checked={branchProductData.isAvailable}
                  onChange={handleChange}
                />
                Available at this branch
              </label>
            </div>

            <div className={styles.formGroupFull}>
              <div className={styles.productInfo}>
                <p><strong>Original Name:</strong> {product.name}</p>
                <p><strong>SKU:</strong> {product.sku || '-'}</p>
                <p><strong>Branch:</strong> {product.branchName || activeBranch?.name || 'Current Branch'}</p>
                <p><strong>Current Stock:</strong> {product.stock} {product.unit}</p>
              </div>
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BranchProductModal;