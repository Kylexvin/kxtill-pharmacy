// src/pages/Inventory/components/ProductBatchesModal.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Layers,
  Building2,
  CalendarClock,
  AlertTriangle,
  AlertCircle,
  Check,
  Plus,
  RefreshCw,
} from 'lucide-react';
import axios from 'axios';
import styles from './ProductBatchesModal.module.css';

const DAYS_MS = 24 * 60 * 60 * 1000;
const EMPTY_BRANCHES = [];

const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / DAYS_MS);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getExpiryStatus = (days) => {
  if (days === null) return { label: '—', variant: 'muted' };
  if (days < 0) return { label: `Expired ${Math.abs(days)}d ago`, variant: 'danger' };
  if (days === 0) return { label: 'Expires today', variant: 'danger' };
  if (days <= 30) return { label: `${days}d`, variant: 'danger' };
  if (days <= 90) return { label: `${days}d`, variant: 'warning' };
  if (days <= 180) return { label: `${days}d`, variant: 'info' };
  return { label: `${days}d`, variant: 'success' };
};

const ProductBatchesModal = ({
  isOpen,
  onClose,
  product,
  orgId,
  currency = 'KES',
  formatCurrency,
  branches = EMPTY_BRANCHES,
  fixedBranchId,
  onReceiveBatch,
}) => {
  const [loading, setLoading] = useState(false);
  const [batches, setBatches] = useState([]);
  const [error, setError] = useState(null);
  const [productMeta, setProductMeta] = useState(null);

  // Refs to avoid dependency churn
  const branchesRef = useRef(branches);
  branchesRef.current = branches;

  // Resolve the Core product ID — Inventory rows have productId, Global rows have id
  const coreProductId = product?.productId || product?.id || null;

  // ─── Fetch once per (open, productId, orgId, fixedBranchId) ───
  useEffect(() => {
    if (!isOpen) return;
    if (!coreProductId || !orgId) return;

    let cancelled = false;

    setLoading(true);
    setError(null);
    setBatches([]);
    setProductMeta(null);

    const url = `/organizations/${orgId}/kxtill/pharmacy/products/${coreProductId}/batches`;

    axios
      .get(url)
      .then((res) => {
        if (cancelled) return;

        const rawBatches = res.data?.batches || [];
        setProductMeta(res.data?.product || null);

        const rows = [];
        for (const b of rawBatches) {
          const stocks = b.stocks || [];
          const relevantStocks = fixedBranchId
            ? stocks.filter((s) => s.branchId === fixedBranchId)
            : stocks;

          if (relevantStocks.length === 0) {
            if (!fixedBranchId) {
              rows.push({
                rowKey: `${b.id}-none`,
                batchId: b.id,
                batchNumber: b.batchNumber,
                expiryDate: b.expiryDate,
                manufacturer: b.manufacturer,
                branchId: null,
                quantityOnHand: 0,
                unitCost: null,
                sellingPrice: null,
                status: 'AVAILABLE',
              });
            }
            continue;
          }

          for (const s of relevantStocks) {
            rows.push({
              rowKey: `${b.id}-${s.branchId}`,
              batchId: b.id,
              batchNumber: b.batchNumber,
              expiryDate: b.expiryDate,
              manufacturer: b.manufacturer,
              branchId: s.branchId,
              quantityOnHand: Number(s.quantityOnHand),
              unitCost: s.unitCost != null ? Number(s.unitCost) : null,
              sellingPrice:
                s.sellingPrice != null ? Number(s.sellingPrice) : null,
              status: s.status,
            });
          }
        }

        rows.sort((a, b) => {
          const ea = new Date(a.expiryDate).getTime();
          const eb = new Date(b.expiryDate).getTime();
          if (ea !== eb) return ea - eb;
          return (a.batchNumber || '').localeCompare(b.batchNumber || '');
        });

        setBatches(rows);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load batches:', err);
        setError(
          err.response?.data?.error ||
            err.response?.data?.message ||
            'Failed to load batches'
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, coreProductId, orgId, fixedBranchId]);

  // ─── Derived ───
  const summary = useMemo(() => {
    const totalStock = batches.reduce((s, b) => s + b.quantityOnHand, 0);
    const uniqueBatches = new Set(batches.map((b) => b.batchId)).size;
    const expiringSoon = batches.filter((b) => {
      const d = daysUntil(b.expiryDate);
      return d !== null && d >= 0 && d <= 90 && b.quantityOnHand > 0;
    }).length;
    const expired = batches.filter((b) => {
      const d = daysUntil(b.expiryDate);
      return d !== null && d < 0 && b.quantityOnHand > 0;
    }).length;

    return { totalStock, uniqueBatches, expiringSoon, expired };
  }, [batches]);

  const fixedBranchName = useMemo(() => {
    if (!fixedBranchId) return null;
    return branches.find((b) => b.id === fixedBranchId)?.name || null;
  }, [fixedBranchId, branches]);

  const getBranchName = (branchId) => {
    if (!branchId) return '—';
    return (
      branches.find((b) => b.id === branchId)?.name ||
      `Branch ${branchId.slice(0, 6)}`
    );
  };

  if (!isOpen) return null;

  const displayName =
    productMeta?.name || product?.name || product?.productName || 'Product';

  const genericLine = [
    product?.pharmacyProduct?.genericName,
    product?.pharmacyProduct?.strength,
    product?.pharmacyProduct?.dosageForm,
  ]
    .filter(Boolean)
    .join(' · ');

  const unitLabel =
    product?.baseUnit?.abbreviation || product?.unit || 'units';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerText}>
            <div className={styles.title}>
              <Layers size={18} />
              <span>Batches</span>
            </div>
            <p className={styles.subtitle}>
              {displayName}
              {genericLine && (
                <span className={styles.subtitleGeneric}>
                  {' · '}
                  {genericLine}
                </span>
              )}
              {fixedBranchName && (
                <span className={styles.subtitleGeneric}>
                  {' · '}
                  <Building2
                    size={11}
                    style={{
                      display: 'inline',
                      marginRight: 2,
                      verticalAlign: -1,
                    }}
                  />
                  {fixedBranchName}
                </span>
              )}
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {!loading && !error && batches.length > 0 && (
            <div className={styles.summaryRow}>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Total stock</span>
                <span className={styles.summaryValue}>
                  {summary.totalStock}{' '}
                  <span className={styles.summaryUnit}>{unitLabel}</span>
                </span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Batches</span>
                <span className={styles.summaryValue}>
                  {summary.uniqueBatches}
                </span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Expiring (90d)</span>
                <span
                  className={`${styles.summaryValue} ${
                    summary.expiringSoon > 0 ? styles.summaryWarn : ''
                  }`}
                >
                  {summary.expiringSoon}
                </span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Expired</span>
                <span
                  className={`${styles.summaryValue} ${
                    summary.expired > 0 ? styles.summaryDanger : ''
                  }`}
                >
                  {summary.expired}
                </span>
              </div>
            </div>
          )}

          {loading ? (
            <div className={styles.stateContainer}>
              <RefreshCw size={28} className={styles.spinning} />
              <p>Loading batches…</p>
            </div>
          ) : error ? (
            <div className={styles.stateContainer}>
              <AlertCircle size={32} />
              <p>{error}</p>
            </div>
          ) : batches.length === 0 ? (
            <div className={styles.stateContainer}>
              <Layers size={40} />
              <h3>No batches yet</h3>
              <p>
                {fixedBranchId
                  ? 'This medicine has no batches at this branch. Receive a batch to add stock.'
                  : 'This medicine has no batches. Receive a batch to add stock.'}
              </p>
              {onReceiveBatch && (
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => onReceiveBatch(product)}
                >
                  <Plus size={14} /> Receive batch
                </button>
              )}
            </div>
          ) : (
            <div className={styles.batchList}>
              {batches.map((b) => {
                const days = daysUntil(b.expiryDate);
                const expiryStatus = getExpiryStatus(days);

                return (
                  <div key={b.rowKey} className={styles.batchRow}>
                    <div className={styles.batchRowMain}>
                      <div className={styles.batchNumberCell}>
                        <span className={styles.batchNumber}>
                          {b.batchNumber}
                        </span>
                        {b.manufacturer && (
                          <span className={styles.batchManufacturer}>
                            {b.manufacturer}
                          </span>
                        )}
                      </div>

                      {!fixedBranchId && (
                        <div className={styles.batchBranchCell}>
                          {b.branchId ? (
                            <>
                              <Building2 size={12} />
                              <span>{getBranchName(b.branchId)}</span>
                            </>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </div>
                      )}

                      <div className={styles.batchExpiryCell}>
                        <CalendarClock size={12} />
                        <span>{formatDate(b.expiryDate)}</span>
                        <span
                          className={`${styles.expiryBadge} ${
                            styles[`expiry_${expiryStatus.variant}`]
                          }`}
                        >
                          {(expiryStatus.variant === 'danger' ||
                            expiryStatus.variant === 'warning') && (
                            <AlertTriangle size={10} />
                          )}
                          {expiryStatus.variant === 'success' && (
                            <Check size={10} />
                          )}
                          {expiryStatus.label}
                        </span>
                      </div>

                      <div className={styles.batchQtyCell}>
                        <span className={styles.batchQtyValue}>
                          {b.quantityOnHand}
                        </span>
                        <span className={styles.batchQtyUnit}>{unitLabel}</span>
                      </div>
                    </div>

                    <div className={styles.batchRowMeta}>
                      {b.unitCost != null && (
                        <span className={styles.metaItem}>
                          Cost:{' '}
                          <strong>
                            {formatCurrency
                              ? formatCurrency(b.unitCost)
                              : `${currency} ${b.unitCost}`}
                          </strong>
                        </span>
                      )}
                      {b.sellingPrice != null && (
                        <span className={styles.metaItem}>
                          Sell:{' '}
                          <strong>
                            {formatCurrency
                              ? formatCurrency(b.sellingPrice)
                              : `${currency} ${b.sellingPrice}`}
                          </strong>
                        </span>
                      )}
                      <span
                        className={`${styles.metaStatus} ${
                          b.status === 'AVAILABLE'
                            ? styles.metaStatusOk
                            : styles.metaStatusWarn
                        }`}
                      >
                        {b.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductBatchesModal;