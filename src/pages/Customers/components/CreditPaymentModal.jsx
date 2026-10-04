// src/pages/Customers/components/CreditPaymentModal.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { X, Check, AlertCircle, Wallet } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useShift } from '../../../contexts/ShiftContext';
import { useSettings } from '../../../contexts/SettingsContext';
import styles from './CreditCard.module.css';

const CreditPaymentModal = ({ isOpen, onClose, onSuccess, customer, currentBalance }) => {
  const { activeOrganization } = useAuth();
  const { formatCurrency } = useSettings();
  const { currentShift } = useShift();

  const orgId = activeOrganization?.id;

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
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
    if (amt > currentBalance + 0.01) {
      setError(`Amount cannot exceed the balance of ${formatCurrency(currentBalance)}`);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await axios.post(
        `/organizations/${orgId}/kxtill/customers/${customer.id}/credit/payments`,
        {
          amount: amt,
          note: note.trim() || null,
          shiftId: currentShift?.id || null,
        }
      );
      onSuccess(Number(res.data?.balance || 0));
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to record payment';
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
          <h2>Record Credit Payment</h2>
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
            <div className={styles.contextLabel} style={{ marginTop: 8 }}>Current balance</div>
            <div className={styles.contextValue}>{formatCurrency(currentBalance)}</div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Amount</label>
            <div className={styles.amountInputWrap}>
              <Wallet size={14} className={styles.amountInputIcon} />
              <input
                type="number"
                min="0"
                step="0.01"
                className={styles.amountInput}
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError(''); }}
                placeholder="0.00"
                disabled={submitting}
                autoFocus
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Note (optional)</label>
            <textarea
              className={styles.textarea}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reference, reason, etc."
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
            disabled={submitting || !amount}
          >
            {submitting ? 'Recording...' : (
              <>
                <Check size={14} />
                Record Payment
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreditPaymentModal;