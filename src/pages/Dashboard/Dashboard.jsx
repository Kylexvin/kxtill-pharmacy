// src/pages/Dashboard/Dashboard.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useSettings } from '../../contexts/SettingsContext';
import axios from 'axios';
import {
  Package, RefreshCw, Award, BarChart3, Building2,
  AlertCircle, WifiOff, Plus, FileText,
  Package as PackageIcon, Store,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import styles from './Dashboard.module.css';
import usePolling from '../../hooks/usePolling';
import { getBranchProducts, getAllLocalSalesForBranch } from '../../db/sqlite';
import StatsGrid from './components/StatsGrid';
import CountersGrid from './components/CountersGrid';

const DASHBOARD_POLL_MS = 5 * 60 * 1000;

const toNumber = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const snapshotKey = (orgId, serverBranchId) =>
  `dashboardSnapshot:${orgId}:${serverBranchId || 'all'}`;

function readSnapshot(orgId, serverBranchId) {
  if (!orgId) return null;
  try {
    const raw = localStorage.getItem(snapshotKey(orgId, serverBranchId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSnapshot(orgId, serverBranchId, data) {
  if (!orgId) return;
  try {
    localStorage.setItem(snapshotKey(orgId, serverBranchId), JSON.stringify(data));
  } catch {
    // quota / private mode
  }
}

const Dashboard = () => {
  const navigate = useNavigate();
  const {
    activeOrganization,
    activeBranch,
    isOffline: contextIsOffline,
    branches,
    setActiveBranch,
  } = useAuth();
  const { isOwner } = usePermissions();
  const { formatCurrency, formatCompactCurrency } = useSettings();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [period, setPeriod] = useState('today');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasProducts, setHasProducts] = useState(null);

  const [profitData, setProfitData] = useState({
    period: 'today',
    startDate: null,
    revenue: 0,
    cost: 0,
    profit: 0,
    margin: 0,
    salesCount: 0,
  });
  const [localDelta, setLocalDelta] = useState({ revenue: 0, salesCount: 0 });
  const [salesTrend, setSalesTrend] = useState({ labels: [], values: [] });
  const [todaySalesTrend, setTodaySalesTrend] = useState({ labels: [], values: [] });
  const [topProducts, setTopProducts] = useState([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [recentSalesCount, setRecentSalesCount] = useState(0);

  const [branchViewFilter, setBranchViewFilter] = useState(() => {
    const stored = localStorage.getItem('dashboardBranchFilter');
    return stored || 'own';
  });

  const requestIdRef = useRef(0);
  const inflightRef = useRef(null);
  const hydratedRef = useRef(false);

  const orgId = activeOrganization?.id;
  const branchId = activeBranch?.id;
  const canViewAllBranches = isOwner;

  useEffect(() => {
    localStorage.setItem('dashboardBranchFilter', branchViewFilter);
  }, [branchViewFilter]);

  useEffect(() => {
    if (activeBranch && branchViewFilter !== 'all' && branchViewFilter !== activeBranch.id) {
      if (branchViewFilter === 'own' || branchViewFilter !== activeBranch.id) {
        setBranchViewFilter('own');
      }
    }
  }, [activeBranch, branchViewFilter]);

  const getServerBranchId = useCallback(() => {
    if (branchViewFilter === 'all' && canViewAllBranches) return null;
    if (branchViewFilter === 'own' || !canViewAllBranches) return activeBranch?.id || null;
    return branchViewFilter;
  }, [branchViewFilter, canViewAllBranches, activeBranch]);

  const handleBranchViewChange = useCallback(
    (value) => {
      setBranchViewFilter(value);
      if (value !== 'own' && value !== 'all') {
        const selectedBranch = branches.find((b) => b.id === value);
        if (selectedBranch) setActiveBranch(selectedBranch);
      }
    },
    [branches, setActiveBranch]
  );

  // ---------- product existence ----------
  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    (async () => {
      try {
        const bps = await getBranchProducts(branchId);
        if (!cancelled) setHasProducts(Array.isArray(bps) && bps.length > 0);
      } catch (err) {
        console.warn('Failed to check branch products:', err);
        if (!cancelled) setHasProducts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  // ---------- offline signal ----------
  const showOffline = !isOnline || contextIsOffline;

  // ---------- local unsynced delta ----------
  const computeLocalDelta = useCallback(async () => {
    if (!branchId) return { revenue: 0, salesCount: 0 };
    try {
      const result = await getAllLocalSalesForBranch(branchId, {});
      const items = result?.items || [];
      const revenue = items.reduce((sum, s) => sum + toNumber(s.totalAmount), 0);
      return { revenue, salesCount: items.length };
    } catch {
      return { revenue: 0, salesCount: 0 };
    }
  }, [branchId]);

  useEffect(() => {
    if (!branchId || !showOffline) {
      setLocalDelta({ revenue: 0, salesCount: 0 });
      return;
    }
    let cancelled = false;
    computeLocalDelta().then((d) => {
      if (!cancelled) setLocalDelta(d);
    });
    return () => {
      cancelled = true;
    };
  }, [showOffline, branchId, computeLocalDelta]);

  useEffect(() => {
    const handler = () => {
      if (showOffline && branchId) computeLocalDelta().then(setLocalDelta);
    };
    window.addEventListener('kxtill:sync-complete', handler);
    return () => window.removeEventListener('kxtill:sync-complete', handler);
  }, [showOffline, branchId, computeLocalDelta]);

  // ---------- hydrate from localStorage on mount / scope change ----------
  useEffect(() => {
    if (!orgId) return;
    const serverBranchId = getServerBranchId();
    const snap = readSnapshot(orgId, serverBranchId);
    if (!snap) return;

    if (snap.profitData) setProfitData(snap.profitData);
    if (snap.salesTrend) setSalesTrend(snap.salesTrend);
    if (snap.todaySalesTrend) setTodaySalesTrend(snap.todaySalesTrend);
    if (Array.isArray(snap.topProducts)) setTopProducts(snap.topProducts);
    if (typeof snap.lowStockCount === 'number') setLowStockCount(snap.lowStockCount);
    if (typeof snap.recentSalesCount === 'number') setRecentSalesCount(snap.recentSalesCount);

    setLoading(false);
    hydratedRef.current = true;
  }, [orgId, period, getServerBranchId]);

  // ---------- browser online/offline ----------
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    setIsOnline(!contextIsOffline);
  }, [contextIsOffline]);

  // ---------- fetch ----------
  const fetchDashboardData = useCallback(
    async (opts = {}) => {
      const { silent = false } = opts;
      if (!orgId) return;

      const serverBranchId = getServerBranchId();
      const inflightKey = `${orgId}:${serverBranchId || 'all'}`;

      if (inflightRef.current === inflightKey) return;
      inflightRef.current = inflightKey;

      const thisRequestId = ++requestIdRef.current;

      if (!silent && !hydratedRef.current) {
        const existing = readSnapshot(orgId, serverBranchId);
        if (!existing) setLoading(true);
      }
      setError(null);

      try {
        const reachable = navigator.onLine && !contextIsOffline;

        const params = {};
        if (serverBranchId) params.branchId = serverBranchId;

        const periodMap = { today: 'today', week: 'week', month: 'month' };
        const apiPeriod = periodMap[period] || 'today';
        const daysMap = { today: 1, week: 7, month: 30 };

        const results = await Promise.allSettled([
          reachable
            ? axios.get(`/organizations/${orgId}/kxtill/dashboard/profit`, {
                params: { ...params, period: apiPeriod },
              })
            : Promise.resolve({ data: null }),
          reachable
            ? axios.get(`/organizations/${orgId}/kxtill/dashboard/sales-trend`, {
                params: { ...params, days: daysMap[period] || 7 },
              })
            : Promise.resolve({ data: null }),
          reachable
            ? axios.get(`/organizations/${orgId}/kxtill/dashboard/today-sales-trend`, { params })
            : Promise.resolve({ data: null }),
          reachable
            ? axios.get(`/organizations/${orgId}/kxtill/dashboard/top-products`, {
                params: { ...params, limit: 5 },
              })
            : Promise.resolve({ data: null }),
          reachable
            ? axios.get(`/organizations/${orgId}/kxtill/dashboard/low-stock`, { params })
            : Promise.resolve({ data: null }),
          reachable
            ? axios.get(`/organizations/${orgId}/kxtill/dashboard/recent-sales`, {
                params: { ...params, limit: 100 },
              })
            : Promise.resolve({ data: null }),
        ]);

        if (thisRequestId !== requestIdRef.current) return;

        const [
          profitRes,
          salesTrendRes,
          todaySalesTrendRes,
          topProductsRes,
          lowStockRes,
          recentSalesRes,
        ] = results;

        // Start from whatever we had — never blank out
        const snap = readSnapshot(orgId, serverBranchId) || {};

        if (profitRes.status === 'fulfilled' && profitRes.value?.data) {
          const data = profitRes.value.data;
          snap.profitData = {
            period: data.period || apiPeriod,
            startDate: data.startDate || null,
            revenue: data.revenue || 0,
            cost: data.cost || 0,
            profit: data.profit || 0,
            margin: data.margin || 0,
            salesCount: data.salesCount || 0,
          };
          setProfitData(snap.profitData);
        }

        if (salesTrendRes.status === 'fulfilled' && salesTrendRes.value?.data) {
          const data = salesTrendRes.value.data;
          snap.salesTrend = {
            labels: data.labels || data.map?.((d) => d.label) || [],
            values: data.values || data.map?.((d) => d.value) || [],
          };
          setSalesTrend(snap.salesTrend);
        }

        if (todaySalesTrendRes.status === 'fulfilled' && todaySalesTrendRes.value?.data) {
          const data = todaySalesTrendRes.value.data;
          snap.todaySalesTrend = {
            labels: data.labels || [],
            values: data.values || [],
          };
          setTodaySalesTrend(snap.todaySalesTrend);
        }

        if (topProductsRes.status === 'fulfilled' && topProductsRes.value?.data) {
          const raw = topProductsRes.value.data;
          snap.topProducts = Array.isArray(raw) ? raw : Array.isArray(raw?.products) ? raw.products : [];
          setTopProducts(snap.topProducts);
        }

        if (lowStockRes.status === 'fulfilled' && lowStockRes.value?.data) {
          const list = Array.isArray(lowStockRes.value.data) ? lowStockRes.value.data : [];
          snap.lowStockCount = list.length;
          setLowStockCount(snap.lowStockCount);
        }

        if (recentSalesRes.status === 'fulfilled' && recentSalesRes.value?.data) {
          const list = Array.isArray(recentSalesRes.value.data) ? recentSalesRes.value.data : [];
          snap.recentSalesCount = list.length;
          setRecentSalesCount(snap.recentSalesCount);
        }

        writeSnapshot(orgId, serverBranchId, snap);
        hydratedRef.current = true;
      } catch (err) {
        if (thisRequestId !== requestIdRef.current) return;
        console.error('Error fetching dashboard data:', err);
        // silent — cached + local stays
      } finally {
        if (inflightRef.current === inflightKey) inflightRef.current = null;
        if (thisRequestId === requestIdRef.current) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [orgId, period, getServerBranchId, contextIsOffline]
  );

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await fetchDashboardData({ silent: true });
  }, [fetchDashboardData, isRefreshing]);

  useEffect(() => {
    if (!orgId) return;
    fetchDashboardData({ silent: hydratedRef.current });
  }, [fetchDashboardData, orgId]);

  usePolling(
    () => {
      if (!navigator.onLine) return;
      if (contextIsOffline) return;
      fetchDashboardData({ silent: true });
    },
    DASHBOARD_POLL_MS,
    [orgId, period, branchViewFilter]
  );

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className={styles.customTooltip}>
          <p className={styles.customTooltipLabel}>{label}</p>
          <p className={styles.customTooltipValue}>{formatCurrency(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  // ---------- merged view ----------
  const mergedProfitData = useMemo(() => {
    if (!showOffline) return profitData;
    return {
      ...profitData,
      revenue: toNumber(profitData.revenue) + toNumber(localDelta.revenue),
      salesCount: toNumber(profitData.salesCount) + toNumber(localDelta.salesCount),
    };
  }, [profitData, localDelta, showOffline]);

  const hasCatalog = hasProducts === true;
  const noCatalog = hasProducts === false;
  const noSalesYet = hasCatalog && recentSalesCount === 0;

  if (!orgId) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.emptyState}>
          <Building2 size={48} />
          <h3>No Organization Selected</h3>
          <p>Please select an organization to view the dashboard</p>
        </div>
      </div>
    );
  }

  const showBranchSwitch = canViewAllBranches && branches && branches.length > 1;

  const todayChartData = todaySalesTrend.labels.map((label, i) => ({
    name: label,
    sales: todaySalesTrend.values?.[i] || 0,
  }));

  const weekMonthChartData = salesTrend.labels.map((label, i) => ({
    name: label,
    sales: salesTrend.values?.[i] || 0,
  }));

  const isTodayView = period === 'today';
  const chartData = isTodayView ? todayChartData : weekMonthChartData;
  const hasSalesData = chartData.some((d) => d.sales > 0);
  const shouldShowChart = isTodayView
    ? hasSalesData
    : chartData.filter((d) => d.sales > 0).length >= 2;

  const getPeriodLabel = () => {
    switch (period) {
      case 'today':
        return 'Today (Hourly)';
      case 'week':
        return 'This Week';
      case 'month':
        return 'This Month';
      default:
        return 'Today';
    }
  };

  const getBranchDisplayName = () => {
    if (branchViewFilter === 'all') return 'All Branches';
    if (branchViewFilter !== 'own') {
      const found = branches.find((b) => b.id === branchViewFilter);
      if (found) return found.name;
    }
    return activeBranch?.name || activeOrganization?.name || 'Dashboard';
  };

  if (noCatalog && !loading) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.emptyState} style={{ padding: '60px 24px' }}>
          <Package size={48} />
          <h3>Welcome to KxTill</h3>
          <p style={{ maxWidth: 380, margin: '8px auto 0', lineHeight: 1.5 }}>
            You don't have any products yet. Add your first product to start making sales.
          </p>
          <button
            className={styles.quickActionBtn}
            style={{ marginTop: 20 }}
            onClick={() => navigate('/global-inventory')}
          >
            <Plus size={18} />
            Add your first product
          </button>
        </div>
      </div>
    );
  }

  const offlineTag = showOffline ? 'offline' : null;

  return (
    <div className={styles.dashboard}>
      <div className={styles.quickActions}>
        <button className={styles.quickActionBtn} onClick={() => navigate('/pos')}>
          <Plus size={18} />
          New Sale
        </button>
        <button className={styles.quickActionBtn} onClick={() => navigate('/inventory')}>
          <PackageIcon size={18} />
          Add Product
        </button>
        <button className={styles.quickActionBtn} onClick={() => navigate('/inventory')}>
          <FileText size={18} />
          Stock Adjustment
        </button>
        <button className={styles.quickActionBtn} onClick={() => navigate('/reports')}>
          <BarChart3 size={18} />
          View Reports
        </button>
      </div>

      <div className={styles.headerCard}>
        <div className={styles.headerLeft}>
          <Store size={18} className={styles.orgIcon} />
          <span className={styles.branchTitle}>{getBranchDisplayName()}</span>
        </div>

        <div className={styles.headerRight}>
          {showBranchSwitch && (
            <div className={styles.branchSelector}>
              <Building2 size={14} />
              <select
                value={branchViewFilter}
                onChange={(e) => handleBranchViewChange(e.target.value)}
                className={styles.branchSelect}
              >
                <option value="own">{activeBranch?.name || 'My Branch'}</option>
                <option value="all">All Branches</option>
                {branches
                  .filter((b) => b.id !== activeBranch?.id)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {showOffline && (
            <span className={styles.offlineBadge}>
              <WifiOff size={14} />
              Offline
            </span>
          )}

          <div className={styles.periodSelector}>
            <button
              className={`${styles.periodBtn} ${period === 'today' ? styles.active : ''}`}
              onClick={() => setPeriod('today')}
            >
              Today
            </button>
            <button
              className={`${styles.periodBtn} ${period === 'week' ? styles.active : ''}`}
              onClick={() => setPeriod('week')}
            >
              Week
            </button>
            <button
              className={`${styles.periodBtn} ${period === 'month' ? styles.active : ''}`}
              onClick={() => setPeriod('month')}
            >
              Month
            </button>
          </div>

          <button
            className={styles.refreshBtn}
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw size={14} className={isRefreshing ? styles.spinning : ''} />
            {isRefreshing ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.errorState}>
          <AlertCircle size={24} />
          <h3>Failed to load data</h3>
          <p>{error}</p>
          <button onClick={() => fetchDashboardData()}>Retry</button>
        </div>
      )}

      <StatsGrid
        loading={loading}
        profitData={mergedProfitData}
        periodLabel={getPeriodLabel()}
        offlineTag={offlineTag}
        formatCompactCurrency={formatCompactCurrency}
      />

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitle}>
            <BarChart3 size={18} />
            <span>Sales Trend</span>
          </div>
          <span className={styles.cardSubtitle}>
            {isTodayView ? 'Hourly' : getPeriodLabel()}
          </span>
        </div>
        <div className={styles.cardBody}>
          {loading ? (
            <div className={styles.chartSkeleton} />
          ) : shouldShowChart ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF6B2B" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#FF6B2B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis
                  dataKey="name"
                  stroke="#6b7280"
                  fontSize={11}
                  interval={isTodayView ? Math.floor(chartData.length / 8) : 0}
                />
                <YAxis
                  stroke="#6b7280"
                  fontSize={11}
                  tickFormatter={(value) => formatCompactCurrency(value)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#FF6B2B"
                  fillOpacity={1}
                  fill="url(#salesGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.chartEmpty}>
              <BarChart3 size={32} />
              <p>
                {showOffline
                  ? 'Chart not available offline'
                  : noSalesYet
                  ? 'No sales yet'
                  : 'No sales in this period'}
              </p>
              <span>
                {showOffline
                  ? 'Reconnect to load the trend'
                  : noSalesYet
                  ? 'Head to the POS to make your first sale'
                  : 'Try a wider period, or make a new sale'}
              </span>
              {!showOffline && (
                <button
                  className={styles.quickActionBtn}
                  style={{ marginTop: 12 }}
                  onClick={() => navigate('/pos')}
                >
                  <Plus size={16} />
                  Go to POS
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <CountersGrid
        lowStockCount={lowStockCount}
        recentSalesCount={recentSalesCount}
        customersCount={null}
      />

      {topProducts.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <Award size={18} />
              <span>Top Products</span>
            </div>
            <span className={styles.cardSubtitle}>
              Top {Math.min(topProducts.length, 5)} · {getPeriodLabel()}
            </span>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.topProducts}>
              {topProducts.slice(0, 5).map((product, index) => (
                <div
                  key={product.productId || product.id || index}
                  className={styles.productItem}
                >
                  <div className={styles.productRank}>{index + 1}</div>
                  <span className={styles.productName}>{product.name}</span>
                  <span className={styles.productTotal}>
                    {formatCurrency(product.total)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;