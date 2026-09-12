// src/pages/KxTillStaff/components/ChangeRoleModal.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { X, UserCog, Search, RefreshCw, AlertCircle, Check } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import styles from './ChangeRoleModal.module.css';

const ChangeRoleModal = ({ isOpen, member, orgId, onClose, onSaved }) => {
  const [roles, setRoles] = useState([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && member) {
      setSelectedRoleId(member.role?.id || '');
      setError('');
      setSearch('');
    }
  }, [isOpen, member]);

  // Filter + classify roles by KxTill content
  const classifyRole = (role) => {
    const perms = role.permissions || [];
    const kxTillPerms = perms.filter(
      (rp) => rp.permission?.productKey === 'kxtill'
    );
    const otherPerms = perms.filter(
      (rp) => rp.permission?.productKey !== 'kxtill'
    );
    return {
      kxTillCount: kxTillPerms.length,
      otherCount: otherPerms.length,
      isKxTillOnly: kxTillPerms.length > 0 && otherPerms.length === 0,
      isMixed: kxTillPerms.length > 0 && otherPerms.length > 0,
      hasKxTill: kxTillPerms.length > 0,
    };
  };

  const fetchRoles = useCallback(async () => {
    if (!orgId) return;
    setLoadingRoles(true);
    setLoadError('');

    try {
      const res = await axios.get(`/organizations/${orgId}/roles`);
      const allRoles = res.data?.roles || res.data?.items || [];

      // Only roles that grant at least one kxtill.* permission,
      // and skip system roles (Owner, Admin — structural, not assignable here)
      const eligible = allRoles
        .filter((role) => !role.isSystem)
        .filter((role) => classifyRole(role).hasKxTill);

      setRoles(eligible);
    } catch (err) {
      console.error('Failed to fetch roles:', err);
      setLoadError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          'Failed to load roles'
      );
      setRoles([]);
    } finally {
      setLoadingRoles(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (isOpen) fetchRoles();
  }, [isOpen, fetchRoles]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (selectedRoleId === member.role?.id) {
      onClose();
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await axios.patch(
        `/organizations/${orgId}/kxtill/staff/${member.userId}`,
        { roleId: selectedRoleId || null }
      );
      toast.success('Role updated');
      onSaved?.();
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to update role';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !member) return null;

  const filteredRoles = roles.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  const currentRoleId = member.role?.id || '';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>
            <UserCog size={18} />
            <span>Change Role</span>
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
            {member.role?.name && (
              <span className={styles.currentRole}>
                Current: {member.role.name}
              </span>
            )}
          </div>

          <div className={styles.searchWrap}>
            <Search size={14} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search roles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={submitting || loadingRoles}
            />
          </div>

          <div className={styles.roleList}>
            {loadingRoles ? (
              <div className={styles.loadingState}>
                <RefreshCw size={18} className={styles.spinning} />
                <span>Loading roles...</span>
              </div>
            ) : loadError ? (
              <div className={styles.errorMessage}>
                <AlertCircle size={14} />
                <span>{loadError}</span>
              </div>
            ) : filteredRoles.length === 0 ? (
              <div className={styles.empty}>
                {search
                  ? 'No roles match your search'
                  : 'No KxTill-compatible roles available'}
              </div>
            ) : (
              filteredRoles.map((r) => {
                const cls = classifyRole(r);
                const isSelected = selectedRoleId === r.id;
                const isCurrent = currentRoleId === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`${styles.roleItem} ${isSelected ? styles.selected : ''}`}
                    onClick={() => setSelectedRoleId(r.id)}
                    disabled={submitting}
                  >
                    <div className={styles.roleInfo}>
                      <div className={styles.roleNameRow}>
                        <span className={styles.roleName}>{r.name}</span>
                        {cls.isKxTillOnly && (
                          <span className={`${styles.scopeBadge} ${styles.scopeKxTill}`}>
                            KxTill only
                          </span>
                        )}
                        {cls.isMixed && (
                          <span className={`${styles.scopeBadge} ${styles.scopeMixed}`}>
                            Mixed
                          </span>
                        )}
                        {isCurrent && (
                          <span className={styles.currentBadge}>Current</span>
                        )}
                      </div>
                      <span className={styles.roleDesc}>
                        {cls.kxTillCount} KxTill
                        {cls.otherCount > 0 && ` · ${cls.otherCount} other`}
                      </span>
                    </div>
                    {isSelected && (
                      <Check size={14} className={styles.checkIcon} />
                    )}
                  </button>
                );
              })
            )}
          </div>

          <p className={styles.helpText}>
            Roles grant permissions across the organization. Choose a role
            that includes KxTill access.
          </p>

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
              disabled={
                submitting ||
                loadingRoles ||
                !selectedRoleId ||
                selectedRoleId === currentRoleId
              }
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChangeRoleModal;