// Products/kxtill/src/pages/Branches/Branches.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useSettings } from '../../contexts/SettingsContext';
import toast from 'react-hot-toast';
import axios from 'axios';
import { Shield, RefreshCw, AlertCircle } from 'lucide-react';
import BranchesList from './components/BranchesList';
import BranchDrawer from './components/BranchDrawer';
import styles from './Branches.module.css';

const SUITE_URL = 'https://suite.kxbyte.co.ke';

const Branches = () => {
  const { activeOrganization } = useAuth();
  const { can, isOwner } = usePermissions();
  const { formatCurrency: fmtCurrency, formatDateTime } = useSettings();

  const canView = isOwner || can('branches.view') || can('branches.manage');
  const canManage = isOwner || can('branches.manage');
  const orgId = activeOrganization?.id;

  const formatCurrency = useCallback(
    (value) => {
      if (value == null) return '—';
      return fmtCurrency(Number(value));
    },
    [fmtCurrency]
  );

  const [branches, setBranches] = useState([]);
  const [totals, setTotals] = useState({
    branches: 0,
    activeBranches: 0,
    totalStock: 0,
    totalLowStock: 0,
    totalSalesToday: 0,
    totalSalesThisMonth: 0,
    totalProducts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [openingSuite, setOpeningSuite] = useState(false);

  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState(null);

  const isMountedRef = useRef(true);
  const fetchControllerRef = useRef(null);
  const overviewControllerRef = useRef(null);

  // ---------- fetch branches ----------
  const fetchBranches = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;
    setError(null);

    try {
      const res = await axios.get(`/organizations/${orgId}/kxtill/branches`, {
        signal: controller.signal,
        timeout: 10000,
      });
      if (controller.signal.aborted || !isMountedRef.current) return;

      setBranches(res.data?.branches || []);
      setTotals(
        res.data?.totals || {
          branches: 0,
          activeBranches: 0,
          totalStock: 0,
          totalLowStock: 0,
          totalSalesToday: 0,
          totalSalesThisMonth: 0,
          totalProducts: 0,
        }
      );
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      console.error('Failed to fetch branches:', err);
      if (isMountedRef.current) {
        setError(
          err.response?.data?.error ||
            err.response?.data?.message ||
            'Failed to load branches'
        );
      }
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [orgId]);

  // ---------- fetch overview ----------
  const fetchOverview = useCallback(
    async (branchId) => {
      if (!orgId || !branchId) return;
      overviewControllerRef.current?.abort();
      const controller = new AbortController();
      overviewControllerRef.current = controller;

      setOverviewLoading(true);
      setOverviewError(null);
      setOverview(null);

      try {
        const res = await axios.get(
          `/organizations/${orgId}/kxtill/branches/${branchId}`,
          { signal: controller.signal, timeout: 10000 }
        );
        if (controller.signal.aborted || !isMountedRef.current) return;
        setOverview(res.data);
      } catch (err) {
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        console.error('Failed to fetch branch overview:', err);
        if (isMountedRef.current) {
          setOverviewError(
            err.response?.data?.error ||
              err.response?.data?.message ||
              'Failed to load branch overview'
          );
        }
      } finally {
        if (isMountedRef.current && !controller.signal.aborted) {
          setOverviewLoading(false);
        }
      }
    },
    [orgId]
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      fetchControllerRef.current?.abort();
      overviewControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!orgId) return;
    fetchBranches();
  }, [orgId, fetchBranches]);

  useEffect(() => {
    if (selectedBranchId) fetchOverview(selectedBranchId);
    else {
      setOverview(null);
      setOverviewError(null);
    }
  }, [selectedBranchId, fetchOverview]);

  // ---------- handlers ----------
  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      if (selectedBranchId) await fetchOverview(selectedBranchId);
      else await fetchBranches();
      toast.success('Refreshed');
    } catch {
      toast.error('Failed to refresh');
    } finally {
      if (isMountedRef.current) setIsRefreshing(false);
    }
  };

  const handleSelectBranch = (id) => {
    setSelectedBranchId(id);
    setSearchQuery('');
  };

  const handleCloseDrawer = () => {
    setSelectedBranchId(null);
    setOverview(null);
    setOverviewError(null);
  };

  const handleOpenSuite = async () => {
    if (openingSuite) return;
    setOpeningSuite(true);
    try {
      const { data } = await axios.post('/auth/sso/mint', { target: 'suite' });
      const ssoUrl = `${SUITE_URL}/sso?code=${encodeURIComponent(data.code)}`;
      window.open(ssoUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Failed to open Suite:', err);
      toast.error('Failed to open Suite. Please try again.');
    } finally {
      if (isMountedRef.current) setOpeningSuite(false);
    }
  };

  // ---------- guards ----------
  if (!canView) {
    return (
      <div className={styles.page}>
        <div className={styles.noAccess}>
          <Shield size={48} className={styles.noAccessIcon} />
          <h2>Access Denied</h2>
          <p>You don't have permission to view branches.</p>
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

  if (loading && branches.length === 0) {
    return <BranchesList loading />;
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <AlertCircle size={32} className={styles.errorIcon} />
          <p className={styles.errorText}>{error}</p>
          <button className={styles.retryBtn} onClick={fetchBranches}>
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ---------- render ----------
  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  return (
    <div className={styles.page}>
      <BranchesList
        branches={branches}
        totals={totals}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        canManage={canManage}
        openingSuite={openingSuite}
        isRefreshing={isRefreshing}
        onOpenSuite={handleOpenSuite}
        onSelectBranch={handleSelectBranch}
        onRefresh={handleRefresh}
        formatCurrency={formatCurrency}
        organizationName={activeOrganization?.name}
      />

      <BranchDrawer
        isOpen={!!selectedBranchId}
        branch={selectedBranch}
        overview={overview}
        loading={overviewLoading}
        error={overviewError}
        onClose={handleCloseDrawer}
        onRetry={() => fetchOverview(selectedBranchId)}
        formatCurrency={formatCurrency}
        formatDateTime={formatDateTime}
      />
    </div>
  );
};

export default Branches;