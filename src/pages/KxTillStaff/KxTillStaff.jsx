// src/pages/KxTillStaff/KxTillStaff.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useSettings } from '../../contexts/SettingsContext';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  Users,
  Search,
  Shield,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Crown,
  Pencil,
  Trash2,
  Power,
  ExternalLink,
  Building2,
  UserCog,
} from 'lucide-react';
import styles from './KxTillStaff.module.css';
import EditBranchesModal from './components/EditBranchesModal';
import ChangeRoleModal from './components/ChangeRoleModal';

// ============================================================
// SUB-COMPONENTS
// ============================================================

const PermissionBadge = ({ permission }) => {
  const colorMap = {
    view: styles.permissionView,
    create: styles.permissionCreate,
    update: styles.permissionUpdate,
    delete: styles.permissionDelete,
    approve: styles.permissionApprove,
    export: styles.permissionExport,
    refund: styles.permissionRefund,
    manage: styles.permissionManage,
  };
  const color = colorMap[permission] || styles.permissionDefault;
  return (
    <span className={`${styles.permissionBadge} ${color}`}>{permission}</span>
  );
};

const StatusBadge = ({ isActive }) => (
  <span
    className={`${styles.statusPill} ${
      isActive ? styles.statusActive : styles.statusInactive
    }`}
  >
    {isActive ? <CheckCircle size={12} /> : <XCircle size={12} />}
    {isActive ? 'Active' : 'Inactive'}
  </span>
);

// ============================================================
// MAIN PAGE
// ============================================================

