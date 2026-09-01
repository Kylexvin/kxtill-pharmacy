import React, { useState } from 'react';
import { X, CreditCard, Smartphone, Wallet, Landmark, Check, AlertCircle } from 'lucide-react';
import styles from './PaymentModal.module.css';

const PaymentModal = ({
  isOpen,
  onClose,
  onPaymentComplete,
  total,
  currency,
  cartItems,
  customer,
  isProcessing,
  defaultPaymentMethod // ADD THIS
}) => {
  const [selectedMethod, setSelectedMethod] = useState(defaultPaymentMethod || 'CASH');
  const [tendered, setTendered] = useState(total);
  const [paymentReference, setPaymentReference] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const paymentMethods = [
    { id: 'CASH', label: 'Cash', icon: Wallet },
    { id: 'CARD', label: 'Card', icon: CreditCard },
    { id: 'MPESA', label: 'M-Pesa', icon: Smartphone },
    { id: 'BANK', label: 'Bank Transfer', icon: Landmark },
  ];

  const isCash = selectedMethod === 'CASH';
  const change = isCash ? Math.max(0, Number(tendered) - total) : 0;

  const referenceLabel = {
    CASH: null,
    CARD: 'Card last 4 digits',
    MPESA: 'M-Pesa transaction code',
    BANK: 'Bank reference / transaction ID',
  }[selectedMethod];

  const handlePayment = async () => {
    setError('');

    if (isCash && Number(tendered) < total) {
      setError('Amount tendered is less than the total due');
      return;
    }

    setSubmitting(true);
    try {
      await onPaymentComplete({
        method: selectedMethod,
        reference: paymentReference || null,
      });
    } catch (err) {
      setError(err.message || 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const busy = submitting || isProcessing;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2>Complete Payment</h2>
          <button className={styles.closeBtn} onClick={onClose} disabled={busy}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.modalBody}>
          {/* Order Summary */}
          <div className={styles.orderSummary}>
            <h3>Order Summary</h3>
            <div className={styles.summaryItems}>
              {cartItems.slice(0, 5).map((item, i) => (
                <div key={i} className={styles.summaryItem}>
                  <span>{item.quantity}× {item.productName}</span>
                  <span>{item.total.toFixed(2)} {currency}</span>
                </div>
              ))}
              {cartItems.length > 5 && (
                <div className={styles.moreItems}>
                  +{cartItems.length - 5} more items
                </div>
              )}
            </div>
            <div className={styles.summaryTotal}>
              <span>Total</span>
              <span className={styles.totalAmount}>{total.toFixed(2)} {currency}</span>
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
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                return (
                  <button
                    key={method.id}
                    className={`${styles.methodBtn} ${selectedMethod === method.id ? styles.active : ''}`}
                    onClick={() => {
                      setSelectedMethod(method.id);
                      setPaymentReference('');
                      setError('');
                    }}
                    disabled={busy}
                  >
                    <Icon size={20} />
                    <span>{method.label}</span>
                    {selectedMethod === method.id && (
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
                <label>Amount tendered</label>
                <div className={styles.amountField}>
                  <span className={styles.currency}>{currency}</span>
                  <input
                    type="number"
                    value={tendered}
                    onChange={(e) => setTendered(e.target.value)}
                    min="0"
                    step="0.01"
                    className={styles.amountInputField}
                    disabled={busy}
                  />
                </div>
                {Number(tendered) > total && (
                  <div className={styles.changeDue}>
                    Change due: {change.toFixed(2)} {currency}
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.chargeNotice}>
                Charging exact total — {total.toFixed(2)} {currency}
              </div>
            )}

            {referenceLabel && (
              <div className={styles.referenceInput}>
                <label>{referenceLabel}</label>
                <input
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

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className={styles.payBtn}
            onClick={handlePayment}
            disabled={busy}
          >
            {busy ? (
              <>
                <span className={styles.spinner} />
                Processing...
              </>
            ) : (
              <>
                <Check size={18} />
                Pay {total.toFixed(2)} {currency}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;