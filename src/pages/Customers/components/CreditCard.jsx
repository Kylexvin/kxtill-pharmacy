// src/pages/Customers/components/CreditCard.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Wallet, RefreshCw, AlertCircle, PlusCircle, Sliders, ListOrdered,
  Pencil, Check, X,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { useSettings } from '../../../contexts/SettingsContext';
import CreditPaymentModal from './CreditPaymentModal';
import CreditAdjustModal from './CreditAdjustModal';
import CreditLedgerModal from './CreditLedgerModal';
import styles from './CreditCard.module.css';

const CreditCard = ({ customer, onCustomerUpdate }) => {
  const { activeOrganization } = useAuth();
  const { can } = usePermissions();
  const { formatCurrency } = useSettings();

  const orgId = activeOrganization?.id;
  const customerId = customer?.id;

  const canAdjust = can('kxtill.credit.adjust');

  const [balance, setBalance] = useState(null);
  const [limit, setLimit] = useState(
    customer?.creditLimit != null ? Number(customer.creditLimit) : null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [editingLimit, setEditingLimit] = useState(false);
  const [limitDraft, setLimitDraft] = useState('');
  const [savingLimit, setSavingLimit] = useState(false);

  const [showPayment, setShowPayment] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showLedger, setShowLedger] = useState(false);

  const isMountedRef = useRef(true);
  const controllerRef = useRef(null);

  const fetchBalance = useCallback(async (isRefresh = false) => {
    if (!orgId || !customerId) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);

    try {
      const res = await axios.get(
        `/organizations/${orgId}/kxtill/customers/${customerId}/credit`,
        { signal: controller.signal, timeout: 10000 }
      );
      if (controller.signal.aborted || !isMountedRef.current) return;
      setBalance(Number(res.data?.balance || 0));
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      if (isMountedRef.current) {
        setError(
          err.response?.data?.error ||
          err.response?.data?.message ||
          'Failed to load credit balance'
        );
      }
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [orgId, customerId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (orgId && customerId) fetchBalance();
  }, [fetchBalance, orgId, customerId]);

  useEffect(() => {
    setLimit(
      customer?.creditLimit != null ? Number(customer.creditLimit) : null
    );
  }, [customer?.creditLimit]);

  const handlePaymentSuccess = (newBalance) => {
    setBalance(newBalance);
    setShowPayment(false);
    toast.success('Payment recorded');
    onCustomerUpdate?.();
  };

  const handleAdjustSuccess = (newBalance) => {
    setBalance(newBalance);
    setShowAdjust(false);
    toast.success('Adjustment recorded');
    onCustomerUpdate?.();
  };

  const startEditLimit = () => {
    setLimitDraft(limit != null ? String(limit) : '');
    setEditingLimit(true);
  };

  const cancelEditLimit = () => {
    setEditingLimit(false);
    setLimitDraft('');
  };

  const saveLimit = async () => {
    if (!orgId || !customerId) return;
    const trimmed = String(limitDraft || '').trim();
    const parsed = trimmed === '' ? null : Number(trimmed);

    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      toast.error('Limit must be a non-negative number or empty for no limit');
      return;
    }

    setSavingLimit(true);
    try {
      await axios.patch(
        `/organizations/${orgId}/kxtill/customers/${customerId}/credit/limit`,
        { creditLimit: parsed }
      );
      setLimit(parsed);
      setEditingLimit(false);
      setLimitDraft('');
      toast.success(parsed === null ? 'Credit limit removed' : 'Credit limit updated');
      onCustomerUpdate?.();
    } catch (err) {
      toast.error(
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to save credit limit'
      );
    } finally {
      if (isMountedRef.current) setSavingLimit(false);
    }
  };

  const handleLimitKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveLimit();
    } else if (e.key === 'Escape') {
      cancelEditLimit();
    }
  };

  if (!orgId || !customerId) return null;

  const bal = balance ?? 0;
  const hasCredit = bal > 0;
  const available = limit != null ? Math.max(0, limit - bal) : null;

  return (
    <>
      <div className={`${styles.card} ${hasCredit ? styles.cardActive : ''}`}>
        <div className={styles.cardHeader}>
          <Wallet size={15} />
          <span>Deni (Credit)</span>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => fetchBalance(true)}
            disabled={refreshing || loading}
            title="Refresh"
          >
            <RefreshCw size={12} className={refreshing ? styles.spinning : ''} />
          </button>
        </div>

        <div className={styles.cardBody}>
          {loading ? (
            <div className={styles.loadingRow}>
              <RefreshCw size={14} className={styles.spinning} />
              <span>Loading…</span>
            </div>
          ) : error ? (
            <div className={styles.errorRow}>
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          ) : (
            <>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Balance</span>
                <span
                  className={`${styles.kvValue} ${
                    hasCredit ? styles.valueOwed : styles.valueZero
                  }`}
                >
                  {formatCurrency(bal)}
                </span>
              </div>

              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Limit</span>
                {editingLimit ? (
                  <div className={styles.limitEditRow}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={limitDraft}
                      onChange={(e) => setLimitDraft(e.target.value)}
                      onKeyDown={handleLimitKeyDown}
                      className={styles.limitInput}
                      placeholder="No limit"
                      disabled={savingLimit}
                      autoFocus
                    />
                    <button
                      type="button"
                      className={`${styles.limitActionBtn} ${styles.limitSaveBtn}`}
                      onClick={saveLimit}
                      disabled={savingLimit}
                      title="Save"
                    >
                      {savingLimit ? (
                        <RefreshCw size={12} className={styles.spinning} />
                      ) : (
                        <Check size={12} />
                      )}
                    </button>
                    <button
                      type="button"
                      className={styles.limitActionBtn}
                      onClick={cancelEditLimit}
                      disabled={savingLimit}
                      title="Cancel"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className={styles.limitDisplayRow}>
                    <span className={styles.kvValue}>
                      {limit != null ? formatCurrency(limit) : 'No limit'}
                    </span>
                    {canAdjust && (
                      <button
                        type="button"
                        className={styles.pencilBtn}
                        onClick={startEditLimit}
                        title="Edit limit"
                      >
                        <Pencil size={11} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {limit != null && (
                <div className={styles.kvRow}>
                  <span className={styles.kvLabel}>Available</span>
                  <span className={styles.kvValue}>
                    {formatCurrency(available)}
                  </span>
                </div>
              )}

              <div className={styles.actions}>
                {hasCredit && (
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={() => setShowPayment(true)}
                  >
                    <PlusCircle size={13} />
                    Record Payment
                  </button>
                )}
                {canAdjust && (
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => setShowAdjust(true)}
                  >
                    <Sliders size={13} />
                    Adjust
                  </button>
                )}
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={() => setShowLedger(true)}
                >
                  <ListOrdered size={13} />
                  Ledger
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <CreditPaymentModal
        isOpen={showPayment}
        onClose={() => setShowPayment(false)}
        onSuccess={handlePaymentSuccess}
        customer={customer}
        currentBalance={bal}
      />

      <CreditAdjustModal
        isOpen={showAdjust}
        onClose={() => setShowAdjust(false)}
        onSuccess={handleAdjustSuccess}
        customer={customer}
      />

      <CreditLedgerModal
        isOpen={showLedger}
        onClose={() => setShowLedger(false)}
        customer={customer}
      />
    </>
  );
};

export default CreditCard;