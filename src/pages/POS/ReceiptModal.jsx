// src/pages/POS/ReceiptModal.jsx
import React, { useMemo } from 'react';
import { X, Check } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { renderReceipt } from '../../utils/receipt/templates';
import { normalizeReceipt } from '../../utils/receipt/normalize';
import styles from './ReceiptModal.module.css';

const ReceiptModal = ({ receipt, onClose }) => {
  const { settings } = useSettings();

  const receiptText = useMemo(() => {
    if (!receipt) return '';
    // If a pre-rendered text was supplied (historical sale), keep it.
    if (typeof receipt.text === 'string' && receipt.text.trim()) {
      return receipt.text;
    }
    const normalized = normalizeReceipt(receipt, settings);
    if (!normalized) return '';
    return renderReceipt(normalized, normalized.receipt.template);
  }, [receipt, settings]);

  if (!receipt) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Check size={18} className={styles.successIcon} />
            <span>Sale Complete</span>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className={styles.receiptArea}>
          <pre className={styles.receiptText}>{receiptText}</pre>
        </div>

        <div className={styles.footer}>
          <button
            className={styles.newSaleBtn}
            onClick={onClose}
            type="button"
          >
            New sale
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;