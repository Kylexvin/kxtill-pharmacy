// Products/kxtill/src/pages/Reports/Reports.jsx
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useSettings } from '../../contexts/SettingsContext';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  FileText,
  ChevronDown,
  FileSpreadsheet,
  File,
  TrendingUp,
  Package,
  Building2,
  DollarSign,
  AlertCircle,
  Shield,
  ClipboardList,
  Check,
  RefreshCw,
  Award,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import styles from './Reports.module.css';

// ============================================================
// REPORT CATALOG (export cards)
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

// ============================================================
// TABS
// ============================================================
const TABS = [
  { id: 'exports', label: 'Exports', icon: FileText },
  { id: 'top-products', label: 'Top Products', icon: Award },
];

// ============================================================
// CHART TOOLTIP
// ============================================================
const ChartTooltip = ({ active, payload, label, currency, formatCurrency }) => {
  if (!active || !payload || !payload.length) return null;
  const value = payload[0].value;
  return (
    <div className={styles.chartTooltip}>
      <div className={styles.chartTooltipLabel}>{label}</div>
      <div className={styles.chartTooltipValue}>
        {typeof formatCurrency === 'function'
          ? formatCurrency(value)
          : `${currency} ${Number(value).toLocaleString()}`}
      </div>
    </div>
  );
};

// ============================================================
// TOP PRODUCTS VIEW
// ============================================================
const TopProductsView = ({ orgId, branchId, dateRange }) => {
  const { formatCurrency, formatCompactCurrency } = useSettings();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isMountedRef = useRef(true);
  const fetchControllerRef = useRef(null);

  const fetchTopProducts = useCallback(async () => {
    if (!orgId) return;

    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    setError(null);

    try {
      const params = {
        startDate: dateRange.start,
        endDate: dateRange.end,
        limit: 20,
      };
      if (branchId) params.branchId = branchId;

      const res = await axios.get(
        `/organizations/${orgId}/kxtill/dashboard/top-products`,
        { params, signal: controller.signal, timeout: 15000 }
      );

      if (controller.signal.aborted || !isMountedRef.current) return;

      const data = res.data;
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.products)
        ? data.products
        : Array.isArray(data?.data)
        ? data.data
        : [];

      setProducts(list);
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      console.error('Failed to fetch top products:', err);
      if (isMountedRef.current) {
        setError(
          err.response?.data?.error ||
            err.response?.data?.message ||
            'Failed to load top products'
        );
      }
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [orgId, branchId, dateRange.start, dateRange.end]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      fetchControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!orgId) return;
    fetchTopProducts();
  }, [orgId, fetchTopProducts]);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetchTopProducts();
      toast.success('Refreshed');
    } catch {
      toast.error('Failed to refresh');
    } finally {
      if (isMountedRef.current) setIsRefreshing(false);
    }
  };

  const chartData = products.map((p) => ({
    name: p.sku || p.name,
    fullName: p.name,
    total: p.total || 0,
    quantity: p.quantity || 0,
  }));

  const totalRevenue = products.reduce((sum, p) => sum + (p.total || 0), 0);
  const totalQuantity = products.reduce(
    (sum, p) => sum + (p.quantity || 0),
    0
  );

  if (loading) {
    return (
      <div className={styles.tabLoading}>
        <div className={styles.loader} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.tabError}>
        <AlertCircle size={32} className={styles.tabErrorIcon} />
        <p>{error}</p>
        <button onClick={fetchTopProducts} type="button" className={styles.retryBtn}>
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className={styles.tabEmpty}>
        <Award size={48} className={styles.tabEmptyIcon} />
        <h3>No product data</h3>
        <p>Complete a few sales to see your best-selling products here.</p>
      </div>
    );
  }

  return (
    <div className={styles.productsView}>
      {/* Summary row */}
      <div className={styles.productsSummary}>
        <div className={styles.summaryTile}>
          <div className={styles.summaryTileLabel}>Products</div>
          <div className={styles.summaryTileValue}>{products.length}</div>
        </div>
        <div className={styles.summaryTile}>
          <div className={styles.summaryTileLabel}>Units Sold</div>
          <div className={styles.summaryTileValue}>{totalQuantity}</div>
        </div>
        <div className={styles.summaryTile}>
          <div className={styles.summaryTileLabel}>Total Revenue</div>
          <div className={styles.summaryTileValue}>
            {formatCompactCurrency(totalRevenue)}
          </div>
        </div>
        <div className={styles.summaryTileActions}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              size={14}
              className={isRefreshing ? styles.spinning : ''}
            />
            {isRefreshing ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className={styles.chartCard}>
        <div className={styles.chartCardHeader}>
          <h3 className={styles.chartCardTitle}>
            <TrendingUp size={14} />
            Revenue by Product
          </h3>
          <span className={styles.chartCardSubtitle}>
            Top {products.length}
          </span>
        </div>
        <div className={styles.chartCardBody}>
          <ResponsiveContainer width="100%" height={Math.max(260, products.length * 32)}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                horizontal={false}
              />
              <XAxis
                type="number"
                tickFormatter={formatCompactCurrency}
                tick={{ fill: 'var(--text-faint)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,106,43,0.06)' }}
                content={
                  <ChartTooltip
                    currency="KES"
                    formatCurrency={formatCurrency}
                  />
                }
              />
              <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      index === 0
                        ? 'var(--accent)'
                        : 'rgba(255, 106, 43, 0.55)'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className={styles.productsTableCard}>
        <div className={styles.productsTableHeader}>
          <span className={styles.colRank}>#</span>
          <span className={styles.colName}>Product</span>
          <span className={styles.colSku}>SKU</span>
          <span className={styles.colQty}>Qty</span>
          <span className={styles.colTotal}>Revenue</span>
        </div>
        <div className={styles.productsTableBody}>
          {products.map((p, index) => (
            <div key={p.productId || index} className={styles.productsTableRow}>
              <span className={styles.colRank}>
                <span
                  className={`${styles.rankBadge} ${
                    index === 0 ? styles.rankBadgeTop : ''
                  }`}
                >
                  {index + 1}
                </span>
              </span>
              <span className={styles.colName}>
                <span className={styles.productNameText}>
                  {p.name || 'Unknown'}
                </span>
              </span>
              <span className={styles.colSku}>
                <span className={styles.skuText}>{p.sku || '—'}</span>
              </span>
              <span className={styles.colQty}>{p.quantity || 0}</span>
              <span className={styles.colTotal}>
                {formatCurrency(p.total || 0)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MAIN PAGE
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

  const visibleReports = useMemo(() => {
    return REPORT_OPTIONS.filter((report) => {
      if (report.requiresOwner && !isOwner) return false;
      return true;
    });
  }, [isOwner]);

  const contextName = activeBranch?.name || 'All Branches';

  useEffect(() => {
    if (!branchMenuOpen) return;
    const handleClick = (e) => {
      if (
        branchMenuRef.current &&
        !branchMenuRef.current.contains(e.target)
      ) {
        setBranchMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [branchMenuOpen]);

  const handleDateChange = (field, value) => {
    setDateRange((prev) => ({ ...prev, [field]: value }));
  };

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
        {
          params,
          responseType: 'blob',
          timeout: 30000,
        }
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
      {/* ===== HEADER ===== */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <FileText size={20} />
          </div>
          <div>
            <h1 className={styles.title}>Reports</h1>
            <p className={styles.subtitle}>
              Analytics & exports for {contextName} · {activeOrganization?.name}
            </p>
          </div>
        </div>
      </div>

      {/* ===== TABS ===== */}
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
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ===== FILTERS ===== */}
      <div className={styles.filtersCard}>
        <div className={styles.filtersRow}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Date Range</label>
            <div className={styles.dateRange}>
              <input
                type="date"
                className={styles.dateInput}
                value={dateRange.start}
                max={dateRange.end}
                onChange={(e) => handleDateChange('start', e.target.value)}
              />
              <span className={styles.dateSeparator}>to</span>
              <input
                type="date"
                className={styles.dateInput}
                value={dateRange.end}
                min={dateRange.start}
                onChange={(e) => handleDateChange('end', e.target.value)}
              />
            </div>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Branch</label>
            <div className={styles.branchSelectorWrap} ref={branchMenuRef}>
              <button
                type="button"
                className={styles.branchSelector}
                onClick={() => setBranchMenuOpen((o) => !o)}
              >
                <Building2 size={14} />
                <span>{contextName}</span>
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
      </div>

      {/* ===== TAB CONTENT ===== */}
      {activeTab === 'exports' && (
        <>
          <div className={styles.reportsGrid}>
            {visibleReports.map((report) => {
              const Icon = report.icon;
              const isCsvExporting = exporting === `${report.id}-csv`;
              const isPdfExporting = exporting === `${report.id}-pdf`;
              const isAnyExporting = isCsvExporting || isPdfExporting;
              const isDisabled = report.disabled;

              return (
                <div
                  key={report.id}
                  className={`${styles.reportCard} ${
                    isDisabled ? styles.reportCardDisabled : ''
                  }`}
                >
                  <div className={styles.reportCardHeader}>
                    <div
                      className={`${styles.reportIcon} ${
                        isDisabled ? styles.reportIconDisabled : ''
                      }`}
                    >
                      <Icon size={20} />
                    </div>
                    <div className={styles.reportTitleWrap}>
                      <h3 className={styles.reportTitle}>
                        {report.label}
                        {report.comingSoon && (
                          <span className={styles.comingSoonBadge}>
                            Coming Soon
                          </span>
                        )}
                      </h3>
                      <p className={styles.reportDescription}>
                        {report.description}
                      </p>
                    </div>
                  </div>

                  <div className={styles.reportActions}>
                    <button
                      type="button"
                      className={`${styles.exportBtn} ${styles.exportBtnCsv} ${
                        isDisabled ? styles.exportBtnDisabled : ''
                      }`}
                      onClick={() =>
                        handleExport(report.id, report.endpoint, 'csv')
                      }
                      disabled={isAnyExporting || isDisabled}
                    >
                      {isCsvExporting ? (
                        <span className={styles.spinnerSmall} />
                      ) : (
                        <FileSpreadsheet size={14} />
                      )}
                      CSV
                    </button>

                    <button
                      type="button"
                      className={`${styles.exportBtn} ${styles.exportBtnPdf} ${
                        isDisabled ? styles.exportBtnDisabled : ''
                      }`}
                      onClick={() =>
                        handleExport(report.id, report.endpoint, 'pdf')
                      }
                      disabled={isAnyExporting || isDisabled}
                    >
                      {isPdfExporting ? (
                        <span className={styles.spinnerSmall} />
                      ) : (
                        <File size={14} />
                      )}
                      PDF
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.footerNote}>
            <div className={styles.footerNoteIcon}>
              <AlertCircle size={16} />
            </div>
            <div className={styles.footerNoteText}>
              <strong>Reports are export-only.</strong> For viewing sales,
              inventory, and performance data, visit the{' '}
              <span className={styles.footerNoteLink}>Overview</span> or{' '}
              <span className={styles.footerNoteLink}>Sales</span> dashboard.
            </div>
          </div>
        </>
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