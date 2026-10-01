// src/pages/Shifts/ShiftModal.jsx
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import styles from './ShiftModal.module.css';

const ShiftModal = ({ open, title, children, onClose, onSubmit, submitLabel = 'Confirm', submitting = false, disabled = false }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && !submitting && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onMouseDown={() => !submitting && onClose()}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.closeBtn} onClick={onClose} disabled={submitting} type="button">
            <X size={16} />
          </button>
        </div>
        <form
          className={styles.body}
          onSubmit={(e) => {
            e.preventDefault();
            if (!disabled && !submitting) onSubmit();
          }}
        >
          {children}
          <div className={styles.actions}>
            <button type="button" className={styles.secondaryBtn} onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className={styles.primaryBtn} disabled={submitting || disabled}>
              {submitting ? 'Working…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ShiftModal;