const KxTillStaff = () => {
  const navigate = useNavigate();
  const { activeOrganization, branches, loadBranches } = useAuth();
  const { can, isOwner } = usePermissions();
  const { formatDateTime } = useSettings();

  const canView = isOwner || can('kxtill.staff.view');
  const canManage = isOwner || can('kxtill.staff.manage');

  const orgId = activeOrganization?.id;

  const [staff, setStaff] = useState([]);
  const [stats, setStats] = useState({
    total: 0, active: 0, inactive: 0, owners: 0, managers: 0, staff: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [togglingIds, setTogglingIds] = useState(new Set());

  // Modals
  const [editingBranchesFor, setEditingBranchesFor] = useState(null);
  const [changingRoleFor, setChangingRoleFor] = useState(null);
  const [removingAccessFor, setRemovingAccessFor] = useState(null);
  const [removing, setRemoving] = useState(false);

  const isMountedRef = useRef(true);
  const fetchControllerRef = useRef(null);

  const fetchStaff = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    setError(null);

    try {
      const res = await axios.get(
        `/organizations/${orgId}/kxtill/staff`,
        { signal: controller.signal, timeout: 10000 }
      );

      if (controller.signal.aborted || !isMountedRef.current) return;

      setStaff(res.data?.staff || []);
      setStats(res.data?.stats || {
        total: 0, active: 0, inactive: 0, owners: 0, managers: 0, staff: 0,
      });
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      console.error('Failed to fetch KxTill staff:', err);
      if (isMountedRef.current) {
        setError(
          err.response?.data?.error ||
            err.response?.data?.message ||
            'Failed to load staff'
        );
      }
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [orgId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      fetchControllerRef.current?.abort();
    };
  }, []);

  // Initial load + refresh branch list so pickers are current
  useEffect(() => {
    if (!orgId) return;
    fetchStaff();
    if (loadBranches) loadBranches(orgId).catch(() => {});
  }, [orgId, fetchStaff, loadBranches]);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetchStaff();
      toast.success('Refreshed');
    } catch {
      toast.error('Failed to refresh');
    } finally {
      if (isMountedRef.current) setIsRefreshing(false);
    }
  };

  const handleToggleActive = async (member) => {
    if (!canManage || togglingIds.has(member.userId)) return;

    const nextState = !member.isActive;
    setTogglingIds((prev) => new Set(prev).add(member.userId));

    // Optimistic update
    setStaff((prev) =>
      prev.map((s) =>
        s.userId === member.userId ? { ...s, isActive: nextState } : s
      )
    );

    try {
      await axios.patch(
        `/organizations/${orgId}/kxtill/staff/${member.userId}`,
        { isActive: nextState }
      );
      toast.success(
        `${member.user.firstName} ${nextState ? 'activated' : 'deactivated'}`
      );
      fetchStaff();
    } catch (err) {
      // Revert
      setStaff((prev) =>
        prev.map((s) =>
          s.userId === member.userId ? { ...s, isActive: member.isActive } : s
        )
      );
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to update access';
      toast.error(message);
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(member.userId);
        return next;
      });
    }
  };

  const handleRemoveAccess = async () => {
    if (!removingAccessFor || removing) return;
    setRemoving(true);
    try {
      await axios.delete(
        `/organizations/${orgId}/kxtill/staff/${removingAccessFor.userId}`
      );
      toast.success(
        `KxTill access removed for ${removingAccessFor.user.firstName}`
      );
      setRemovingAccessFor(null);
      fetchStaff();
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to remove access';
      toast.error(message);
      setRemovingAccessFor(null);
    } finally {
      if (isMountedRef.current) setRemoving(false);
    }
  };

  const filteredStaff = staff.filter((member) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = `${member.user?.firstName || ''} ${member.user?.lastName || ''}`.toLowerCase();
    const email = (member.user?.email || '').toLowerCase();
    return name.includes(q) || email.includes(q);
  });

  const getRoleDisplay = (member) => {
    const isOwnerStaff = member.permissions?.some((p) => p.key === '*');
    if (member.hasAllBranches && !member.role?.name) return 'Owner';
    if (member.role?.name) return member.role.name;
    return 'No Role';
  };

  const getRoleVariant = (member) => {
    const role = getRoleDisplay(member);
    if (role === 'Owner') return styles.roleOwner;
    if (member.permissions?.some((p) => p.key.includes('manage') || p.key.includes('approve')))
      return styles.roleManager;
    return styles.roleStaff;
  };

  // ---------- Guards ----------
  if (!canView) {
    return (
      <div className={styles.page}>
        <div className={styles.noAccess}>
          <Shield size={48} className={styles.noAccessIcon} />
          <h2>Access Denied</h2>
          <p>You don't have permission to view KxTill staff.</p>
          <p className={styles.noAccessSub}>
            Contact your organization owner for access.
          </p>
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className={styles.page}>
        <div className={styles.noAccess}>
          <AlertCircle size={48} className={styles.noAccessIcon} />
          <h2>No organization selected</h2>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loaderWrapper}>
          <div className={styles.loader} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <AlertCircle size={32} className={styles.errorIcon} />
          <p className={styles.errorText}>{error}</p>
          <button className={styles.retryBtn} onClick={fetchStaff}>
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <Users size={20} />
          </div>
          <div>
            <h1 className={styles.title}>KxTill Staff</h1>
            <p className={styles.subtitle}>
              Users with access to KxTill · {activeOrganization?.name || 'Organization'}
            </p>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button
            className={styles.refreshBtn}
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw size={14} className={isRefreshing ? styles.spinning : ''} />
            {isRefreshing ? '...' : 'Refresh'}
          </button>
          <button
            className={styles.manageLink}
            onClick={() => navigate('/staff')}
          >
            <ExternalLink size={12} />
            Manage Members
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.total}</div>
          <div className={styles.statLabel}>Total</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardActive}`}>
          <div className={styles.statValue}>{stats.active}</div>
          <div className={styles.statLabel}>Active</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardInactive}`}>
          <div className={styles.statValue}>{stats.inactive}</div>
          <div className={styles.statLabel}>Inactive</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardOwner}`}>
          <div className={styles.statValue}>{stats.owners}</div>
          <div className={styles.statLabel}>Owners</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardManager}`}>
          <div className={styles.statValue}>{stats.managers}</div>
          <div className={styles.statLabel}>Managers</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardStaff}`}>
          <div className={styles.statValue}>{stats.staff}</div>
          <div className={styles.statLabel}>Staff</div>
        </div>
      </div>

      {/* Search */}
      <div className={styles.filtersBar}>
        <div className={styles.searchWrap}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search staff by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableCard}>
        {filteredStaff.length === 0 ? (
          <div className={styles.emptyState}>
            <Users size={48} className={styles.emptyIcon} />
            <h3>No staff found</h3>
            <p>
              {searchQuery
                ? 'Try adjusting your search'
                : 'No users have access to KxTill yet.'}
            </p>
          </div>
        ) : (
          <>
            <div className={styles.tableHeaders}>
              <span>Staff</span>
              <span>Role</span>
              <span>Branches</span>
              <span>Permissions</span>
              <span>Status</span>
              <span className={styles.actionsHeader}>Actions</span>
            </div>

            <div className={styles.tableBody}>
              {filteredStaff.map((member) => {
                const isOwnerStaff = member.permissions?.some((p) => p.key === '*');
                const roleDisplay = getRoleDisplay(member);
                const roleVariant = getRoleVariant(member);
                const isToggling = togglingIds.has(member.userId);

                return (
                  <div key={member.userId} className={styles.tableRow}>
                    {/* Staff */}
                    <div className={styles.staffCell}>
                      <div className={styles.staffAvatar}>
                        {member.user?.firstName?.charAt(0) || 'U'}
                      </div>
                      <div className={styles.staffMeta}>
                        <div className={styles.staffName}>
                          {member.user?.firstName} {member.user?.lastName}
                          {isOwnerStaff && (
                            <span className={styles.ownerBadge}>
                              <Crown size={10} />
                              Owner
                            </span>
                          )}
                        </div>
                        <div className={styles.staffEmail}>
                          {member.user?.email}
                        </div>
                        <div className={styles.staffJoined}>
                          Joined {formatDateTime(member.joinedAt)}
                        </div>
                      </div>
                    </div>

                    {/* Role */}
                    <div className={styles.roleCell}>
                      <span className={`${styles.roleBadge} ${roleVariant}`}>
                        {roleDisplay}
                      </span>
                    </div>

                    {/* Branches */}
                    <div className={styles.branchesCell}>
                      {member.hasAllBranches ? (
                        <span className={styles.allBranchesPill}>
                          All Branches
                        </span>
                      ) : member.branches && member.branches.length > 0 ? (
                        <div className={styles.branchTags}>
                          {member.branches.slice(0, 2).map((b) => (
                            <span key={b.id} className={styles.branchTag}>
                              {b.code}
                            </span>
                          ))}
                          {member.branches.length > 2 && (
                            <span className={styles.branchTagMore}>
                              +{member.branches.length - 2}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className={styles.muted}>No branches</span>
                      )}
                    </div>

                    {/* Permissions */}
                    <div className={styles.permissionsCell}>
                      {member.permissions?.length > 0 ? (
                        <>
                          {member.permissions.slice(0, 3).map((p) => {
                            const short = p.key.split('.').pop() || '';
                            return (
                              <PermissionBadge key={p.id} permission={short} />
                            );
                          })}
                          {member.permissions.length > 3 && (
                            <span className={styles.permissionMore}>
                              +{member.permissions.length - 3}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </div>

                    {/* Status */}
                    <div className={styles.statusCell}>
                      <StatusBadge isActive={member.isActive} />
                    </div>

                    {/* Actions */}
                    <div className={styles.actionsCell}>
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${
                              member.isActive ? styles.actionBtnWarning : styles.actionBtnPositive
                            }`}
                            onClick={() => handleToggleActive(member)}
                            disabled={isToggling}
                            title={member.isActive ? 'Deactivate' : 'Activate'}
                          >
                            <Power size={14} />
                          </button>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() => setChangingRoleFor(member)}
                            title="Change role"
                          >
                            <UserCog size={14} />
                          </button>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() => setEditingBranchesFor(member)}
                            disabled={member.hasAllBranches}
                            title={
                              member.hasAllBranches
                                ? 'Has all branches'
                                : 'Edit branches'
                            }
                          >
                            <Building2 size={14} />
                          </button>
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                            onClick={() => setRemovingAccessFor(member)}
                            title="Remove KxTill access"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer note */}
      <div className={styles.footer}>
        <span className={styles.footerText}>
          Only KxTill permissions are shown here. Other platform permissions are managed in Members &amp; Roles.
        </span>
        <button className={styles.footerLink} onClick={() => navigate('/staff')}>
          Go to Members &amp; Roles →
        </button>
      </div>

      {/* Modals */}
      {editingBranchesFor && (
        <EditBranchesModal
          isOpen={true}
          member={editingBranchesFor}
          branches={branches || []}
          orgId={orgId}
          onClose={() => setEditingBranchesFor(null)}
          onSaved={() => {
            setEditingBranchesFor(null);
            fetchStaff();
          }}
        />
      )}

      {changingRoleFor && (
        <ChangeRoleModal
          isOpen={true}
          member={changingRoleFor}
          orgId={orgId}
          onClose={() => setChangingRoleFor(null)}
          onSaved={() => {
            setChangingRoleFor(null);
            fetchStaff();
          }}
        />
      )}

      {removingAccessFor && (
        <div
          className={styles.modalOverlay}
          onClick={() => !removing && setRemovingAccessFor(null)}
        >
          <div
            className={styles.confirmModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.confirmIcon}>
              <AlertTriangle size={28} />
            </div>
            <h3>Remove KxTill access</h3>
            <p>
              Remove KxTill access for{' '}
              <strong>
                {removingAccessFor.user?.firstName}{' '}
                {removingAccessFor.user?.lastName}
              </strong>
              ? They will lose access to all KxTill features. Their account
              remains active in the organization.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmCancelBtn}
                onClick={() => setRemovingAccessFor(null)}
                disabled={removing}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmRemoveBtn}
                onClick={handleRemoveAccess}
                disabled={removing}
              >
                {removing ? 'Removing...' : 'Remove Access'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KxTillStaff;