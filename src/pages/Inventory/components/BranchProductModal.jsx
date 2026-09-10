// src/pages/Inventory/components/BranchProductModal.jsx
import React from 'react';
import { X, Edit } from 'lucide-react';
import styles from './BranchProductModal.module.css';

const BranchProductModal = ({
  isOpen,
  onClose,
  onSave,
  product,
  branchProductData,
  setBranchProductData,
  isSubmitting,
  activeBranch,
}) => {
  if (!isOpen || !product) return null;

  const handleChange = (field, value) => {
    setBranchProductData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerText}>
            <div className={styles.title}>
              <Edit size={18} />
              <span>Edit Branch Product</span>
            </div>
            <p className={styles.subtitle}>
              {product.productName || product.name} · {activeBranch?.name}
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className={styles.body}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Display name</label>
            <input
              type="text"
              value={branchProductData.displayName || ''}
              onChange={(e) => handleChange('displayName', e.target.value)}
              placeholder={product.productName || product.name}
              autoFocus
            />
            <span className={styles.fieldHint}>
              How this product appears in the POS at {activeBranch?.name}.
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Description (optional)</label>
            <textarea
              value={branchProductData.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Branch-specific notes or description"
              rows={2}
            />
          </div>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={branchProductData.isAvailable !== false}
              onChange={(e) => handleChange('isAvailable', e.target.checked)}
            />
            <span>
              <strong>Available at this branch</strong>
              <small>
                If unchecked, this product will be hidden from POS at {activeBranch?.name}.
              </small>
            </span>
          </label>
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
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BranchProductModal;