// src/pages/Transfers/components/NewTransferModal.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, ArrowRight, Loader2, Package, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import styles from './NewTransferModal.module.css';

const NewTransferModal = ({
  isOpen,
  onClose,
  onCreate,
  orgId,
  activeBranch,
}) => {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    sourceBranchId: '',
    sourceBranchProductId: '',
    destBranchId: '',
    quantitySent: 1,
    notes: '',
  });

  // Fetch form-data on open
  useEffect(() => {
    if (!isOpen || !orgId) return;
    let cancelled = false;

    setLoading(true);
    axios
      .get(`/organizations/${orgId}/kxtill/transfers/form-data`)
      .then((res) => {
        if (cancelled) return;
        setBranches(res.data.branches || []);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(
          err.response?.data?.error ||
          err.response?.data?.message ||
          'Failed to load form data'
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Default: from active branch
    setFormData({
      sourceBranchId: activeBranch?.id || '',
      sourceBranchProductId: '',
      destBranchId: '',
      quantitySent: 1,
      notes: '',
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, orgId, activeBranch?.id]);

  const sourceBranch = useMemo(
    () => branches.find((b) => b.id === formData.sourceBranchId),
    [branches, formData.sourceBranchId]
  );

  const destBranch = useMemo(
    () => branches.find((b) => b.id === formData.destBranchId),
    [branches, formData.destBranchId]
  );

  const sourceProducts = useMemo(() => {
    if (!sourceBranch) return [];
    return (sourceBranch.products || []).filter(
      (p) => parseInt(p.stock, 10) > 0
    );
  }, [sourceBranch]);

  const selectedSourceProduct = useMemo(
    () => sourceProducts.find((p) => p.id === formData.sourceBranchProductId),
    [sourceProducts, formData.sourceBranchProductId]
  );

  const destHasProduct = useMemo(() => {
    if (!destBranch || !selectedSourceProduct) return null;
    return (destBranch.products || []).some(
      (p) => p.productId === selectedSourceProduct.productId
    );
  }, [destBranch, selectedSourceProduct]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.sourceBranchProductId || !formData.destBranchId) return;

    setSubmitting(true);
    const result = await onCreate({
      sourceBranchProductId: formData.sourceBranchProductId,
      destBranchId: formData.destBranchId,
      quantitySent: parseInt(formData.quantitySent, 10) || 1,
      notes: formData.notes?.trim() || undefined,
    });
    setSubmitting(false);

    if (result?.ok) {
      // Parent closes the modal via onCreate success
    }
  };

  if (!isOpen) return null;

  const maxQty = selectedSourceProduct
    ? parseInt(selectedSourceProduct.stock, 10)
    : 999;

  return (
    <div className={styles.overlay} onClick={() => !submitting && onClose()}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerText}>
            <div className={styles.title}>
              <Plus size={18} />
              <span>New Stock Transfer</span>
            </div>
            <p className={styles.subtitle}>
              Move stock between branches. Approval is required before stock moves.
            </p>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            type="button"
            disabled={submitting}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className={styles.body}>
          {loading ? (
            <div className={styles.loadingState}>
              <Loader2 size={20} className={styles.spinning} />
              <p>Loading branches…</p>
            </div>
          ) : (
            <>
              {/* From Branch */}
              <div className={styles.field}>
                <label className={styles.label}>
                  <Building2 size={12} /> From Branch
                </label>
                <select
                  className={styles.select}
                  value={formData.sourceBranchId}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      sourceBranchId: e.target.value,
                      sourceBranchProductId: '',
                    }))
                  }
                  required
                  disabled={submitting}
                >
                  <option value="">Select source branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* From Product */}
              <div className={styles.field}>
                <label className={styles.label}>
                  <Package size={12} /> Product
                </label>
                <select
                  className={styles.select}
                  value={formData.sourceBranchProductId}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      sourceBranchProductId: e.target.value,
                    }))
                  }
                  required
                  disabled={!formData.sourceBranchId || submitting}
                >
                  <option value="">
                    {sourceProducts.length === 0
                      ? 'No products with stock in this branch'
                      : 'Select product'}
                  </option>
                  {sourceProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.productName} ({p.stock} available)
                    </option>
                  ))}
                </select>
                {selectedSourceProduct && (
                  <span className={styles.hint}>
                    Available: {selectedSourceProduct.stock} units
                  </span>
                )}
              </div>

              {/* To Branch */}
              <div className={styles.field}>
                <label className={styles.label}>
                  <Building2 size={12} /> To Branch
                </label>
                <select
                  className={styles.select}
                  value={formData.destBranchId}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, destBranchId: e.target.value }))
                  }
                  required
                  disabled={submitting}
                >
                  <option value="">Select destination branch</option>
                  {branches
                    .filter((b) => b.id !== formData.sourceBranchId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} — {b.name}
                      </option>
                    ))}
                </select>
                {destHasProduct !== null && (
                  <span className={styles.hint}>
                    {destHasProduct
                      ? '✅ Product already exists at destination'
                      : '🆕 A new listing will be created at destination'}
                  </span>
                )}
              </div>

              {/* Quantity */}
              <div className={styles.field}>
                <label className={styles.label}>Quantity</label>
                <input
                  type="number"
                  className={styles.input}
                  value={formData.quantitySent}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      quantitySent: e.target.value,
                    }))
                  }
                  min="1"
                  max={maxQty}
                  required
                  disabled={submitting}
                />
                {selectedSourceProduct && (
                  <span className={styles.hint}>
                    Max transfer: {selectedSourceProduct.stock} units
                  </span>
                )}
              </div>

              {/* Notes */}
              <div className={styles.field}>
                <label className={styles.label}>Notes (optional)</label>
                <textarea
                  className={styles.textarea}
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, notes: e.target.value }))
                  }
                  placeholder="Reason, carrier, tracking info…"
                  rows={3}
                  disabled={submitting}
                />
              </div>
            </>
          )}
        </form>

        {/* Footer */}
        <div className={styles.footer}>
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
            className={styles.saveBtn}
            onClick={handleSubmit}
            disabled={
              submitting ||
              loading ||
              !formData.sourceBranchProductId ||
              !formData.destBranchId
            }
          >
            {submitting ? (
              <>
                <Loader2 size={14} className={styles.spinning} /> Creating…
              </>
            ) : (
              <>
                <ArrowRight size={14} /> Create Transfer
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewTransferModal;