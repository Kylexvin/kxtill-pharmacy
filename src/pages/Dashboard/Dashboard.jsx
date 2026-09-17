// src/pages/Dashboard/Dashboard.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useSettings } from '../../contexts/SettingsContext';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  TrendingUp, TrendingDown, DollarSign, Package,
  Clock, RefreshCw, ChevronRight, Award, BarChart3,
  Building2, AlertCircle, AlertTriangle, WifiOff,
  Plus, FileText, Package as PackageIcon, Store,
  Users, Receipt,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import styles from './Dashboard.module.css';
import usePolling from '../../hooks/usePolling';
import { getBranchProducts } from '../../db/sqlite';

const DASHBOARD_POLL_MS = 5 * 60 * 1000;
const CACHE_KEY_PREFIX = 'dashboardCache:';
const CACHE_TTL_MS = 60 * 1000; // 60s

// ---------------------------------------------------------------------------
// Cache helpers — avoid showing a skeleton on every mount
// ---------------------------------------------------------------------------
function readCache(orgId, branchKey) {
  if (!orgId) return null;
  try {
    const raw = sessionStorage.getItem(`${CACHE_KEY_PREFIX}${orgId}:${branchKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(orgId, branchKey, data) {
  if (!orgId) return;
  try {
    sessionStorage.setItem(
      `${CACHE_KEY_PREFIX}${orgId}:${branchKey}`,
      JSON.stringify({ ts: Date.now(), data })
    );
  } catch {
    // ignore quota errors
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
  const [isOnline, setIsOnline] = useState(!contextIsOffline);
  const [period, setPeriod] = useState('today');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasProducts, setHasProducts] = useState(null); // null = unknown

  const [profitData, setProfitData] = useState({
    period: 'today', startDate: null, revenue: 0, cost: 0, profit: 0, margin: 0, salesCount: 0,
  });
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

  const handleBranchViewChange = useCallback((value) => {
    setBranchViewFilter(value);
    if (value !== 'own' && value !== 'all') {
      const selectedBranch = branches.find(b => b.id === value);
      if (selectedBranch) setActiveBranch(selectedBranch);
    }
  }, [branches, setActiveBranch]);

  // ---------------------------------------------------------------------------
  // Product existence check — SQLite, cheap, cached by branch
  // ---------------------------------------------------------------------------
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

    return () => { cancelled = true; };
  }, [branchId]);

  // ---------------------------------------------------------------------------
  // Fetch dashboard data — dedupes concurrent calls, uses cache, no flicker
  // ---------------------------------------------------------------------------
  const fetchDashboardData = useCallback(async (opts = {}) => {
    const { silent = false } = opts;
    if (!orgId) return;

    const serverBranchId = getServerBranchId();
    const branchKey = serverBranchId || `all:${orgId}`;
    const cacheKey = `${branchKey}:${period}`;

    // Coalesce duplicate in-flight calls
    if (inflightRef.current === cacheKey) return;
    inflightRef.current = cacheKey;

    const thisRequestId = ++requestIdRef.current;

    // Show skeleton only on first-ever load (no cache hit)
    if (!silent && !hydratedRef.current) {
      const cached = readCache(orgId, cacheKey);
      if (!cached) setLoading(true);
    }
    setError(null);

    try {
      const isCurrentlyOnline = !contextIsOffline && navigator.onLine;

      const params = {};
      if (serverBranchId) params.branchId = serverBranchId;

      const periodMap = { today: 'today', week: 'week', month: 'month' };
      const apiPeriod = periodMap[period] || 'today';
      const daysMap = { today: 1, week: 7, month: 30 };

      const results = await Promise.allSettled([
        isCurrentlyOnline
          ? axios.get(`/organizations/${orgId}/kxtill/dashboard/profit`, { params: { ...params, period: apiPeriod } })
          : Promise.resolve({ data: null }),
        isCurrentlyOnline
          ? axios.get(`/organizations/${orgId}/kxtill/dashboard/sales-trend`, { params: { ...params, days: daysMap[period] || 7 } })
          : Promise.resolve({ data: null }),
        isCurrentlyOnline
          ? axios.get(`/organizations/${orgId}/kxtill/dashboard/today-sales-trend`, { params })
          : Promise.resolve({ data: null }),
        isCurrentlyOnline
          ? axios.get(`/organizations/${orgId}/kxtill/dashboard/top-products`, { params: { ...params, limit: 5 } })
          : Promise.resolve({ data: null }),
        isCurrentlyOnline
          ? axios.get(`/organizations/${orgId}/kxtill/dashboard/low-stock`, { params })
          : Promise.resolve({ data: null }),
        isCurrentlyOnline
          ? axios.get(`/organizations/${orgId}/kxtill/dashboard/recent-sales`, { params: { ...params, limit: 100 } })
          : Promise.resolve({ data: null }),
      ]);

      if (thisRequestId !== requestIdRef.current) return;

      const [profitRes, salesTrendRes, todaySalesTrendRes, topProductsRes, lowStockRes, recentSalesRes] = results;

      let nextProfit = profitData;
      let nextSalesTrend = salesTrend;
      let nextTodayTrend = todaySalesTrend;
      let nextTopProducts = topProducts;
      let nextLowStock = lowStockCount;
      let nextRecentSales = recentSalesCount;

      if (profitRes.status === 'fulfilled' && profitRes.value?.data) {
        const data = profitRes.value.data;
        nextProfit = {
          period: data.period || apiPeriod,
          startDate: data.startDate || null,
          revenue: data.revenue || 0,
          cost: data.cost || 0,
          profit: data.profit || 0,
          margin: data.margin || 0,
          salesCount: data.salesCount || 0,
        };
      }

      if (salesTrendRes.status === 'fulfilled' && salesTrendRes.value?.data) {
        const data = salesTrendRes.value.data;
        nextSalesTrend = {
          labels: data.labels || data.map?.(d => d.label) || [],
          values: data.values || data.map?.(d => d.value) || [],
        };
      }

      if (todaySalesTrendRes.status === 'fulfilled' && todaySalesTrendRes.value?.data) {
        const data = todaySalesTrendRes.value.data;
        nextTodayTrend = {
          labels: data.labels || [],
          values: data.values || [],
        };
      }

      if (topProductsRes.status === 'fulfilled' && topProductsRes.value?.data) {
        const raw = topProductsRes.value.data;
        const list = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.products)
          ? raw.products
          : [];
        nextTopProducts = list;
      }

      if (lowStockRes.status === 'fulfilled' && lowStockRes.value?.data) {
        const list = Array.isArray(lowStockRes.value.data) ? lowStockRes.value.data : [];
        nextLowStock = list.length;
      }

      if (recentSalesRes.status === 'fulfilled' && recentSalesRes.value?.data) {
        const list = Array.isArray(recentSalesRes.value.data) ? recentSalesRes.value.data : [];
        nextRecentSales = list.length;
      }

      setProfitData(nextProfit);
      setSalesTrend(nextSalesTrend);
      setTodaySalesTrend(nextTodayTrend);
      setTopProducts(nextTopProducts);
      setLowStockCount(nextLowStock);
      setRecentSalesCount(nextRecentSales);

      // Cache the assembled result
      writeCache(orgId, cacheKey, {
        profitData: nextProfit,
        salesTrend: nextSalesTrend,
        todaySalesTrend: nextTodayTrend,
        topProducts: nextTopProducts,
        lowStockCount: nextLowStock,
        recentSalesCount: nextRecentSales,
      });

      hydratedRef.current = true;
    } catch (error) {
      if (thisRequestId !== requestIdRef.current) return;
      console.error('Error fetching dashboard data:', error);
      setError('Failed to load dashboard data');
      toast.error('Failed to load dashboard');
    } finally {
      if (inflightRef.current === cacheKey) inflightRef.current = null;
      if (thisRequestId === requestIdRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [
    orgId, period, contextIsOffline, getServerBranchId,
    profitData, salesTrend, todaySalesTrend, topProducts, lowStockCount, recentSalesCount,
  ]);

  // ---------------------------------------------------------------------------
  // Hydrate from cache when org/branch/period changes — prevents skeleton flash
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!orgId) return;
    const serverBranchId = getServerBranchId();
    const branchKey = serverBranchId || `all:${orgId}`;
    const cacheKey = `${branchKey}:${period}`;
    const cached = readCache(orgId, cacheKey);

    if (cached) {
      setProfitData(cached.profitData);
      setSalesTrend(cached.salesTrend);
      setTodaySalesTrend(cached.todaySalesTrend);
      setTopProducts(cached.topProducts);
      setLowStockCount(cached.lowStockCount);
      setRecentSalesCount(cached.recentSalesCount);
      setLoading(false);
      hydratedRef.current = true;
    } else {
      hydratedRef.current = false;
    }
  }, [orgId, period, branchViewFilter, getServerBranchId]);

  useEffect(() => {
    setIsOnline(!contextIsOffline);
  }, [contextIsOffline]);

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
      if (contextIsOffline) return;
      if (!navigator.onLine) return;
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

  // ---------------------------------------------------------------------------
  // Empty state classification
  // ---------------------------------------------------------------------------
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

  const showOffline = !isOnline || contextIsOffline;
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
  const hasSalesData = chartData.some(d => d.sales > 0);
  const shouldShowChart = isTodayView
    ? hasSalesData
    : chartData.filter(d => d.sales > 0).length >= 2;

  const getPeriodLabel = () => {
    switch (period) {
      case 'today': return 'Today (Hourly)';
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      default: return 'Today';
    }
  };

  const getBranchDisplayName = () => {
    if (branchViewFilter === 'all') return 'All Branches';
    if (branchViewFilter !== 'own') {
      const found = branches.find(b => b.id === branchViewFilter);
      if (found) return found.name;
    }
    return activeBranch?.name || activeOrganization?.name || 'Dashboard';
  };

  const getMarginClass = () => {
    if (profitData.margin > 0) return styles.statChangePositive;
    if (profitData.margin < 0) return styles.statChangeNegative;
    return styles.statChangeNeutral;
  };

  // ---------------------------------------------------------------------------
  // Full-page takeover: no products at all
  // ---------------------------------------------------------------------------
  if (noCatalog && !loading) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.emptyState} style={{ padding: '60px 24px' }}>
          <Package size={48} />
          <h3>Welcome to KxTill</h3>
          <p style={{ maxWidth: 380, margin: '8px auto 0', lineHeight: 1.5 }}>
            You don't have any products yet. Add your first product to start
            making sales.
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

  return (
    <div className={styles.dashboard}>
      {/* Quick Actions */}
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

      {/* Header */}
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
                  .filter(b => b.id !== activeBranch?.id)
                  .map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
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

          <button className={styles.refreshBtn} onClick={handleRefresh} disabled={isRefreshing}>
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

      {/* Stats Grid */}
      {loading ? (
        <div className={styles.statsGrid}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={`${styles.statCard} ${styles.skeleton}`}>
              <div className={styles.skeletonIcon} />
              <div className={styles.skeletonText} />
              <div className={styles.skeletonValue} />
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.statIconRevenue}`}>
              <DollarSign size={20} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Revenue</span>
              <span className={styles.statValue}>{formatCompactCurrency(profitData.revenue)}</span>
              <span className={styles.statSubtext}>{profitData.salesCount} sales</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.statIconProfit}`}>
              <TrendingUp size={20} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Profit</span>
              <span className={styles.statValue}>{formatCompactCurrency(profitData.profit)}</span>
              <span className={getMarginClass()}>
                {profitData.margin >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {Math.abs(profitData.margin).toFixed(1)}% margin
              </span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.statIconCost}`}>
              <Package size={20} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Cost of Goods</span>
              <span className={styles.statValue}>{formatCompactCurrency(profitData.cost)}</span>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.statIconPeriod}`}>
              <Clock size={20} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Period</span>
              <span className={styles.statValue} style={{ fontSize: '16px' }}>{getPeriodLabel()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Sales Trend */}
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
              <p>{noSalesYet ? 'No sales yet' : 'No sales in this period'}</p>
              <span>
                {noSalesYet
                  ? 'Head to the POS to make your first sale'
                  : 'Try a wider period, or make a new sale'}
              </span>
              <button
                className={styles.quickActionBtn}
                style={{ marginTop: 12 }}
                onClick={() => navigate('/pos')}
              >
                <Plus size={16} />
                Go to POS
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Counter cards — navigable */}
      <div className={styles.countersGrid}>
        <button
          type="button"
          className={styles.counterCard}
          onClick={() => navigate('/inventory')}
        >
          <div className={`${styles.counterIcon} ${styles.counterIconWarning}`}>
            <AlertTriangle size={20} />
          </div>
          <div className={styles.counterInfo}>
            <span className={styles.counterValue}>{lowStockCount}</span>
            <span className={styles.counterLabel}>Low Stock Items</span>
          </div>
          <ChevronRight size={16} className={styles.counterArrow} />
        </button>

        <button
          type="button"
          className={styles.counterCard}
          onClick={() => navigate('/sales')}
        >
          <div className={`${styles.counterIcon} ${styles.counterIconSuccess}`}>
            <Receipt size={20} />
          </div>
          <div className={styles.counterInfo}>
            <span className={styles.counterValue}>{recentSalesCount}</span>
            <span className={styles.counterLabel}>Recent Sales</span>
          </div>
          <ChevronRight size={16} className={styles.counterArrow} />
        </button>

        <button
          type="button"
          className={styles.counterCard}
          onClick={() => navigate('/customers')}
        >
          <div className={`${styles.counterIcon} ${styles.counterIconInfo}`}>
            <Users size={20} />
          </div>
          <div className={styles.counterInfo}>
            <span className={styles.counterValue}>—</span>
            <span className={styles.counterLabel}>Customers</span>
          </div>
          <ChevronRight size={16} className={styles.counterArrow} />
        </button>
      </div>

      {/* Top Products preview */}
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