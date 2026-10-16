// src/pages/POS/PaymentModal.jsx
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
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
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import styles from './PaymentModal.module.css';

const PAYMENT_METHODS = [
  { id: 'CASH',   label: 'Cash',   icon: Wallet },
  { id: 'CARD',   label: 'Card',   icon: CreditCard },
  { id: 'MPESA',  label: 'M-Pesa', icon: Smartphone },
  { id: 'BANK',   label: 'Bank',   icon: Landmark },
  { id: 'CREDIT', label: 'Credit', icon: BookOpen },
];

const REFERENCE_HINTS = {
  CARD:  'Last 4 digits (optional)',
  BANK:  'Bank reference',
};

const MPESA_POLL_INTERVAL_MS = 2500;
const MPESA_TIMEOUT_MS = 90_000;

let rowSeq = 0;
const newRow = (method, amount = '') => ({
  key: `row-${++rowSeq}`,
  method,
  amount,
  reference: '',
});

const STK_STATES = {
  IDLE: 'idle',
  SENDING: 'sending',
  WAITING: 'waiting',
  SUCCESS: 'success',
  FAILED: 'failed',
};

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
  const { activeOrganization } = useAuth();
  const orgId = activeOrganization?.id;

  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [stkState, setStkState] = useState(STK_STATES.IDLE);
  const [stkPhone, setStkPhone] = useState('');
  const [stkMessage, setStkMessage] = useState('');
  const [stkReceipt, setStkReceipt] = useState(null);

  const pollRef = useRef(null);
  const timeoutRef = useRef(null);

  const busy =
    submitting ||
    isProcessing ||
    stkState === STK_STATES.SENDING ||
    stkState === STK_STATES.WAITING;

  const totalNum = Number(total) || 0;

  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  const hasCustomer = !!(customer && (customer.id || customer.tempId));
  const creditAvailable = hasCustomer && isOnline;

  const availableMethods = useMemo(
    () => PAYMENT_METHODS.filter((m) => (m.id !== 'CREDIT' ? true : creditAvailable)),
    [creditAvailable]
  );

  const fmt = (n) => {
    const value = Number(n || 0);
    if (typeof formatCurrency === 'function') return formatCurrency(value);
    return `${currency} ${value.toFixed(decimalPlaces)}`;
  };

  // ─── lifecycle reset on open ───
  useEffect(() => {
    if (isOpen) {
      setRows([newRow(defaultPaymentMethod || 'CASH', String(totalNum || ''))]);
      setError('');
      setSubmitting(false);
      setStkState(STK_STATES.IDLE);
      setStkPhone('');
      setStkMessage('');
      setStkReceipt(null);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      pollRef.current = null;
      timeoutRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (creditAvailable) return;
    setRows((prev) =>
      prev.map((r) =>
        r.method === 'CREDIT' ? { ...r, method: 'CASH', reference: '' } : r
      )
    );
  }, [isOpen, creditAvailable]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const { remaining, cashTendered, changeDue } = useMemo(() => {
    let paid = 0;
    let cash = 0;
    for (const r of rows) {
      if (r.method === 'MPESA' && stkState !== STK_STATES.SUCCESS) continue;
      const amt = Number(r.amount) || 0;
      paid += amt;
      if (r.method === 'CASH') cash += amt;
    }
    return {
      remaining: Math.max(0, totalNum - paid),
      cashTendered: cash,
      changeDue: Math.max(0, paid - totalNum),
    };
  }, [rows, totalNum, stkState]);

  const setRow = (key, patch) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setError('');
  };

  const addRow = () => setRows((prev) => [...prev, newRow(defaultPaymentMethod || 'CASH', '')]);
  const removeRow = (key) =>
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));

  // ─── STK Push flow ───
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const pollTransaction = useCallback(
    async (merchantRef) => {
      try {
        const res = await axios.get(
          `/organizations/${orgId}/payments/mpesa/transactions/${merchantRef}`
        );
        const tx = res.data?.transaction;
        if (!tx) return;

        if (tx.status === 'SUCCESS') {
          stopPolling();
          setStkState(STK_STATES.SUCCESS);
          setStkReceipt(tx.mpesaReceiptNumber || null);
          setStkMessage('Payment received');
          toast.success('M-Pesa payment received');
          setRows((prev) =>
            prev.map((r) =>
              r.method === 'MPESA'
                ? { ...r, reference: tx.mpesaReceiptNumber || r.reference }
                : r
            )
          );
        } else if (tx.status === 'FAILED' || tx.status === 'TIMEOUT') {
          stopPolling();
          setStkState(STK_STATES.FAILED);
          setStkMessage(tx.failureReason || 'Payment was not completed');
        }
      } catch (err) {
        // Network blip — keep polling
      }
    },
    [orgId, stopPolling]
  );

  const handleSendStkPush = async () => {
    setError('');
    if (!orgId) {
      setError('Organization not loaded');
      return;
    }

    const mpesaRow = rows.find((r) => r.method === 'MPESA');
    if (!mpesaRow) {
      setError('Add an M-Pesa payment row first');
      return;
    }

    const amount = Number(mpesaRow.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid M-Pesa amount first');
      return;
    }

    const rawPhone = String(stkPhone || '').replace(/\D/g, '');
    if (rawPhone.length < 9) {
      setError('Enter a valid phone number');
      return;
    }

    setStkState(STK_STATES.SENDING);
    setStkMessage('Sending prompt to customer…');
    setStkReceipt(null);

    try {
      const res = await axios.post(
        `/organizations/${orgId}/payments/mpesa/stk-push`,
        {
          phone: rawPhone,
          amount,
          referenceType: 'pos_cart',
          referenceId: `cart-${Date.now()}`,
          productKey: 'kxtill',
        }
      );

      const { merchantRef, customerMessage } = res.data || {};
      if (!merchantRef) throw new Error('No merchantRef returned from server');

      setStkState(STK_STATES.WAITING);
      setStkMessage(customerMessage || 'Waiting for customer to enter PIN…');

      pollRef.current = setInterval(
        () => pollTransaction(merchantRef),
        MPESA_POLL_INTERVAL_MS
      );
      timeoutRef.current = setTimeout(() => {
        stopPolling();
        setStkState(STK_STATES.FAILED);
        setStkMessage('No response from customer — payment not completed');
      }, MPESA_TIMEOUT_MS);

      pollTransaction(merchantRef);
    } catch (err) {
      setStkState(STK_STATES.FAILED);
      setStkMessage(
        err.response?.data?.reason ||
          err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Failed to send prompt'
      );
    }
  };

  const handleResetStk = () => {
    stopPolling();
    setStkState(STK_STATES.IDLE);
    setStkMessage('');
    setStkReceipt(null);
  };

  // ─── final payment submit ───
  const handlePayment = async () => {
    setError('');

    const cleaned = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      if (r.method === 'MPESA' && stkState !== STK_STATES.SUCCESS) {
        setError('M-Pesa payment has not been confirmed yet');
        return;
      }

      const amt = Number(r.amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        setError(`Payment ${i + 1}: enter a valid amount`);
        return;
      }
      cleaned.push({
        method: r.method,
        amount: amt,
        reference: r.reference?.trim() || (r.method === 'MPESA' ? stkReceipt : null),
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
        setError('Overpayment only allowed on cash rows');
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
  const hasMpesaRow = rows.some((r) => r.method === 'MPESA');

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
                  ` — ${previewItems
                    .map((i) => `${i.quantity}× ${i.productName}`)
                    .join(', ')}${moreCount > 0 ? `, +${moreCount} more` : ''}`}
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
                const isMpesa = row.method === 'MPESA';
                return (
                  <div key={row.key} className={styles.payRow}>
                    <div className={styles.payRowMain}>
                      <div className={styles.methodSelectWrap}>
                        <MethodIcon size={14} className={styles.methodSelectIcon} />
                        <select
                          className={styles.methodSelect}
                          value={row.method}
                          onChange={(e) => {
                            setRow(row.key, { method: e.target.value, reference: '' });
                            if (e.target.value !== 'MPESA') handleResetStk();
                          }}
                          disabled={busy}
                        >
                          {availableMethods.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={14}
                          className={styles.methodSelectChevron}
                        />
                      </div>

                      <div className={styles.amountField}>
                        <span className={styles.currency}>{currency}</span>
                        <input
                          type="number"
                          className={styles.amountInputField}
                          value={row.amount}
                          onChange={(e) =>
                            setRow(row.key, { amount: e.target.value })
                          }
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
                        onClick={() => {
                          removeRow(row.key);
                          if (isMpesa) handleResetStk();
                        }}
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
                        onChange={(e) =>
                          setRow(row.key, { reference: e.target.value })
                        }
                        disabled={busy}
                      />
                    )}

                    {isMpesa && stkState === STK_STATES.SUCCESS && stkReceipt && (
                      <div
                        className={styles.rowReference}
                        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        <CheckCircle2 size={14} style={{ color: '#22c55e' }} />
                        <span style={{ fontSize: 12, color: '#22c55e' }}>
                          Paid — receipt <strong>{stkReceipt}</strong>
                        </span>
                      </div>
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

          {hasMpesaRow && (
            <div className={styles.stkPanel}>
              <div className={styles.stkHeader}>
                <Smartphone size={14} />
                <span className={styles.stkHeaderLabel}>M-Pesa STK Push</span>
                <StkStatusPill state={stkState} />
              </div>

              {stkState === STK_STATES.IDLE || stkState === STK_STATES.FAILED ? (
                <div className={styles.stkInputRow}>
                  <div className={styles.stkPhoneWrap}>
                    <span className={styles.stkPhonePrefix}>+254</span>
                    <input
                      type="tel"
                      className={styles.stkPhoneInput}
                      placeholder="7XX XXX XXX"
                      value={stkPhone}
                      onChange={(e) => setStkPhone(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                  <button
                    type="button"
                    className={styles.stkPushBtn}
                    onClick={handleSendStkPush}
                    disabled={busy || !stkPhone}
                  >
                    {stkState === STK_STATES.FAILED ? 'Retry' : 'Send Prompt'}
                  </button>
                </div>
              ) : (
                <div className={styles.stkWaitingRow}>
                  {stkState === STK_STATES.SENDING && (
                    <>
                      <Loader2 size={14} className={styles.spinnerInline} />
                      <span>Sending prompt to customer…</span>
                    </>
                  )}
                  {stkState === STK_STATES.WAITING && (
                    <>
                      <Loader2 size={14} className={styles.spinnerInline} />
                      <span>Waiting for customer to enter PIN on +254{stkPhone}…</span>
                    </>
                  )}
                  {stkState === STK_STATES.SUCCESS && (
                    <>
                      <CheckCircle2 size={14} style={{ color: '#22c55e' }} />
                      <span>Payment received</span>
                    </>
                  )}
                </div>
              )}

              {stkMessage && stkState !== STK_STATES.SUCCESS && (
                <div className={styles.stkMessage}>
                  {stkState === STK_STATES.FAILED ? (
                    <XCircle size={13} style={{ color: '#ef4444' }} />
                  ) : null}
                  <span>{stkMessage}</span>
                </div>
              )}

              {(stkState === STK_STATES.WAITING ||
                stkState === STK_STATES.FAILED) && (
                <button
                  type="button"
                  className={styles.stkCancelBtn}
                  onClick={handleResetStk}
                  disabled={stkState === STK_STATES.SENDING}
                >
                  Cancel prompt
                </button>
              )}
            </div>
          )}

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

const StkStatusPill = ({ state }) => {
  const map = {
    idle:    { text: 'Not sent', cls: 'neutral' },
    sending: { text: 'Sending…', cls: 'warning' },
    waiting: { text: 'Waiting',  cls: 'warning' },
    success: { text: 'Paid',     cls: 'success' },
    failed:  { text: 'Failed',   cls: 'danger'  },
  };
  const s = map[state] || map.idle;
  return (
    <span
      style={{
        marginLeft: 'auto',
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        background:
          s.cls === 'success'
            ? 'rgba(34,197,94,0.15)'
            : s.cls === 'warning'
            ? 'rgba(255,176,32,0.15)'
            : s.cls === 'danger'
            ? 'rgba(239,68,68,0.15)'
            : 'rgba(139,141,153,0.15)',
        color:
          s.cls === 'success'
            ? '#22c55e'
            : s.cls === 'warning'
            ? '#ffb020'
            : s.cls === 'danger'
            ? '#ef4444'
            : '#8b8d99',
      }}
    >
      {s.text}
    </span>
  );
};

export default PaymentModal;