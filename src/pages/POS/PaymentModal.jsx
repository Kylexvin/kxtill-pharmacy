// src/pages/POS/PaymentModal.jsx
import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  Smartphone,
  Wallet,
  Landmark,
  Check,
  AlertCircle,
} from 'lucide-react';
import styles from './PaymentModal.module.css';

// ============================================================
// CONSTANTS (module scope — not re-created per render)
// ============================================================
const PAYMENT_METHODS = [
  { id: 'CASH', label: 'Cash', icon: Wallet },
  { id: 'CARD', label: 'Card', icon: CreditCard },
  { id: 'MPESA', label: 'M-Pesa', icon: Smartphone },
  { id: 'BANK', label: 'Bank Transfer', icon: Landmark },
];

const REFERENCE_LABELS = {
  CASH: null,
  CARD: 'Card last 4 digits',
  MPESA: 'M-Pesa transaction code',
  BANK: 'Bank reference / transaction ID',
};

// ============================================================
// COMPONENT
// ============================================================
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
  const [selectedMethod, setSelectedMethod] = useState(defaultPaymentMethod);
  const [tendered, setTendered] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset state each time the modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedMethod(defaultPaymentMethod || 'CASH');
      setTendered(String(total ?? ''));
      setPaymentReference('');
      setMpesaPhone('');
      setError('');
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const isCash = selectedMethod === 'CASH';
  const isBank = selectedMethod === 'BANK';
  const isMpesa = selectedMethod === 'MPESA';
  const tenderedNum = Number(tendered) || 0;
  const change = isCash ? Math.max(0, tenderedNum - total) : 0;
  const shortfall = isCash ? Math.max(0, total - tenderedNum) : 0;
  const referenceLabel = REFERENCE_LABELS[selectedMethod];

  const busy = submitting || isProcessing;

  const fmt = (n) => {
    const value = Number(n || 0);
    if (typeof formatCurrency === 'function') return formatCurrency(value);
    return `${currency} ${value.toFixed(decimalPlaces)}`;
  };

  const handleMethodSelect = (methodId) => {
    if (busy) return;
    setSelectedMethod(methodId);
    setPaymentReference('');
    setError('');
  };

  const handleTenderedChange = (value) => {
    setTendered(value);
    setError('');
  };

  const handlePayment = async () => {
    setError('');

    if (isCash) {
      if (tendered === '' || tenderedNum <= 0) {
        setError('Enter the amount tendered');
        return;
      }
      if (tenderedNum < total) {
        setError('Amount tendered is less than the total due');
        return;
      }
    }

    setSubmitting(true);
    try {
      await onPaymentComplete({
        method: selectedMethod,
        reference: paymentReference.trim() || null,
        tendered: isCash ? tenderedNum : total,
        change: isCash ? change : 0,
      });
    } catch (err) {
      setError(err?.message || 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {/* ---------- Header ---------- */}
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

        {/* ---------- Body ---------- */}
        <div className={styles.modalBody}>
          {/* Order Summary */}
          <div className={styles.orderSummary}>
            <h3>Order Summary</h3>
            <div className={styles.summaryItems}>
              {cartItems.slice(0, 5).map((item, i) => (
                <div key={item.id ?? i} className={styles.summaryItem}>
                  <span>
                    {item.quantity}× {item.productName}
                  </span>
                  <span>{fmt(item.total)}</span>
                </div>
              ))}
              {cartItems.length > 5 && (
                <div className={styles.moreItems}>
                  +{cartItems.length - 5} more item
                  {cartItems.length - 5 !== 1 ? 's' : ''}
                </div>
              )}
            </div>
            <div className={styles.summaryTotal}>
              <span>Total</span>
              <span className={styles.totalAmount}>{fmt(total)}</span>
            </div>
            {customer && (
              <div className={styles.customerInfo}>
                <span>Customer: {customer.name}</span>
                {customer.phone && <span>{customer.phone}</span>}
              </div>
            )}
          </div>

          {/* Payment Methods */}
          <div className={styles.paymentMethods}>
            <h3>Payment Method</h3>
            <div className={styles.methodsGrid}>
              {PAYMENT_METHODS.map((method) => {
                const Icon = method.icon;
                const selected = selectedMethod === method.id;
                return (
                  <button
                    key={method.id}
                    type="button"
                    className={`${styles.methodBtn} ${
                      selected ? styles.active : ''
                    }`}
                    onClick={() => handleMethodSelect(method.id)}
                    disabled={busy}
                  >
                    <Icon size={20} />
                    <span>{method.label}</span>
                    {selected && (
                      <Check size={16} className={styles.checkMark} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Payment Details */}
          <div className={styles.paymentDetails}>
            {isCash ? (
              <div className={styles.amountInput}>
                <label htmlFor="tendered">Amount tendered</label>
                <div className={styles.amountField}>
                  <span className={styles.currency}>{currency}</span>
                  <input
                    id="tendered"
                    type="number"
                    value={tendered}
                    onChange={(e) => handleTenderedChange(e.target.value)}
                    min="0"
                    step={decimalPlaces === 0 ? '1' : '0.01'}
                    className={styles.amountInputField}
                    disabled={busy}
                    autoFocus
                  />
                </div>
                {tenderedNum > total && (
                  <div className={styles.changeDue}>
                    Change due: {fmt(change)}
                  </div>
                )}
                {shortfall > 0 && tenderedNum > 0 && (
                  <div className={styles.shortfall}>
                    Shortfall: {fmt(shortfall)}
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.chargeNotice}>
                {isBank
                  ? `Exact total will be charged — ${fmt(total)}`
                  : `Charging exact total — ${fmt(total)}`}
              </div>
            )}

            {referenceLabel && (
              <div className={styles.referenceInput}>
                <label htmlFor="paymentRef">{referenceLabel}</label>
                <input
                  id="paymentRef"
                  type="text"
                  placeholder="Optional but recommended"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className={styles.referenceField}
                  disabled={busy}
                />
              </div>
            )}

            {error && (
              <div className={styles.errorMessage}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* ---------- Sticky Footer ---------- */}
        <div className={styles.modalFooter}>
          {isMpesa && (
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
                  value={mpesaPhone}
                  onChange={(e) => setMpesaPhone(e.target.value)}
                  disabled
                />
              </div>

              <button
                type="button"
                className={styles.mpesaPushBtn}
                disabled
              >
                Send Prompt
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
              disabled={busy}
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
                  Pay {fmt(total)}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;