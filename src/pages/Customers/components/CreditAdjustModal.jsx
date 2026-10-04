// src/pages/Customers/components/CreditAdjustModal.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { X, Check, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import styles from './CreditCard.module.css';

const CreditAdjustModal = ({ isOpen, onClose, onSuccess, customer }) => {
  const { activeOrganization } = useAuth();


  const orgId = activeOrganization?.id;

  const [direction, setDirection] = useState('INCREASE');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setDirection('INCREASE');
      setAmount('');
      setNote('');
      setError('');
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Amount must be a positive number');
      return;
    }
    if (!note.trim()) {
      setError('Note is required for adjustments');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await axios.post(
        `/organizations/${orgId}/kxtill/customers/${customer.id}/credit/adjustments`,
        {
          direction,
          amount: amt,
          note: note.trim(),
        }
      );
      onSuccess(Number(res.data?.balance || 0));
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to record adjustment';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={() => !submitting && onClose()}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Adjust Credit Balance</h2>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onClose}
            disabled={submitting}
          >
            <X size={18} />
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.contextBanner}>
            <div className={styles.contextLabel}>Customer</div>
            <div className={styles.contextValue}>{customer?.name}</div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Direction</label>
            <div className={styles.directionGroup}>
              <button
                type="button"
                className={`${styles.directionBtn} ${direction === 'INCREASE' ? styles.directionActive : ''}`}
                onClick={() => setDirection('INCREASE')}
                disabled={submitting}
              >
                <TrendingUp size={14} />
                Increase debt
              </button>
              <button
                type="button"
                className={`${styles.directionBtn} ${direction === 'DECREASE' ? styles.directionActive : ''}`}
                onClick={() => setDirection('DECREASE')}
                disabled={submitting}
              >
                <TrendingDown size={14} />
                Decrease debt
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Amount</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={styles.amountInput}
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(''); }}
              placeholder="0.00"
              disabled={submitting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Note (required)</label>
            <textarea
              className={styles.textarea}
              rows={3}
              value={note}
              onChange={(e) => { setNote(e.target.value); setError(''); }}
              placeholder="Reason for adjustment"
              disabled={submitting}
            />
          </div>

          {error && (
            <div className={styles.errorMessage}>
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={handleSubmit}
            disabled={submitting || !amount || !note.trim()}
          >
            {submitting ? 'Recording...' : (
              <>
                <Check size={14} />
                Record Adjustment
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreditAdjustModal;