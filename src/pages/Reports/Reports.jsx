// Products/kxtill/src/pages/Reports/Reports.jsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  FileText,
  TrendingUp,
  Package,
  Building2,
  DollarSign,
  AlertCircle,
  Shield,
  ClipboardList,
  Award,
  ChevronDown,
  Check,
} from 'lucide-react';
import ExportsView from './components/ExportsView';
import TopProductsView from './components/TopProductsView';
import styles from './Reports.module.css';

// ============================================================
// REPORT CATALOG
// ============================================================
const REPORT_OPTIONS = [
  {
    id: 'sales',
    label: 'Sales Report',
    icon: TrendingUp,
    description: 'Sales transactions with date range filter',
    endpoint: '/reports/export/sales',
  },
  {
    id: 'stock',
    label: 'Stock Report',
    icon: Package,
    description: 'Current inventory levels and stock status',
    endpoint: '/reports/export/stock',
  },
  {
    id: 'top-products',
    label: 'Top Products',
    icon: FileText,
    description: 'Best selling products by revenue and quantity',
    endpoint: '/reports/export/top-products',
  },
  {
    id: 'branches',
    label: 'Branch Performance',
    icon: Building2,
    description: 'Sales performance by branch',
    endpoint: '/reports/export/branches',
    requiresOwner: true,
  },
  {
    id: 'tax',
    label: 'Tax Report',
    icon: DollarSign,
    description: 'Tax collected and tax summary',
    endpoint: '/reports/export/tax',
    requiresOwner: true,
    disabled: true,
    comingSoon: true,
  },
  {
    id: 'audit',
    label: 'Audit Log',
    icon: ClipboardList,
    description: 'User activity and system events',
    endpoint: '/reports/export/audit',
    requiresOwner: true,
  },
];

const TABS = [
  { id: 'exports', label: 'Exports', icon: FileText },
  { id: 'top-products', label: 'Top Products', icon: Award },
];

// ============================================================
// MAIN
// ============================================================
const Reports = () => {
  const {
    activeOrganization,
    activeBranch,
    setActiveBranch,
    branches,
  } = useAuth();
  const { can, isOwner } = usePermissions();

  const orgId = activeOrganization?.id;
  const branchId = activeBranch?.id;

  const canViewReports = isOwner || can('kxtill.reports.view');

  const [activeTab, setActiveTab] = useState('exports');
  const [exporting, setExporting] = useState(null);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const branchMenuRef = useRef(null);

  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  });

  const visibleReports = useMemo(
    () =>
      REPORT_OPTIONS.filter(
        (r) => !(r.requiresOwner && !isOwner)
      ),
    [isOwner]
  );

  const contextName = activeBranch?.name || 'All Branches';

  // close branch menu on outside click
  useEffect(() => {
    if (!branchMenuOpen) return;
    const handleClick = (e) => {
      if (branchMenuRef.current && !branchMenuRef.current.contains(e.target)) {
        setBranchMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [branchMenuOpen]);

  const handleDateChange = (field, value) =>
    setDateRange((prev) => ({ ...prev, [field]: value }));

  const handleSelectBranch = async (branch) => {
    setBranchMenuOpen(false);
    try {
      await setActiveBranch(branch);
    } catch (err) {
      console.error('Failed to switch branch:', err);
      toast.error('Failed to switch branch');
    }
  };

  const handleExport = async (reportId, endpoint, format) => {
    const report = REPORT_OPTIONS.find((r) => r.id === reportId);

    if (report?.disabled) {
      toast.error(`${report.label} is coming soon!`);
      return;
    }

    if (!orgId) {
      toast.error('Organization not found. Please select an organization.');
      return;
    }

    setExporting(`${reportId}-${format}`);

    try {
      const params = {
        startDate: dateRange.start,
        endDate: dateRange.end,
        format,
      };
      if (branchId) params.branchId = branchId;

      const response = await axios.get(
        `/organizations/${orgId}/kxtill${endpoint}`,
        { params, responseType: 'blob', timeout: 30000 }
      );

      const blob = new Blob([response.data], {
        type: format === 'csv' ? 'text/csv' : 'application/pdf',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const reportName = report?.label || reportId;
      link.download = `${reportName.replace(
        /\s/g,
        '_'
      )}_${dateRange.start}_to_${dateRange.end}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(
        `${reportName} exported successfully as ${format.toUpperCase()}!`
      );
    } catch (err) {
      console.error(`Failed to export ${reportId}:`, err);

      let message = 'Failed to export report. Please try again.';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          message = parsed.error || parsed.message || message;
        } catch {
          /* ignore */
        }
      } else if (err.response?.data?.error) {
        message = err.response.data.error;
      }
      toast.error(message);
    } finally {
      setExporting(null);
    }
  };

  // ---------- guards ----------
  if (!canViewReports) {
    return (
      <div className={styles.page}>
        <div className={styles.noAccess}>
          <Shield size={48} className={styles.noAccessIcon} />
          <h2>Access Denied</h2>
          <p>You don't have permission to view reports.</p>
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

  return (
    <div className={styles.page}>
      {/* ===== HERO ===== */}
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.heroIcon}>
            <FileText size={22} />
          </div>
          <div className={styles.heroTitle}>
            <h1>Reports</h1>
            <p>
              <span className={styles.heroOrg}>
                {activeOrganization?.name}
              </span>
              <span className={styles.heroSep}>·</span>
              <span className={styles.heroStat}>{contextName}</span>
            </p>
          </div>
        </div>
        <div className={styles.heroRight}>
          <div className={styles.tabs}>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`${styles.tab} ${
                    activeTab === tab.id ? styles.tabActive : ''
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== FILTER BAR ===== */}
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>From</label>
          <input
            type="date"
            className={styles.dateInput}
            value={dateRange.start}
            max={dateRange.end}
            onChange={(e) => handleDateChange('start', e.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>To</label>
          <input
            type="date"
            className={styles.dateInput}
            value={dateRange.end}
            min={dateRange.start}
            onChange={(e) => handleDateChange('end', e.target.value)}
          />
        </div>

        <div className={styles.filterDivider} />

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Branch</label>
          <div className={styles.branchSelectorWrap} ref={branchMenuRef}>
            <button
              type="button"
              className={styles.branchSelector}
              onClick={() => setBranchMenuOpen((o) => !o)}
            >
              <Building2 size={14} />
              <span className={styles.branchSelectorText}>
                {contextName}
              </span>
              <ChevronDown
                size={12}
                className={branchMenuOpen ? styles.chevronOpen : ''}
              />
            </button>

            {branchMenuOpen && (
              <div className={styles.branchMenu}>
                <button
                  type="button"
                  className={`${styles.branchMenuItem} ${
                    !activeBranch ? styles.branchMenuItemActive : ''
                  }`}
                  onClick={() => handleSelectBranch(null)}
                >
                  <span>All Branches</span>
                  {!activeBranch && <Check size={14} />}
                </button>
                {branches.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`${styles.branchMenuItem} ${
                      b.id === activeBranch?.id
                        ? styles.branchMenuItemActive
                        : ''
                    }`}
                    onClick={() => handleSelectBranch(b)}
                  >
                    <span>{b.name}</span>
                    {b.id === activeBranch?.id && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== TAB CONTENT ===== */}
      {activeTab === 'exports' && (
        <ExportsView
          reports={visibleReports}
          exporting={exporting}
          onExport={handleExport}
        />
      )}

      {activeTab === 'top-products' && (
        <TopProductsView
          orgId={orgId}
          branchId={branchId}
          dateRange={dateRange}
        />
      )}
    </div>
  );
};

export default Reports;