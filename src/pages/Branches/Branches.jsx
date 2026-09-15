// Products/kxtill/src/pages/Branches/Branches.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
// import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useSettings } from '../../contexts/SettingsContext';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  Building2,
  Search,
  Shield,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Crown,
  Package,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  ChevronRight,
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
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
import styles from './Branches.module.css';

// ============================================================
// HELPERS
// ============================================================

const formatCurrency = (value, currency = 'KES') => {
  if (value == null) return '—';
  return `${currency} ${Number(value).toLocaleString('en-KE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

const formatCompact = (value) => {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

// ============================================================
// SUB-COMPONENTS
// ============================================================

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

const DefaultBadge = () => (
  <span className={styles.defaultBadge}>
    <Crown size={10} />
    Default
  </span>
);

const StatCard = ({ icon: Icon, label, value, variant }) => (
  <div className={`${styles.statCard} ${variant ? styles[variant] : ''}`}>
    <div className={styles.statIcon}>
      <Icon size={16} />
    </div>
    <div className={styles.statValue}>{value}</div>
    <div className={styles.statLabel}>{label}</div>
  </div>
);

const ChartTooltip = ({ active, payload, label, currency }) => {
  if (!active || !payload || !payload.length) return null;
  const value = payload[0].value;
  return (
    <div className={styles.chartTooltip}>
      <div className={styles.chartTooltipLabel}>{label}</div>
      <div className={styles.chartTooltipValue}>
        {formatCurrency(value, currency)}
      </div>
    </div>
  );
};

// ============================================================
// MAIN PAGE
// ============================================================

const Branches = () => {
 
  const { activeOrganization } = useAuth();
  const { can, isOwner } = usePermissions();
  const { formatDateTime } = useSettings();

  const canView = isOwner || can('branches.view') || can('branches.manage');

  const orgId = activeOrganization?.id;
  const currency = activeOrganization?.currency || 'KES';

  // ---------- list state ----------
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

  // ---------- drill-down state ----------
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState(null);

  const isMountedRef = useRef(true);
  const fetchControllerRef = useRef(null);
  const overviewControllerRef = useRef(null);

  // ============================================================
  // FETCH: BRANCH LIST
  // ============================================================
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
      const res = await axios.get(
        `/organizations/${orgId}/kxtill/branches`,
        { signal: controller.signal, timeout: 10000 }
      );

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

  // ============================================================
  // FETCH: BRANCH OVERVIEW (DRILL-DOWN)
  // ============================================================
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

  // ============================================================
  // EFFECTS
  // ============================================================
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
    if (selectedBranchId) {
      fetchOverview(selectedBranchId);
    } else {
      setOverview(null);
      setOverviewError(null);
    }
  }, [selectedBranchId, fetchOverview]);

  // ============================================================
  // HANDLERS
  // ============================================================
  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      if (selectedBranchId) {
        await fetchOverview(selectedBranchId);
      } else {
        await fetchBranches();
      }
      toast.success('Refreshed');
    } catch {
      toast.error('Failed to refresh');
    } finally {
      if (isMountedRef.current) setIsRefreshing(false);
    }
  };

  const handleSelectBranch = (branchId) => {
    setSelectedBranchId(branchId);
    setSearchQuery('');
  };

  const handleBackToList = () => {
    setSelectedBranchId(null);
    setOverview(null);
    setOverviewError(null);
  };

  // ============================================================
  // DERIVED
  // ============================================================
  const filteredBranches = branches.filter((branch) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = (branch.name || '').toLowerCase();
    const code = (branch.code || '').toLowerCase();
    return name.includes(q) || code.includes(q);
  });

  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  // Chart data: sales this month per branch
  const chartData = branches.map((b) => ({
    name: b.code || b.name,
    fullName: b.name,
    sales: b.stats?.salesThisMonth || 0,
    isActive: b.isActive,
  }));

  const maxSalesBranch = chartData.reduce(
    (max, d) => (d.sales > (max?.sales || 0) ? d : max),
    null
  );

  // ============================================================
  // GUARDS
  // ============================================================
  if (!canView) {
    return (
      <div className={styles.page}>
        <div className={styles.noAccess}>
          <Shield size={48} className={styles.noAccessIcon} />
          <h2>Access Denied</h2>
          <p>You don't have permission to view branches.</p>
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
          <button className={styles.retryBtn} onClick={fetchBranches}>
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER: DRILL-DOWN VIEW
  // ============================================================
  if (selectedBranchId) {
    return (
      <div className={styles.page}>
        {/* Header with back */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <button
              className={styles.backBtn}
              onClick={handleBackToList}
              title="Back to branches"
            >
              <ArrowLeft size={16} />
            </button>
            <div className={styles.headerIcon}>
              <Building2 size={20} />
            </div>
            <div>
              <h1 className={styles.title}>
                {selectedBranch?.name || 'Branch'}
              </h1>
              <p className={styles.subtitle}>
                {selectedBranch?.code && (
                  <span className={styles.branchCode}>
                    {selectedBranch.code}
                  </span>
                )}
                {selectedBranch?.isDefault && <DefaultBadge />}
                <span>{activeOrganization?.name}</span>
              </p>
            </div>
          </div>
          <div className={styles.headerRight}>
            <button
              className={styles.refreshBtn}
              onClick={handleRefresh}
              disabled={isRefreshing || overviewLoading}
            >
              <RefreshCw
                size={14}
                className={
                  isRefreshing || overviewLoading ? styles.spinning : ''
                }
              />
              {isRefreshing || overviewLoading ? '...' : 'Refresh'}
            </button>
          </div>
        </div>

        {overviewLoading ? (
          <div className={styles.loaderWrapper}>
            <div className={styles.loader} />
          </div>
        ) : overviewError ? (
          <div className={styles.errorState}>
            <AlertCircle size={32} className={styles.errorIcon} />
            <p className={styles.errorText}>{overviewError}</p>
            <button
              className={styles.retryBtn}
              onClick={() => fetchOverview(selectedBranchId)}
            >
              <RefreshCw size={16} />
              Retry
            </button>
          </div>
        ) : overview ? (
          <>
            {/* Summary stats */}
            <div className={styles.statsGrid}>
              <StatCard
                icon={Package}
                label="Total Products"
                value={overview.summary?.totalProducts ?? 0}
              />
              <StatCard
                icon={Package}
                label="Total Stock"
                value={overview.summary?.totalStock ?? 0}
              />
              <StatCard
                icon={AlertTriangle}
                label="Low Stock"
                value={overview.summary?.lowStockCount ?? 0}
                variant={
                  overview.summary?.lowStockCount > 0
                    ? 'statCardWarning'
                    : ''
                }
              />
              <StatCard
                icon={ShoppingCart}
                label="Sales Today"
                value={overview.summary?.salesTodayCount ?? 0}
              />
              <StatCard
                icon={DollarSign}
                label="Revenue Today"
                value={formatCurrency(overview.summary?.salesToday, currency)}
              />
            </div>

            {/* Branch info */}
            {overview.branch &&
              (overview.branch.address ||
                overview.branch.phone ||
                overview.branch.email) && (
                <div className={styles.infoCard}>
                  <div className={styles.infoGrid}>
                    {overview.branch.address && (
                      <div className={styles.infoItem}>
                        <MapPin size={14} className={styles.infoIcon} />
                        <span>{overview.branch.address}</span>
                      </div>
                    )}
                    {overview.branch.phone && (
                      <div className={styles.infoItem}>
                        <Phone size={14} className={styles.infoIcon} />
                        <span>{overview.branch.phone}</span>
                      </div>
                    )}
                    {overview.branch.email && (
                      <div className={styles.infoItem}>
                        <Mail size={14} className={styles.infoIcon} />
                        <span>{overview.branch.email}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

            {/* Top products chart */}
            {overview.topProducts?.length > 0 && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>
                    <TrendingUp size={14} />
                    Top Products by Revenue
                  </h3>
                  <span className={styles.cardCount}>
                    {overview.topProducts.length}
                  </span>
                </div>
                <div className={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={overview.topProducts.map((p) => ({
                        name: p.sku || p.name,
                        fullName: p.name,
                        total: p.total,
                      }))}
                      margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: 'var(--text-faint)', fontSize: 11 }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={formatCompact}
                        tick={{ fill: 'var(--text-faint)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={48}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(255,106,43,0.06)' }}
                        content={<ChartTooltip currency={currency} />}
                      />
                      <Bar
                        dataKey="total"
                        radius={[6, 6, 0, 0]}
                        fill="var(--accent)"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Two-column: Low stock + Recent sales */}
            <div className={styles.twoCol}>
              {/* Low stock */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>
                    <AlertTriangle size={14} />
                    Low Stock Items
                  </h3>
                  <span className={styles.cardCount}>
                    {overview.lowStockItems?.length || 0}
                  </span>
                </div>
                {overview.lowStockItems?.length > 0 ? (
                  <div className={styles.listBody}>
                    {overview.lowStockItems.map((item) => (
                      <div key={item.productId} className={styles.listRow}>
                        <div className={styles.listRowMain}>
                          <div className={styles.listRowName}>{item.name}</div>
                          <div className={styles.listRowSub}>{item.sku}</div>
                        </div>
                        <div className={styles.listRowRight}>
                          <span className={styles.stockLow}>{item.stock}</span>
                          <span className={styles.stockMin}>
                            / {item.minStock}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptySmall}>
                    <CheckCircle size={20} />
                    <span>All stock levels healthy</span>
                  </div>
                )}
              </div>

              {/* Recent sales */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>
                    <ShoppingCart size={14} />
                    Recent Sales
                  </h3>
                  <span className={styles.cardCount}>
                    {overview.recentSales?.length || 0}
                  </span>
                </div>
                {overview.recentSales?.length > 0 ? (
                  <div className={styles.listBody}>
                    {overview.recentSales.map((sale) => (
                      <div key={sale.id} className={styles.listRow}>
                        <div className={styles.listRowMain}>
                          <div className={styles.listRowName}>
                            {sale.reference}
                          </div>
                          <div className={styles.listRowSub}>
                            {sale.customerName} · {sale.itemsCount} item
                            {sale.itemsCount !== 1 ? 's' : ''} · {sale.user}
                          </div>
                        </div>
                        <div className={styles.listRowRight}>
                          <span className={styles.saleTotal}>
                            {formatCurrency(sale.total, currency)}
                          </span>
                          <span className={styles.saleTime}>
                            {formatDateTime(sale.createdAt)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptySmall}>
                    <ShoppingCart size={20} />
                    <span>No sales yet</span>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  // ============================================================
  // RENDER: LIST VIEW
  // ============================================================
  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <Building2 size={20} />
          </div>
          <div>
            <h1 className={styles.title}>Branches</h1>
            <p className={styles.subtitle}>
              {activeOrganization?.name || 'Organization'} ·{' '}
              {totals.activeBranches}/{totals.branches} active
            </p>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button
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

      {/* Totals stats */}
      <div className={styles.statsGrid}>
        <StatCard
          icon={Building2}
          label="Total Branches"
          value={totals.branches}
        />
        <StatCard
          icon={CheckCircle}
          label="Active"
          value={totals.activeBranches}
          variant="statCardActive"
        />
        <StatCard
          icon={Package}
          label="Total Stock"
          value={totals.totalStock}
        />
        <StatCard
          icon={AlertTriangle}
          label="Low Stock"
          value={totals.totalLowStock}
          variant={totals.totalLowStock > 0 ? 'statCardWarning' : ''}
        />
        <StatCard
          icon={DollarSign}
          label="Sales Today"
          value={formatCurrency(totals.totalSalesToday, currency)}
        />
        <StatCard
          icon={TrendingUp}
          label="Sales This Month"
          value={formatCurrency(totals.totalSalesThisMonth, currency)}
        />
      </div>

      {/* Sales comparison chart */}
      {branches.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              <TrendingUp size={14} />
              Sales This Month by Branch
            </h3>
            {maxSalesBranch && (
              <span className={styles.cardHint}>
                Top: {maxSalesBranch.name}
              </span>
            )}
          </div>
          <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'var(--text-faint)', fontSize: 11 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatCompact}
                  tick={{ fill: 'var(--text-faint)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,106,43,0.06)' }}
                  content={<ChartTooltip currency={currency} />}
                />
                <Bar dataKey="sales" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.isActive
                          ? 'var(--accent)'
                          : 'var(--border-strong)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Search */}
      <div className={styles.filtersBar}>
        <div className={styles.searchWrap}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search branches by name or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Branch grid */}
      {filteredBranches.length === 0 ? (
        <div className={styles.emptyState}>
          <Building2 size={48} className={styles.emptyIcon} />
          <h3>No branches found</h3>
          <p>
            {searchQuery
              ? 'Try adjusting your search'
              : 'No branches have been created yet.'}
          </p>
        </div>
      ) : (
        <div className={styles.branchGrid}>
          {filteredBranches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              className={styles.branchCard}
              onClick={() => handleSelectBranch(branch.id)}
            >
              <div className={styles.branchCardHeader}>
                <div className={styles.branchCardIcon}>
                  <Building2 size={18} />
                </div>
                <div className={styles.branchCardTitleWrap}>
                  <div className={styles.branchCardName}>
                    {branch.name}
                    {branch.isDefault && <DefaultBadge />}
                  </div>
                  <div className={styles.branchCardCode}>{branch.code}</div>
                </div>
                <ChevronRight size={16} className={styles.branchCardArrow} />
              </div>

              <div className={styles.branchCardStatus}>
                <StatusBadge isActive={branch.isActive} />
              </div>

              <div className={styles.branchStats}>
                <div className={styles.branchStat}>
                  <Package size={12} />
                  <span className={styles.branchStatValue}>
                    {branch.stats?.stock ?? 0}
                  </span>
                  <span className={styles.branchStatLabel}>stock</span>
                </div>
                <div className={styles.branchStat}>
                  <AlertTriangle size={12} />
                  <span
                    className={`${styles.branchStatValue} ${
                      branch.stats?.lowStockCount > 0
                        ? styles.branchStatWarning
                        : ''
                    }`}
                  >
                    {branch.stats?.lowStockCount ?? 0}
                  </span>
                  <span className={styles.branchStatLabel}>low</span>
                </div>
                <div className={styles.branchStat}>
                  <ShoppingCart size={12} />
                  <span className={styles.branchStatValue}>
                    {branch.stats?.salesTodayCount ?? 0}
                  </span>
                  <span className={styles.branchStatLabel}>today</span>
                </div>
              </div>

              <div className={styles.branchCardFooter}>
                <span className={styles.branchSalesMonth}>
                  {formatCurrency(branch.stats?.salesThisMonth ?? 0, currency)}
                </span>
                <span className={styles.branchSalesLabel}>this month</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Footer note */}
      <div className={styles.footer}>
        <span className={styles.footerText}>
          Click a branch to view its overview, stock levels, and recent sales.
        </span>
      </div>
    </div>
  );
};

export default Branches;