// src/pages/Refunds/components/RefundModal.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  X, AlertCircle, RotateCcw, RefreshCw, Check, Wallet, Smartphone,
  CreditCard, Landmark, Info, Plus, Minus,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useShift } from '../../../contexts/ShiftContext';
import { useSettings } from '../../../contexts/SettingsContext';
import styles from './RefundModal.module.css';

const REFUND_METHODS = [
  { key: 'cash',   label: 'Cash back',    icon: Wallet },
  { key: 'mpesa',  label: 'M-PESA',       icon: Smartphone },
  { key: 'card',   label: 'Card',         icon: CreditCard },
  { key: 'bank',   label: 'Bank transfer',icon: Landmark },
  { key: 'credit', label: 'Credit reversal (Deni)', icon: RotateCcw, capped: true },
];

const RefundModal = ({ isOpen, onClose, saleId, onSuccess }) => {
  const { activeOrganization } = useAuth();
  const { currentShift } = useShift();
  const { formatCurrency } = useSettings();
  const orgId = activeOrganization?.id;

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [quantities, setQuantities] = useState({});
  const [methods, setMethods] = useState({
    cash: '', mpesa: '', card: '', bank: '', credit: '',
  });

  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!orgId || !saleId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(
        `/organizations/${orgId}/kxtill/sales/${saleId}/refundable`,
        { timeout: 10000 }
      );
      if (!isMountedRef.current) return;
      setState(res.data);
      const q = {};
      for (const it of res.data.items || []) q[it.saleItemId] = 0;
      setQuantities(q);
      setMethods({ cash: '', mpesa: '', card: '', bank: '', credit: '' });
      setReason('');
      setSubmitError('');
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to load refundable state'
      );
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [orgId, saleId]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const refundTotal = useMemo(() => {
    if (!state) return 0;
    let total = 0;
    for (const item of state.items) {
      const q = Number(quantities[item.saleItemId] || 0);
      if (q > 0) total += q * item.unitPrice;
    }
    return Number(total.toFixed(2));
  }, [state, quantities]);

  const methodsSum = useMemo(() => {
    let sum = 0;
    for (const k of ['cash', 'mpesa', 'card', 'bank', 'credit']) {
      sum += Number(methods[k]) || 0;
    }
    return Number(sum.toFixed(2));
  }, [methods]);

  const remaining = Number((refundTotal - methodsSum).toFixed(2));
  const overAllocated = remaining < -0.01;
  const underAllocated = remaining > 0.01;
  const allocationOk = !overAllocated && !underAllocated && refundTotal > 0;

  const creditCap = state?.creditRefundable ?? 0;

  const handleQuantityChange = (saleItemId, value) => {
    const item = state.items.find((i) => i.saleItemId === saleItemId);
    if (!item) return;
    let q = Number(value);
    if (!Number.isFinite(q) || q < 0) q = 0;
    if (q > item.remainingQuantity) q = item.remainingQuantity;
    setQuantities((prev) => ({ ...prev, [saleItemId]: q }));
    setSubmitError('');
  };

  const handleQtyStep = (saleItemId, delta) => {
    const item = state.items.find((i) => i.saleItemId === saleItemId);
    if (!item) return;
    const current = Number(quantities[saleItemId] || 0);
    let next = current + delta;
    if (next < 0) next = 0;
    if (next > item.remainingQuantity) next = item.remainingQuantity;
    setQuantities((prev) => ({ ...prev, [saleItemId]: next }));
    setSubmitError('');
  };

  const handleMethodChange = (key, raw) => {
    let v = Number(raw);
    if (!Number.isFinite(v) || v < 0) v = '';
    if (key === 'credit' && v !== '' && Number(v) > creditCap) {
      v = creditCap;
    }
    setMethods((prev) => ({ ...prev, [key]: v === '' ? '' : String(v) }));
    setSubmitError('');
  };

  const handleQuickFill = (key) => {
    if (remaining <= 0) return;
    const current = Number(methods[key]) || 0;
    let target = Number((current + remaining).toFixed(2));
    if (key === 'credit' && target > creditCap) target = creditCap;
    setMethods((prev) => ({ ...prev, [key]: String(target) }));
    setSubmitError('');
  };

  const handleSubmit = async () => {
    if (!state) return;
    if (refundTotal <= 0) {
      setSubmitError('Select at least one item to refund');
      return;
    }
    if (!allocationOk) {
      setSubmitError(
        overAllocated
          ? `Over-allocated by ${formatCurrency(-remaining)}`
          : `Allocate the remaining ${formatCurrency(remaining)}`
      );
      return;
    }

    const items = Object.entries(quantities)
      .filter(([, q]) => Number(q) > 0)
      .map(([saleItemId, quantity]) => ({ saleItemId, quantity: Number(quantity) }));

    const payload = {
      items,
      cash: Number(methods.cash) || 0,
      mpesa: Number(methods.mpesa) || 0,
      card: Number(methods.card) || 0,
      bank: Number(methods.bank) || 0,
      credit: Number(methods.credit) || 0,
      reason: reason || null,
      shiftId: currentShift?.id || null,
    };

    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await axios.post(
        `/organizations/${orgId}/kxtill/sales/${saleId}/refund`,
        payload
      );
      toast.success(`Refund ${res.data?.refund?.reference || ''} processed`);
      onSuccess?.(res.data);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to process refund';
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      if (isMountedRef.current) setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const customerCurrentBalance = state?.customer?.currentBalance ?? 0;
  const creditEntered = Number(methods.credit) || 0;
  const projectedBalance = customerCurrentBalance - creditEntered;
  const willGoNegative = creditEntered > 0.01 && projectedBalance < -0.01;

  return (
    <div className={styles.overlay} onClick={() => !submitting && onClose()}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>
            <RotateCcw size={18} className={styles.titleIcon} />
            <span>Process Refund</span>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={submitting}
          >
            <X size={20} />
          </button>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.loadingState}>
              <RefreshCw size={20} className={styles.spinning} />
              <span>Loading refundable state...</span>
            </div>
          ) : error ? (
            <div className={styles.errorState}>
              <AlertCircle size={24} />
              <span>{error}</span>
            </div>
          ) : !state ? (
            <div className={styles.errorState}>
              <AlertCircle size={24} />
              <span>Unable to load sale</span>
            </div>
          ) : state.fullyRefunded ? (
            <div className={styles.noticeInfo}>
              <Check size={16} />
              <span>This sale has been fully refunded.</span>
            </div>
          ) : (
            <>
              {/* Sale summary */}
              <div className={styles.saleInfo}>
                <div className={styles.saleRow}>
                  <span className={styles.saleLabel}>Reference</span>
                  <span className={styles.saleValue}>{state.sale.reference}</span>
                </div>
                {state.sale.customerName && (
                  <div className={styles.saleRow}>
                    <span className={styles.saleLabel}>Customer</span>
                    <span className={styles.saleValue}>{state.sale.customerName}</span>
                  </div>
                )}
                <div className={styles.saleRow}>
                  <span className={styles.saleLabel}>Original total</span>
                  <span className={styles.saleValue}>
                    {formatCurrency(state.sale.totalAmount)}
                  </span>
                </div>
                {state.originalPayments?.length > 0 && (
                  <div className={styles.saleRow}>
                    <span className={styles.saleLabel}>Originally paid via</span>
                    <span className={styles.saleValue}>
                      {state.originalPayments
                        .map((p) => `${p.method} ${formatCurrency(p.amount)}`)
                        .join(' · ')}
                    </span>
                  </div>
                )}
                {state.sale.refundedAmount > 0 && (
                  <div className={styles.saleRow}>
                    <span className={styles.saleLabel}>Already refunded</span>
                    <span className={styles.saleValue}>
                      {formatCurrency(state.sale.refundedAmount)}
                    </span>
                  </div>
                )}
              </div>

              {/* Items */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span>Select items to refund</span>
                </div>
                <div className={styles.itemCardList}>
                  {state.items.map((item) => {
                    const q = Number(quantities[item.saleItemId] || 0);
                    const canRefund = item.remainingQuantity > 0;
                    const maxReached = q >= item.remainingQuantity;
                    const minReached = q <= 0;
                    const lineTotal = q * item.unitPrice;

                    return (
                      <div
                        key={item.saleItemId}
                        className={`${styles.itemCard} ${!canRefund ? styles.itemCardDisabled : ''} ${q > 0 ? styles.itemCardActive : ''}`}
                      >
                        <div className={styles.itemCardHeader}>
                          <div className={styles.itemCardName}>{item.productName}</div>
                          {item.sku && (
                            <div className={styles.itemCardSku}>{item.sku}</div>
                          )}
                        </div>

                        <div className={styles.itemCardMeta}>
                          {item.unitName} · {formatCurrency(item.unitPrice)} each
                        </div>

                        <div className={styles.itemCardAvailable}>
                          {canRefund
                            ? `${item.remainingQuantity} available to return`
                            : 'Already fully returned'}
                        </div>

                        {canRefund && (
                          <div className={styles.itemCardControls}>
                            <button
                              type="button"
                              className={styles.qtyStepBtn}
                              onClick={() => handleQtyStep(item.saleItemId, -1)}
                              disabled={minReached || submitting}
                              aria-label="Decrease"
                            >
                              <Minus size={14} />
                            </button>
                            <input
                              type="number"
                              min="0"
                              max={item.remainingQuantity}
                              step="any"
                              value={q || ''}
                              onChange={(e) =>
                                handleQuantityChange(item.saleItemId, e.target.value)
                              }
                              className={styles.qtyCardInput}
                              disabled={submitting}
                              placeholder="0"
                            />
                            <button
                              type="button"
                              className={styles.qtyStepBtn}
                              onClick={() => handleQtyStep(item.saleItemId, 1)}
                              disabled={maxReached || submitting}
                              aria-label="Increase"
                            >
                              <Plus size={14} />
                            </button>

                            <div className={styles.itemCardLineTotal}>
                              {formatCurrency(lineTotal)}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Refund methods */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span>Refund via</span>
                </div>

                <div className={styles.methodsList}>
                  {REFUND_METHODS.map((m) => {
                    const Icon = m.icon;
                    const val = methods[m.key];
                    const isCapped = m.capped;
                    const isOverCap =
                      isCapped && Number(val) > creditCap + 0.001;
                    const hasValue = Number(val) > 0;
                    const totalAllocatedElsewhere = methodsSum - (Number(val) || 0);
                    const fullAllocated =
                      refundTotal > 0 && totalAllocatedElsewhere >= refundTotal - 0.01;
                    const disabled =
                      submitting ||
                      (isCapped && creditCap <= 0) ||
                      (!hasValue && fullAllocated);

                    return (
                      <div
                        key={m.key}
                        className={`${styles.methodRow} ${isOverCap ? styles.methodRowError : ''}`}
                      >
                        <span className={styles.methodIcon}><Icon size={14} /></span>
                        <span className={styles.methodLabel}>{m.label}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={val}
                          onChange={(e) => handleMethodChange(m.key, e.target.value)}
                          className={styles.methodInput}
                          placeholder="0"
                          disabled={disabled}
                        />
                        {remaining > 0.01 && !disabled && (
                          <button
                            type="button"
                            className={styles.fillBtn}
                            onClick={() => handleQuickFill(m.key)}
                            title="Fill with remaining"
                            disabled={submitting}
                          >
                            Fill
                          </button>
                        )}
                        {isCapped && (
                          <span className={styles.methodCap}>
                            max {formatCurrency(creditCap)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div
                  className={`${styles.remainingBar} ${
                    allocationOk
                      ? styles.remainingOk
                      : overAllocated
                      ? styles.remainingOver
                      : styles.remainingUnder
                  }`}
                >
                  <span>
                    {overAllocated
                      ? 'Over-allocated by'
                      : underAllocated
                      ? 'Remaining to allocate'
                      : 'Fully allocated'}
                  </span>
                  <span>
                    {overAllocated
                      ? formatCurrency(-remaining)
                      : formatCurrency(Math.max(0, remaining))}
                  </span>
                </div>
              </div>

              {/* Credit warning — only when the customer ends up owed */}
              {willGoNegative && state.customer && (
                <div className={styles.noticeWarning}>
                  <Info size={16} />
                  <div>
                    <div className={styles.warningTitle}>
                      This will leave {state.customer.name} with store credit
                    </div>
                    <div className={styles.warningBody}>
                      Current balance: {formatCurrency(customerCurrentBalance)} · After:{' '}
                      {formatCurrency(projectedBalance)}
                    </div>
                  </div>
                </div>
              )}

              {/* Reason */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span>Reason (optional)</span>
                </div>
                <textarea
                  className={styles.reasonInput}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Damaged product, customer changed mind"
                  rows={2}
                  disabled={submitting}
                />
              </div>

              {submitError && (
                <div className={styles.errorMessage}>
                  <AlertCircle size={16} />
                  <span>{submitError}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerTotal}>
            <span>Refund total</span>
            <span className={styles.footerTotalValue}>{formatCurrency(refundTotal)}</span>
          </div>
          <div className={styles.footerActions}>
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
              disabled={submitting || !state || state.fullyRefunded || !allocationOk}
            >
              {submitting ? (
                <>
                  <span className={styles.spinner} />
                  Processing...
                </>
              ) : (
                <>
                  <RotateCcw size={16} />
                  Process Refund
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RefundModal;