// src/pages/Customers/components/CreditCard.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Wallet, AlertCircle, RefreshCw,
  PlusCircle, Sliders, ListOrdered,
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

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

  if (!orgId || !customerId) return null;

  if (loading) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <Wallet size={15} />
          <span>Deni (Credit)</span>
        </div>
        <div className={styles.loadingState}>
          <RefreshCw size={18} className={styles.spinning} />
          <span>Loading balance...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <Wallet size={15} />
          <span>Deni (Credit)</span>
        </div>
        <div className={styles.errorState}>
          <AlertCircle size={20} />
          <span>{error}</span>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => fetchBalance(true)}
            disabled={refreshing}
          >
            <RefreshCw size={12} className={refreshing ? styles.spinning : ''} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const bal = balance ?? 0;
  const limit = customer?.creditLimit != null ? Number(customer.creditLimit) : null;
  const available = limit != null ? Math.max(0, limit - bal) : null;
  const hasCredit = bal > 0;

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
            disabled={refreshing}
            title="Refresh"
          >
            <RefreshCw size={12} className={refreshing ? styles.spinning : ''} />
          </button>
        </div>

        <div className={styles.cardBody}>
          <div className={styles.balanceRow}>
            <div className={styles.balanceLabel}>Outstanding balance</div>
            <div className={`${styles.balanceValue} ${hasCredit ? styles.balancePositive : styles.balanceZero}`}>
              {formatCurrency(bal)}
            </div>
          </div>

          {limit != null && (
            <div className={styles.limitRow}>
              <div className={styles.limitItem}>
                <span className={styles.limitLabel}>Limit</span>
                <span className={styles.limitValue}>{formatCurrency(limit)}</span>
              </div>
              <div className={styles.limitItem}>
                <span className={styles.limitLabel}>Available</span>
                <span className={styles.limitValue}>{formatCurrency(available)}</span>
              </div>
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