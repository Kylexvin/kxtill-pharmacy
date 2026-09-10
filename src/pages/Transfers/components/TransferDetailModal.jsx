// src/pages/Transfers/components/TransferDetailModal.jsx
import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowRight,
  Check,
  XCircle,
  CheckCircle,
  Building2,
  Package,
  User,
  Info,
  Loader2,
} from 'lucide-react';
import styles from './TransferDetailModal.module.css';
import TransferStatusBadge from './TransferStatusBadge';

// Simple inner confirm overlay for the modal — keeps everything self-contained
const InlineConfirm = ({
  isOpen,
  variant = 'info',
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isSubmitting,
  confirmDisabled,
}) => {
  if (!isOpen) return null;
  return (
    <div className={styles.inlineConfirmOverlay} onClick={onCancel}>
      <div className={styles.inlineConfirm} onClick={(e) => e.stopPropagation()}>
        <h4 className={styles.inlineConfirmTitle}>{title}</h4>
        <div className={styles.inlineConfirmBody}>{children}</div>
        <div className={styles.inlineConfirmActions}>
          <button
            type="button"
            className={styles.inlineCancelBtn}
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${styles.inlineConfirmBtn} ${styles[variant]}`}
            onClick={onConfirm}
            disabled={isSubmitting || confirmDisabled}
          >
            {isSubmitting ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

const TransferDetailModal = ({
  isOpen,
  onClose,
  transfer,
  actionLoading,
  canApprove,
  canReject,
  canComplete,
  onApprove,
  onReject,
  onComplete,
}) => {
  const [confirm, setConfirm] = useState(null); // null | 'approve' | 'reject' | 'complete' | 'completeAfterApprove'
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setConfirm(null);
      setRejectionReason('');
    }
  }, [isOpen]);

  if (!isOpen || !transfer) return null;

  const from = transfer.sourceBranchProduct?.branch;
  const to = transfer.destBranchProduct?.branch;
  const product =
    transfer.sourceBranchProduct?.displayName ||
    transfer.sourceBranchProduct?.product?.name ||
    transfer.destBranchProduct?.displayName ||
    'Unknown';
  const qty = parseInt(transfer.quantitySent, 10) || 0;

  const statusAllows = {
    approve: transfer.status === 'PENDING',
    reject: transfer.status === 'PENDING',
    complete: transfer.status === 'APPROVED',
  };

  const showApprove = canApprove && statusAllows.approve;
  const showReject = canReject && statusAllows.reject;
  const showComplete = canComplete && statusAllows.complete;
  const isReadOnly = !showApprove && !showReject && !showComplete;

  const fmtDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return '—';
    }
  };

  const displayName = (u) =>
    u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || '—' : '—';

  // ---- Approve → optionally offer Complete ----
  const doApprove = async () => {
    const res = await onApprove(transfer.id);
    setConfirm(null);
    if (res?.ok && showComplete) {
      // Offer complete
      setConfirm('completeAfterApprove');
    }
  };

  const doReject = async () => {
    const reason = rejectionReason.trim();
    if (reason.length < 3) return; // guarded by UI
    const res = await onReject(transfer.id, reason);
    setConfirm(null);
    setRejectionReason('');
    if (res?.ok) {
      // Parent already closed the modal
    }
  };

  const doComplete = async () => {
    await onComplete(transfer.id);
    setConfirm(null);
  };

  return (
    <div className={styles.overlay} onClick={() => !actionLoading && onClose()}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerText}>
            <div className={styles.title}>
              <span className={styles.reference}>{transfer.reference}</span>
              <TransferStatusBadge status={transfer.status} />
            </div>
            <p className={styles.subtitle}>{fmtDate(transfer.createdAt)}</p>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            type="button"
            disabled={actionLoading}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Route */}
          <div className={styles.route}>
            <div className={styles.routeBranch}>
              <Building2 size={14} />
              <div>
                <span className={styles.routeCode}>{from?.code || '—'}</span>
                <span className={styles.routeName}>{from?.name || ''}</span>
              </div>
            </div>
            <ArrowRight size={18} className={styles.routeArrow} />
            <div className={styles.routeBranch}>
              <Building2 size={14} />
              <div>
                <span className={styles.routeCode}>{to?.code || '—'}</span>
                <span className={styles.routeName}>{to?.name || ''}</span>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className={styles.detailGrid}>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>
                <Package size={12} /> Product
              </span>
              <span className={styles.detailValue}>{product}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Quantity</span>
              <span className={styles.detailValue}>
                {qty} {qty === 1 ? 'unit' : 'units'}
              </span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>
                <User size={12} /> Initiated by
              </span>
              <span className={styles.detailValue}>
                {displayName(transfer.initiatedBy)}
              </span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Notes</span>
              <span className={styles.detailValue}>
                {transfer.notes || 'No notes'}
              </span>
            </div>
          </div>

          {/* Rejection reason display */}
          {transfer.status === 'REJECTED' && transfer.rejectionReason && (
            <div className={styles.rejectionBox}>
              <strong>Rejection reason:</strong> {transfer.rejectionReason}
            </div>
          )}

          {/* Read-only info for cashiers */}
          {isReadOnly && (
            <div className={styles.infoBox}>
              <Info size={14} />
              <span>
                {transfer.status === 'PENDING' &&
                  'This transfer is awaiting approval by a manager or owner.'}
                {transfer.status === 'APPROVED' &&
                  'Stock has already moved. Waiting for receiving branch confirmation.'}
                {transfer.status === 'COMPLETED' &&
                  'This transfer has been completed.'}
                {transfer.status === 'REJECTED' &&
                  'This transfer was rejected.'}
                {transfer.status === 'FAILED' &&
                  'This transfer failed. Check stock levels at the source branch.'}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={actionLoading}
          >
            Close
          </button>
          {showReject && (
            <button
              type="button"
              className={styles.rejectBtn}
              onClick={() => setConfirm('reject')}
              disabled={actionLoading}
            >
              <XCircle size={14} /> Reject
            </button>
          )}
          {showApprove && (
            <button
              type="button"
              className={styles.approveBtn}
              onClick={() => setConfirm('approve')}
              disabled={actionLoading}
            >
              <Check size={14} /> Approve
            </button>
          )}
          {showComplete && (
            <button
              type="button"
              className={styles.completeBtn}
              onClick={() => setConfirm('complete')}
              disabled={actionLoading}
            >
              <CheckCircle size={14} /> Mark Completed
            </button>
          )}
        </div>

        {/* ---- Confirm dialogs (inline overlays) ---- */}

        <InlineConfirm
          isOpen={confirm === 'approve'}
          variant="warning"
          title="Approve and move stock?"
          confirmLabel="Approve & Move Stock"
          onCancel={() => setConfirm(null)}
          onConfirm={doApprove}
          isSubmitting={actionLoading}
        >
          <p>This will immediately:</p>
          <ul className={styles.confirmList}>
            <li>
              Deduct <strong>{qty} units</strong> from{' '}
              <strong>{from?.code || 'source'}</strong>
            </li>
            <li>
              Add <strong>{qty} units</strong> to{' '}
              <strong>{to?.code || 'destination'}</strong>
            </li>
          </ul>
          <p className={styles.confirmNote}>
            Physical handoff is confirmed separately with "Mark Completed".
          </p>
        </InlineConfirm>

        <InlineConfirm
          isOpen={confirm === 'reject'}
          variant="danger"
          title="Reject this transfer?"
          confirmLabel="Reject"
          onCancel={() => setConfirm(null)}
          onConfirm={doReject}
          isSubmitting={actionLoading}
          confirmDisabled={rejectionReason.trim().length < 3}
        >
          <p>No stock will move. Provide a reason so the initiator understands why.</p>
          <input
            type="text"
            className={styles.reasonInput}
            placeholder="Reason for rejection (required)"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            disabled={actionLoading}
            autoFocus
          />
        </InlineConfirm>

        <InlineConfirm
          isOpen={confirm === 'complete'}
          variant="success"
          title="Mark this transfer as received?"
          confirmLabel="Mark Completed"
          onCancel={() => setConfirm(null)}
          onConfirm={doComplete}
          isSubmitting={actionLoading}
        >
          <p>
            Confirm that <strong>{to?.code || 'destination'}</strong> has
            physically received the <strong>{qty} units</strong> from{' '}
            <strong>{from?.code || 'source'}</strong>.
          </p>
          <p className={styles.confirmNote}>
            Stock was already moved when the transfer was approved.
          </p>
        </InlineConfirm>

        <InlineConfirm
          isOpen={confirm === 'completeAfterApprove'}
          variant="success"
          title="Mark this transfer as received now?"
          confirmLabel="Mark Completed"
          cancelLabel="Not yet"
          onCancel={() => setConfirm(null)}
          onConfirm={doComplete}
          isSubmitting={actionLoading}
        >
          <p>
            Stock has already moved. If <strong>{to?.code || 'destination'}</strong>{' '}
            has the goods in hand, you can complete it now.
          </p>
        </InlineConfirm>
      </div>
    </div>
  );
};

export default TransferDetailModal;