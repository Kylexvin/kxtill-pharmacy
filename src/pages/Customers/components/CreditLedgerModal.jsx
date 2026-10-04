// src/pages/Customers/components/CreditLedgerModal.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { X, RefreshCw, AlertCircle, FileText } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useSettings } from '../../../contexts/SettingsContext';
import styles from './CreditCard.module.css';

const LEDGER_LIMIT = 20;

const TYPE_LABELS = {
  CHARGE: 'Charge',
  PAYMENT: 'Payment',
  ADJUSTMENT: 'Adjustment',
  REVERSAL: 'Reversal',
};

const CreditLedgerModal = ({ isOpen, onClose, customer }) => {
  const { activeOrganization } = useAuth();
  const { formatCurrency, formatDateTime } = useSettings();
  const orgId = activeOrganization?.id;

  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [balance, setBalance] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isMountedRef = useRef(true);
  const controllerRef = useRef(null);

  const totalPages = Math.max(1, Math.ceil(total / LEDGER_LIMIT));

  const load = useCallback(async () => {
    if (!orgId || !customer?.id) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await axios.get(
        `/organizations/${orgId}/kxtill/customers/${customer.id}/credit/ledger`,
        {
          params: { limit: LEDGER_LIMIT, offset: (page - 1) * LEDGER_LIMIT },
          signal: controller.signal,
          timeout: 10000,
        }
      );
      if (controller.signal.aborted || !isMountedRef.current) return;
      setEntries(res.data?.items || []);
      setTotal(res.data?.total || 0);
      setBalance(Number(res.data?.balance || 0));
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      if (isMountedRef.current) {
        setError(
          err.response?.data?.error ||
          err.response?.data?.message ||
          'Failed to load ledger'
        );
      }
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) setLoading(false);
    }
  }, [orgId, customer, page]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setPage(1);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalLarge} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Credit Ledger — {customer?.name}</h2>
          <button type="button" className={styles.modalCloseBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.ledgerSummary}>
          <div>
            <div className={styles.contextLabel}>Balance</div>
            <div className={styles.balanceValue}>{formatCurrency(balance)}</div>
          </div>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={load}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? styles.spinning : ''} />
          </button>
        </div>

        <div className={styles.ledgerBody}>
          {loading ? (
            <div className={styles.loadingState}>
              <RefreshCw size={20} className={styles.spinning} />
              <span>Loading ledger...</span>
            </div>
          ) : error ? (
            <div className={styles.errorState}>
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          ) : entries.length === 0 ? (
            <div className={styles.emptyState}>
              <FileText size={32} />
              <p>No ledger entries</p>
            </div>
          ) : (
            <table className={styles.ledgerTable}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Note</th>
                  <th className={styles.numericCol}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const amt = Number(e.amount);
                  return (
                    <tr key={e.id}>
                      <td className={styles.ledgerDate}>
                        {formatDateTime(e.createdAt)}
                      </td>
                      <td>
                        <span className={`${styles.typePill} ${styles[`type${e.type}`]}`}>
                          {TYPE_LABELS[e.type] || e.type}
                        </span>
                      </td>
                      <td className={styles.ledgerNote}>
                        {e.note || '—'}
                        {e.sale?.reference && (
                          <span className={styles.ledgerRef}>
                            {' · '}{e.sale.reference}
                          </span>
                        )}
                      </td>
                      <td className={`${styles.numericCol} ${amt >= 0 ? styles.amtPositive : styles.amtNegative}`}>
                        {amt >= 0 ? '+' : ''}{formatCurrency(amt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className={styles.ledgerPagination}>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              Previous
            </button>
            <span className={styles.pageInfo}>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreditLedgerModal;