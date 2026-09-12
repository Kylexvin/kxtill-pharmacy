// src/pages/KxTillStaff/components/EditBranchesModal.jsx
import React, { useState, useEffect } from 'react';
import { X, Building2, Check, AlertCircle } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import styles from './EditBranchesModal.module.css';

const EditBranchesModal = ({ isOpen, member, branches, orgId, onClose, onSaved }) => {
  const [selected, setSelected] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && member) {
      setSelected((member.branches || []).map((b) => b.id));
      setError('');
    }
  }, [isOpen, member]);

  const toggle = (branchId) => {
    setSelected((prev) =>
      prev.includes(branchId)
        ? prev.filter((id) => id !== branchId)
        : [...prev, branchId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (selected.length === 0) {
      setError('Select at least one branch, or use Remove Access instead.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await axios.patch(
        `/organizations/${orgId}/kxtill/staff/${member.userId}`,
        { branchIds: selected }
      );
      toast.success('Branch access updated');
      onSaved?.();
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to update branches';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !member) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>
            <Building2 size={18} />
            <span>Edit Branch Access</span>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={submitting}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.body}>
          <div className={styles.memberInfo}>
            <span className={styles.memberName}>
              {member.user.firstName} {member.user.lastName}
            </span>
            <span className={styles.memberEmail}>{member.user.email}</span>
          </div>

          <div className={styles.branchList}>
            {branches.length === 0 ? (
              <div className={styles.empty}>No branches available</div>
            ) : (
              branches.map((b) => {
                const isSelected = selected.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`${styles.branchItem} ${isSelected ? styles.selected : ''}`}
                    onClick={() => toggle(b.id)}
                    disabled={submitting}
                  >
                    <div className={`${styles.checkbox} ${isSelected ? styles.checked : ''}`}>
                      {isSelected && <Check size={12} />}
                    </div>
                    <div className={styles.branchInfo}>
                      <span className={styles.branchName}>{b.name}</span>
                      {b.code && (
                        <span className={styles.branchCode}>{b.code}</span>
                      )}
                    </div>
                    {b.isDefault && (
                      <span className={styles.defaultBadge}>Default</span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {error && (
            <div className={styles.errorMessage}>
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

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
              type="submit"
              className={styles.submitBtn}
              disabled={submitting}
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditBranchesModal;