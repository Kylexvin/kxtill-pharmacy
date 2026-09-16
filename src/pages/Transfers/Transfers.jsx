// src/pages/Transfers/Transfers.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useSettings } from '../../contexts/SettingsContext';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  RefreshCw,
  ArrowRight,
  Plus,
  Search,
  Eye, 
  AlertCircle,
  Building2,
  Loader2,
} from 'lucide-react';
import styles from './Transfers.module.css';
import NewTransferModal from './components/NewTransferModal';
import TransferDetailModal from './components/TransferDetailModal';
import TransferStatusBadge from './components/TransferStatusBadge';
import usePolling from '../../hooks/usePolling';

const POLL_INTERVAL_MS = 30_000;

const Transfers = () => {
  const { activeOrganization, activeBranch } = useAuth();
  const { canAny } = usePermissions();
  const { formatDate } = useSettings();

  const orgId = activeOrganization?.id;
  const branchId = activeBranch?.id;

  // Permissions — owner implied via wildcard.
  const canCreate = canAny([
    'kxtill.inventory.transfers.create',
    'branches.manage',
  ]);

  const canApprove = canAny([
    'kxtill.inventory.transfers.approve',
    'branches.manage',
  ]);

  const canReject = canApprove;

  const canComplete = canAny([
    'kxtill.inventory.transfers.complete',
    'kxtill.inventory.transfers.approve',
    'branches.manage',
  ]);

  // State
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [showNewModal, setShowNewModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const isMountedRef = useRef(true);
  const fetchControllerRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);

  // ---------- fetch ----------
  const fetchTransfers = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return { ok: false };
    }

    if (!hasLoadedOnceRef.current) setLoading(true);

    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    try {
      const params = {};
      if (branchId) params.branchId = branchId;
      if (statusFilter !== 'all') params.status = statusFilter;

      const response = await axios.get(
        `/organizations/${orgId}/kxtill/transfers`,
        { params, signal: controller.signal, timeout: 10000 }
      );

      if (controller.signal.aborted || !isMountedRef.current) {
        return { ok: false };
      }

      setTransfers(response.data.items || []);
      hasLoadedOnceRef.current = true;
      return { ok: true };
    } catch (error) {
      if (error.name === 'CanceledError' || error.name === 'AbortError') {
        return { ok: false };
      }

      console.error('Failed to fetch transfers:', error);
      if (isMountedRef.current) {
        toast.error(
          error.response?.data?.error ||
            error.response?.data?.message ||
            'Failed to load transfers'
        );
        setTransfers([]);
      }
      return { ok: false, error };
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [orgId, branchId, statusFilter]);

  // ---------- lifecycle ----------
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      fetchControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!orgId) return;
    fetchTransfers();
  }, [orgId, fetchTransfers]);

  useEffect(() => {
    const handler = setTimeout(() => setSearchTerm(searchInput), 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // ---------- background polling ----------
  usePolling(
    () => {
      if (!orgId) return;
      if (!navigator.onLine) return;
      fetchTransfers();
    },
    POLL_INTERVAL_MS,
    [orgId, branchId, statusFilter]
  );

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const result = await fetchTransfers();
    if (isMountedRef.current) {
      setRefreshing(false);
      if (result?.ok) toast.success('Refreshed');
    }
  };

  // ---------- derived stats ----------
  const stats = useMemo(() => {
    const s = {
      total: transfers.length,
      pending: 0,
      approved: 0,
      completed: 0,
      rejected: 0,
      failed: 0,
    };
    for (const t of transfers) {
      const key = (t.status || '').toLowerCase();
      if (key in s) s[key]++;
    }
    return s;
  }, [transfers]);

  const filteredTransfers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return transfers;
    return transfers.filter((t) => {
      const ref = t.reference?.toLowerCase() || '';
      const from = t.sourceBranchProduct?.branch?.code?.toLowerCase() || '';
      const to = t.destBranchProduct?.branch?.code?.toLowerCase() || '';
      const product = (
        t.sourceBranchProduct?.displayName ||
        t.sourceBranchProduct?.product?.name ||
        ''
      ).toLowerCase();
      const by = `${t.initiatedBy?.firstName || ''} ${
        t.initiatedBy?.lastName || ''
      }`.toLowerCase();
      return (
        ref.includes(q) ||
        from.includes(q) ||
        to.includes(q) ||
        product.includes(q) ||
        by.includes(q)
      );
    });
  }, [transfers, searchTerm]);

  // ---------- actions ----------
  const openDetail = (transfer) => {
    setSelectedTransfer(transfer);
    setShowDetailModal(true);
  };

  const closeDetail = () => {
    setShowDetailModal(false);
    setSelectedTransfer(null);
  };

  const handleCreate = async (payload) => {
    try {
      const response = await axios.post(
        `/organizations/${orgId}/kxtill/transfers`,
        payload
      );
      const ref = response.data?.transfer?.reference || '';
      toast.success(`Transfer ${ref} created`);
      setShowNewModal(false);
      await fetchTransfers();
      return { ok: true };
    } catch (error) {
      const msg =
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Failed to create transfer';
      toast.error(msg);
      return { ok: false, error: msg };
    }
  };

  const handleApprove = async (id, { offerComplete = true } = {}) => {
    setActionLoading(true);
    try {
      await axios.patch(
        `/organizations/${orgId}/kxtill/transfers/${id}/approve`
      );
      toast.success('Transfer approved — stock has moved');
      await fetchTransfers();
      closeDetail();
      return { ok: true, offerComplete };
    } catch (error) {
      const msg =
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Failed to approve transfer';
      toast.error(msg);
      return { ok: false, error: msg };
    } finally {
      if (isMountedRef.current) setActionLoading(false);
    }
  };

  const handleReject = async (id, reason) => {
    setActionLoading(true);
    try {
      await axios.patch(
        `/organizations/${orgId}/kxtill/transfers/${id}/reject`,
        { reason }
      );
      toast.success('Transfer rejected');
      await fetchTransfers();
      closeDetail();
      return { ok: true };
    } catch (error) {
      const msg =
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Failed to reject transfer';
      toast.error(msg);
      return { ok: false, error: msg };
    } finally {
      if (isMountedRef.current) setActionLoading(false);
    }
  };

  const handleComplete = async (id) => {
    setActionLoading(true);
    try {
      await axios.patch(
        `/organizations/${orgId}/kxtill/transfers/${id}/complete`
      );
      toast.success('Transfer marked as completed');
      await fetchTransfers();
      closeDetail();
      return { ok: true };
    } catch (error) {
      const msg =
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Failed to complete transfer';
      toast.error(msg);
      return { ok: false, error: msg };
    } finally {
      if (isMountedRef.current) setActionLoading(false);
    }
  };

  // ---------- render helpers ----------
  const getDisplayName = (user) => {
    if (!user) return 'Unknown';
    const n = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    return n || 'Unknown';
  };

  if (!orgId) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>
          <AlertCircle size={40} />
          <p>No organization selected</p>
        </div>
      </div>
    );
  }

  const showSkeleton = loading && !hasLoadedOnceRef.current;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <RefreshCw size={20} />
          </div>
          <div>
            <h1 className={styles.title}>Stock Transfers</h1>
            <p className={styles.subtitle}>
              <Building2 size={12} /> {activeBranch?.name || 'All Branches'}
            </p>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button
            className={styles.refreshBtn}
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh"
            type="button"
          >
            <RefreshCw
              size={14}
              className={refreshing ? styles.spinning : ''}
            />
          </button>
          {canCreate && (
            <button
              className={styles.primaryBtn}
              onClick={() => setShowNewModal(true)}
              type="button"
            >
              <Plus size={16} /> New Transfer
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.total}</span>
          <span className={styles.statLabel}>Total</span>
        </div>
        <div className={`${styles.statCard} ${styles.statPending}`}>
          <span className={styles.statValue}>{stats.pending}</span>
          <span className={styles.statLabel}>Pending</span>
        </div>
        <div className={`${styles.statCard} ${styles.statApproved}`}>
          <span className={styles.statValue}>{stats.approved}</span>
          <span className={styles.statLabel}>Approved</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCompleted}`}>
          <span className={styles.statValue}>{stats.completed}</span>
          <span className={styles.statLabel}>Completed</span>
        </div>
        <div className={`${styles.statCard} ${styles.statRejected}`}>
          <span className={styles.statValue}>{stats.rejected}</span>
          <span className={styles.statLabel}>Rejected</span>
        </div>
        <div className={`${styles.statCard} ${styles.statFailed}`}>
          <span className={styles.statValue}>{stats.failed}</span>
          <span className={styles.statLabel}>Failed</span>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filtersBar}>
        <div className={styles.searchWrapper}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by reference, branch, product, or user…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="COMPLETED">Completed</option>
          <option value="REJECTED">Rejected</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      {/* List */}
      {showSkeleton ? (
        <div className={styles.loadingState}>
          <Loader2 size={28} className={styles.spinning} />
          <p>Loading transfers…</p>
        </div>
      ) : filteredTransfers.length === 0 ? (
        <div className={styles.emptyState}>
          <RefreshCw size={36} />
          <h3>No transfers found</h3>
          <p>
            {searchTerm || statusFilter !== 'all'
              ? 'Try adjusting your filters.'
              : canCreate
              ? 'Create the first transfer to move stock between branches.'
              : 'No transfers involving this branch yet.'}
          </p>
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Route</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Date</th>
                <th>By</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredTransfers.map((t) => {
                const from = t.sourceBranchProduct?.branch?.code || '—';
                const to = t.destBranchProduct?.branch?.code || '—';
                const product =
                  t.sourceBranchProduct?.displayName ||
                  t.sourceBranchProduct?.product?.name ||
                  '—';
                const qty = parseInt(t.quantitySent, 10) || 0;

                return (
                  <tr key={t.id} className={styles.tableRow}>
                    <td className={styles.refCell}>{t.reference}</td>
                    <td>
                      <div className={styles.pathCell}>
                        <span className={styles.branchCode}>{from}</span>
                        <ArrowRight
                          size={12}
                          className={styles.pathArrow}
                        />
                        <span className={styles.branchCode}>{to}</span>
                      </div>
                    </td>
                    <td className={styles.productCell}>{product}</td>
                    <td className={styles.qtyCell}>{qty}</td>
                    <td>{formatDate(t.createdAt)}</td>
                    <td className={styles.userCell}>
                      {getDisplayName(t.initiatedBy)}
                    </td>
                    <td>
                      <TransferStatusBadge status={t.status} />
                    </td>
                    <td>
                      <button
                        className={styles.rowActionBtn}
                        onClick={() => openDetail(t)}
                        title="View details"
                        type="button"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      <NewTransferModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreate={handleCreate}
        orgId={orgId}
        activeBranch={activeBranch}
      />

      <TransferDetailModal
        isOpen={showDetailModal}
        onClose={closeDetail}
        transfer={selectedTransfer}
        actionLoading={actionLoading}
        canApprove={canApprove}
        canReject={canReject}
        canComplete={canComplete}
        onApprove={handleApprove}
        onReject={handleReject}
        onComplete={handleComplete}
      />
    </div>
  );
};

export default Transfers;