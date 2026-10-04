// src/pages/POS/PaymentModal.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CreditCard,
  Smartphone,
  Wallet,
  Landmark,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  ChevronDown,
  BookOpen,
} from 'lucide-react';
import styles from './PaymentModal.module.css';

const PAYMENT_METHODS = [
  { id: 'CASH', label: 'Cash', icon: Wallet },
  { id: 'CARD', label: 'Card', icon: CreditCard },
  { id: 'MPESA', label: 'M-Pesa', icon: Smartphone },
  { id: 'BANK', label: 'Bank', icon: Landmark },
  { id: 'CREDIT', label: 'Credit', icon: BookOpen },
];

const REFERENCE_HINTS = {
  CARD: 'Last 4 digits (optional)',
  MPESA: 'M-Pesa code',
  BANK: 'Bank reference',
};

let rowSeq = 0;
const newRow = (method, amount = '') => ({
  key: `row-${++rowSeq}`,
  method,
  amount,
  reference: '',
});

const PaymentModal = ({
  isOpen,
  onClose,
  onPaymentComplete,
  total,
  currency = 'KES',
  cartItems = [],
  customer,
  isProcessing = false,
  defaultPaymentMethod = 'CASH',
  decimalPlaces = 2,
  formatCurrency,
}) => {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const busy = submitting || isProcessing;
  const totalNum = Number(total) || 0;

  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  const hasCustomer = !!(customer && (customer.id || customer.tempId));
  const creditAvailable = hasCustomer && isOnline;

  const availableMethods = useMemo(
    () =>
      PAYMENT_METHODS.filter((m) => {
        if (m.id !== 'CREDIT') return true;
        return creditAvailable;
      }),
    [creditAvailable]
  );

  const fmt = (n) => {
    const value = Number(n || 0);
    if (typeof formatCurrency === 'function') return formatCurrency(value);
    return `${currency} ${value.toFixed(decimalPlaces)}`;
  };

  useEffect(() => {
    if (isOpen) {
      setRows([newRow(defaultPaymentMethod || 'CASH', String(totalNum || ''))]);
      setError('');
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // If CREDIT becomes unavailable while selected, force the row back to CASH
  useEffect(() => {
    if (!isOpen) return;
    if (creditAvailable) return;
    setRows((prev) =>
      prev.map((r) =>
        r.method === 'CREDIT' ? { ...r, method: 'CASH', reference: '' } : r
      )
    );
  }, [isOpen, creditAvailable]);

  const { remaining, cashTendered, changeDue } = useMemo(() => {
    let paid = 0;
    let cash = 0;
    for (const r of rows) {
      const amt = Number(r.amount) || 0;
      paid += amt;
      if (r.method === 'CASH') cash += amt;
    }
    return {
      remaining: Math.max(0, totalNum - paid),
      cashTendered: cash,
      changeDue: Math.max(0, paid - totalNum),
    };
  }, [rows, totalNum]);

  const setRow = (key, patch) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setError('');
  };

  const addRow = () => {
    setRows((prev) => [...prev, newRow(defaultPaymentMethod || 'CASH', '')]);
  };

  const removeRow = (key) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  };

  const handlePayment = async () => {
    setError('');

    const cleaned = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const amt = Number(r.amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        setError(`Payment ${i + 1}: enter a valid amount`);
        return;
      }
      cleaned.push({
        method: r.method,
        amount: amt,
        reference: r.reference?.trim() || null,
      });
    }

    const hasCredit = cleaned.some((p) => p.method === 'CREDIT');
    if (hasCredit) {
      if (!hasCustomer) {
        setError('Attach a customer to use credit');
        return;
      }
      if (!isOnline) {
        setError('Credit sales require an internet connection');
        return;
      }
    }

    const paid = cleaned.reduce((s, p) => s + p.amount, 0);
    const tolerance = 0.01;

    if (paid < totalNum - tolerance) {
      setError(`Remaining ${fmt(totalNum - paid)} still unpaid`);
      return;
    }
    if (paid > totalNum + tolerance) {
      const nonCashTotal = cleaned
        .filter((p) => p.method !== 'CASH')
        .reduce((s, p) => s + p.amount, 0);
      if (nonCashTotal > totalNum + tolerance) {
        setError(`Overpayment only allowed on cash rows`);
        return;
      }
    }

    const capped = capCashOverpayment(cleaned, totalNum);

    setSubmitting(true);
    try {
      await onPaymentComplete({
        payments: capped,
        method: capped[0]?.method || 'CASH',
        reference: capped[0]?.reference || null,
        tendered: cashTendered,
        change: changeDue,
      });
    } catch (err) {
      setError(err?.message || 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const canSubmit = !busy && remaining <= 0.01;
  const previewItems = cartItems.slice(0, 3);
  const moreCount = cartItems.length - previewItems.length;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2>Complete Payment</h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            disabled={busy}
            type="button"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.orderSummary}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Items</span>
              <span className={styles.summaryValue}>
                {cartItems.length} item{cartItems.length !== 1 ? 's' : ''}
                {previewItems.length > 0 &&
                  ` — ${previewItems.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}${moreCount > 0 ? `, +${moreCount} more` : ''}`}
              </span>
            </div>
            {customer?.name && (
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Customer</span>
                <span className={styles.summaryValue}>{customer.name}</span>
              </div>
            )}
            <div className={`${styles.summaryRow} ${styles.summaryTotalRow}`}>
              <span className={styles.summaryLabel}>Total</span>
              <span className={styles.summaryTotal}>{fmt(totalNum)}</span>
            </div>
            <div className={`${styles.summaryRow} ${styles.summaryRemainingRow}`}>
              <span className={styles.summaryLabel}>Remaining</span>
              <span
                className={`${styles.summaryRemaining} ${
                  remaining <= 0.01 ? styles.remainingZero : ''
                }`}
              >
                {fmt(remaining)}
              </span>
            </div>
          </div>

          <div className={styles.paymentSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>Payments</span>
            </div>

            <div className={styles.rows}>
              {rows.map((row, idx) => {
                const refHint = REFERENCE_HINTS[row.method];
                const MethodIcon =
                  PAYMENT_METHODS.find((m) => m.id === row.method)?.icon || Wallet;
                return (
                  <div key={row.key} className={styles.payRow}>
                    <div className={styles.payRowMain}>
                      <div className={styles.methodSelectWrap}>
                        <MethodIcon size={14} className={styles.methodSelectIcon} />
                        <select
                          className={styles.methodSelect}
                          value={row.method}
                          onChange={(e) =>
                            setRow(row.key, { method: e.target.value, reference: '' })
                          }
                          disabled={busy}
                        >
                          {availableMethods.map((m) => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className={styles.methodSelectChevron} />
                      </div>

                      <div className={styles.amountField}>
                        <span className={styles.currency}>{currency}</span>
                        <input
                          type="number"
                          className={styles.amountInputField}
                          value={row.amount}
                          onChange={(e) => setRow(row.key, { amount: e.target.value })}
                          min="0"
                          step={decimalPlaces === 0 ? '1' : '0.01'}
                          disabled={busy}
                          placeholder="0"
                          autoFocus={idx === rows.length - 1}
                        />
                      </div>

                      <button
                        type="button"
                        className={`${styles.rowDeleteBtn} ${
                          rows.length <= 1 ? styles.rowDeleteBtnHidden : ''
                        }`}
                        onClick={() => removeRow(row.key)}
                        disabled={busy || rows.length <= 1}
                        aria-label="Remove payment"
                        tabIndex={rows.length <= 1 ? -1 : 0}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {refHint && (
                      <input
                        type="text"
                        className={styles.rowReference}
                        placeholder={refHint}
                        value={row.reference}
                        onChange={(e) => setRow(row.key, { reference: e.target.value })}
                        disabled={busy}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className={styles.addRowBtn}
              onClick={addRow}
              disabled={busy}
            >
              <Plus size={14} />
              Add payment
            </button>
          </div>

          {changeDue > 0 && (
            <div className={styles.changeBanner}>
              <span>Change due</span>
              <span className={styles.changeAmount}>{fmt(changeDue)}</span>
            </div>
          )}

          {error && (
            <div className={styles.errorMessage}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          {rows.some((r) => r.method === 'MPESA') && (
            <div className={styles.mpesaPromptBar}>
              <div className={styles.mpesaPromptBarLeft}>
                <Smartphone size={14} className={styles.mpesaPromptBarIcon} />
                <span className={styles.mpesaPromptBarLabel}>STK Push</span>
                <span className={styles.comingSoonBadge}>Coming Soon</span>
              </div>
              <div className={styles.mpesaPhoneWrap}>
                <span className={styles.mpesaPhonePrefix}>+254</span>
                <input
                  type="tel"
                  className={styles.mpesaPhoneInput}
                  placeholder="7XX XXX XXX"
                  disabled
                />
              </div>
              <button type="button" className={styles.mpesaPushBtn} disabled>
                Send
              </button>
            </div>
          )}

          <div className={styles.modalFooterActions}>
            <button
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={busy}
              type="button"
            >
              Cancel
            </button>
            <button
              className={styles.payBtn}
              onClick={handlePayment}
              disabled={!canSubmit}
              type="button"
            >
              {busy ? (
                <>
                  <span className={styles.spinner} />
                  Processing...
                </>
              ) : (
                <>
                  <Check size={18} />
                  {remaining > 0.01 ? `Pay ${fmt(totalNum)}` : `Complete Sale`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function capCashOverpayment(payments, total) {
  const sum = payments.reduce((s, p) => s + p.amount, 0);
  if (sum <= total + 0.01) return payments;

  let excess = sum - total;
  const result = payments.map((p) => ({ ...p }));

  for (let i = result.length - 1; i >= 0 && excess > 0; i--) {
    if (result[i].method !== 'CASH') continue;
    const take = Math.min(excess, result[i].amount);
    result[i].amount = Number((result[i].amount - take).toFixed(2));
    excess -= take;
  }

  return result.filter((p) => p.amount > 0);
}

export default PaymentModal;