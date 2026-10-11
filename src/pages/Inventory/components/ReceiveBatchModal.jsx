// src/pages/Inventory/components/ReceiveBatchModal.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  PackagePlus,
  CalendarClock,
  Building2,
  AlertCircle,
  Info,
} from 'lucide-react';

import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import styles from './ReceiveBatchModal.module.css';

const DAYS_MS = 24 * 60 * 60 * 1000;

const todayPlus = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const emptyForm = () => ({
  branchId: '',
  batchNumber: '',
  expiryDate: '',
  quantityBase: '',
  unitCost: '',
  manufacturer: '',
  reason: '',
});

const ReceiveBatchModal = ({
  isOpen,
  onClose,
  onSave,
  product,
  isSubmitting,
  branches = [],
  defaultBranchId,
  currency = 'KES',
}) => {
  const { activeOrganization } = useAuth();
  const orgId = activeOrganization?.id;

  const [form, setForm] = useState(emptyForm());
  const [errors, setErrors] = useState({});
  const [medicineSearch, setMedicineSearch] = useState('');
  const [medicineResults, setMedicineResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const isBranchLocked = branches.length === 1;

  // ---------- reset on open ----------
  useEffect(() => {
    if (!isOpen) return;

    const branch = defaultBranchId || branches[0]?.id || '';
    const fallbackProduct = product || null;

    // Prefill unitCost from the product's global cost when we already have it.
    const prefillCost =
      fallbackProduct?.cost != null && Number(fallbackProduct.cost) > 0
        ? String(Number(fallbackProduct.cost))
        : '';

    setForm({
      ...emptyForm(),
      branchId: branch,
      unitCost: prefillCost,
    });
    setErrors({});
    setSelectedProduct(fallbackProduct);
    setMedicineSearch('');
    setMedicineResults([]);
  }, [isOpen, product, defaultBranchId, branches]);

  // ---------- medicine search ----------
  useEffect(() => {
    if (!isOpen) return;
    if (product) return;
    if (!medicineSearch.trim()) {
      setMedicineResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get(
          `/organizations/${orgId}/kxtill/products`,
          { params: { search: medicineSearch.trim(), limit: 20 } }
        );
        const items = (res.data?.items || []).filter(
          (p) => !!p.pharmacyProduct
        );
        setMedicineResults(items);
      } catch (err) {
        console.error('Medicine search failed:', err);
        setMedicineResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [isOpen, product, medicineSearch, orgId]);

  // ---------- global pricing reference ----------
  // Prefer the product's own cost / baseUnit.price. If missing, fall back
  // to the product cost we already have on the selected branch row.
  const globalCost = useMemo(() => {
    if (!selectedProduct) return null;
    const raw = selectedProduct.cost;
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [selectedProduct]);

  const globalSellingPrice = useMemo(() => {
    if (!selectedProduct) return null;
    const bu = selectedProduct.baseUnit;
    if (!bu) return null;
    const raw = bu.price;
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [selectedProduct]);

  const hasGlobalPricing =
    globalCost != null || globalSellingPrice != null;

  // ---------- form ----------
  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = () => {
    const errs = {};
    if (!selectedProduct) errs.product = 'Select a medicine';
    if (!form.branchId) errs.branchId = 'Branch is required';
    if (!form.batchNumber.trim()) errs.batchNumber = 'Batch number is required';
    if (!form.expiryDate) errs.expiryDate = 'Expiry date is required';
    if (!form.quantityBase || Number(form.quantityBase) <= 0) {
      errs.quantityBase = 'Quantity must be greater than 0';
    }
    if (form.unitCost === '' || Number(form.unitCost) < 0) {
      errs.unitCost = 'Unit cost must be 0 or more';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      productId: selectedProduct.productId || selectedProduct.id,
      branchId: form.branchId,
      batchNumber: form.batchNumber.trim(),
      expiryDate: form.expiryDate,
      quantityBase: parseInt(form.quantityBase, 10),
      unitCost: parseFloat(form.unitCost),
      manufacturer: form.manufacturer.trim() || undefined,
      reason: form.reason.trim() || undefined,
    };

    onSave(payload);
  };

  const baseUnitLabel = useMemo(() => {
    if (!selectedProduct) return 'units';
    return (
      selectedProduct.baseUnit?.abbreviation ||
      selectedProduct.baseUnit?.name ||
      selectedProduct.unit ||
      'units'
    );
  }, [selectedProduct]);

  const expiryDaysFromNow = useMemo(() => {
    if (!form.expiryDate) return null;
    const target = new Date(form.expiryDate).getTime();
    return Math.ceil((target - Date.now()) / DAYS_MS);
  }, [form.expiryDate]);

  const expiryWarning = useMemo(() => {
    if (expiryDaysFromNow === null) return null;
    if (expiryDaysFromNow < 0) {
      return { level: 'error', text: 'This batch is already expired' };
    }
    if (expiryDaysFromNow < 90) {
      return {
        level: 'warning',
        text: `Expires in ${expiryDaysFromNow} days — a short-dated batch`,
      };
    }
    return null;
  }, [expiryDaysFromNow]);

  if (!isOpen) return null;

  const formatMoney = (n) =>
    `${currency} ${Number(n).toFixed(2)}`;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerText}>
            <div className={styles.title}>
              <PackagePlus size={18} />
              <span>Receive Batch</span>
            </div>
            <p className={styles.subtitle}>
              Stock enters the pharmacy as a batch. Batch number and expiry are
              required for traceability.
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className={styles.body}>
          {/* ─── Medicine ─── */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardStep}>1</span>
              <h4>Medicine</h4>
            </div>

            {selectedProduct ? (
              <div className={styles.selectedProduct}>
                <div className={styles.selectedProductMain}>
                  <span className={styles.selectedProductName}>
                    {selectedProduct.name || selectedProduct.productName}
                  </span>
                  <span className={styles.selectedProductGeneric}>
                    {[
                      selectedProduct.pharmacyProduct?.genericName,
                      selectedProduct.pharmacyProduct?.strength,
                      selectedProduct.pharmacyProduct?.dosageForm,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Medicine'}
                  </span>
                </div>
                {!product && (
                  <button
                    type="button"
                    className={styles.changeProductBtn}
                    onClick={() => setSelectedProduct(null)}
                  >
                    Change
                  </button>
                )}
              </div>
            ) : (
              <>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search medicine by name, generic, or SKU..."
                  value={medicineSearch}
                  onChange={(e) => setMedicineSearch(e.target.value)}
                  autoFocus
                />
                {errors.product && (
                  <span className={styles.errorText}>{errors.product}</span>
                )}

                {searching && <span className={styles.muted}>Searching…</span>}

                {medicineResults.length > 0 && (
                  <div className={styles.searchResults}>
                    {medicineResults.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={styles.searchResult}
                        onClick={() => {
                          setSelectedProduct(m);
                          setMedicineResults([]);
                          setMedicineSearch('');
                        }}
                      >
                        <div className={styles.searchResultMain}>
                          <span className={styles.searchResultName}>
                            {m.name}
                          </span>
                          <span className={styles.searchResultGeneric}>
                            {[
                              m.pharmacyProduct?.genericName,
                              m.pharmacyProduct?.strength,
                              m.pharmacyProduct?.dosageForm,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </div>
                        {m.sku && (
                          <span className={styles.searchResultSku}>
                            {m.sku}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {!searching &&
                  medicineSearch.trim() &&
                  medicineResults.length === 0 && (
                    <span className={styles.muted}>
                      No medicines matched your search
                    </span>
                  )}
              </>
            )}
          </section>

          {/* ─── Batch details ─── */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardStep}>2</span>
              <h4>Batch details</h4>
            </div>

            <div className={styles.formGrid}>
              {isBranchLocked ? (
                <div className={styles.formGroupFull}>
                  <label>Branch</label>
                  <div className={styles.lockedBranch}>
                    <Building2 size={14} />
                    <span>{branches[0]?.name}</span>
                    {branches[0]?.code && (
                      <span className={styles.lockedBranchCode}>
                        ({branches[0].code})
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className={styles.formGroupFull}>
                  <label>Branch *</label>
                  <div className={styles.inputWithIcon}>
                    <Building2 size={14} className={styles.inputIcon} />
                    <select
                      value={form.branchId}
                      onChange={(e) =>
                        handleChange('branchId', e.target.value)
                      }
                      className={styles.select}
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                          {b.code ? ` (${b.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {errors.branchId && (
                    <span className={styles.errorText}>{errors.branchId}</span>
                  )}
                </div>
              )}

              <div className={styles.formGroup}>
                <label>Batch number *</label>
                <input
                  type="text"
                  value={form.batchNumber}
                  onChange={(e) => handleChange('batchNumber', e.target.value)}
                  placeholder="e.g. AMOX-2026-001"
                  autoComplete="off"
                />
                {errors.batchNumber && (
                  <span className={styles.errorText}>{errors.batchNumber}</span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label>Expiry date *</label>
                <div className={styles.inputWithIcon}>
                  <CalendarClock size={14} className={styles.inputIcon} />
                  <input
                    type="date"
                    value={form.expiryDate}
                    onChange={(e) => handleChange('expiryDate', e.target.value)}
                    min={todayPlus(0)}
                  />
                </div>
                {errors.expiryDate && (
                  <span className={styles.errorText}>{errors.expiryDate}</span>
                )}
              </div>

              {expiryWarning && (
                <div className={styles.formGroupFull}>
                  <div
                    className={`${styles.warningBanner} ${
                      expiryWarning.level === 'error'
                        ? styles.warningBannerError
                        : styles.warningBannerWarn
                    }`}
                  >
                    <AlertCircle size={14} />
                    {expiryWarning.text}
                  </div>
                </div>
              )}

              <div className={styles.formGroup}>
                <label>Quantity ({baseUnitLabel}) *</label>
                <input
                  type="number"
                  value={form.quantityBase}
                  onChange={(e) => handleChange('quantityBase', e.target.value)}
                  placeholder="0"
                  min="0"
                  step="any"
                />
                {errors.quantityBase && (
                  <span className={styles.errorText}>{errors.quantityBase}</span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label>Unit cost ({currency}) *</label>
                <input
                  type="number"
                  value={form.unitCost}
                  onChange={(e) => handleChange('unitCost', e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
                {errors.unitCost && (
                  <span className={styles.errorText}>{errors.unitCost}</span>
                )}

                {/* Global pricing reference — read only */}
                {hasGlobalPricing && (
                  <div
                    style={{
                      marginTop: 6,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'rgba(139, 141, 153, 0.08)',
                      border: '1px solid rgba(139, 141, 153, 0.15)',
                      fontSize: 11,
                      color: '#8b8d99',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        fontWeight: 600,
                        marginBottom: 2,
                      }}
                    >
                      <Info size={11} />
                      Global pricing (read-only)
                    </div>
                    {globalCost != null && (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>Product cost</span>
                        <strong style={{ color: '#eceef2' }}>
                          {formatMoney(globalCost)}
                        </strong>
                      </div>
                    )}
                    {globalSellingPrice != null && (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>Selling price</span>
                        <strong style={{ color: '#eceef2' }}>
                          {formatMoney(globalSellingPrice)}
                        </strong>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className={styles.formGroupFull}>
                <label>Manufacturer</label>
                <input
                  type="text"
                  value={form.manufacturer}
                  onChange={(e) => handleChange('manufacturer', e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className={styles.formGroupFull}>
                <label>Note</label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={(e) => handleChange('reason', e.target.value)}
                  placeholder="Optional — e.g. Purchase order #, supplier name"
                />
              </div>
            </div>
          </section>

          {/* Footer */}
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.saveBtn}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Receiving…' : 'Receive batch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReceiveBatchModal;