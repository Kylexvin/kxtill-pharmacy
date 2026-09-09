// src/pages/Dashboard/Dashboard.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  TrendingUp, TrendingDown, DollarSign, Package,
  Clock, RefreshCw, ChevronRight, Award, BarChart3,
  Building2, AlertCircle, AlertTriangle, WifiOff,
  Plus, FileText, Package as PackageIcon, Store,
  ArrowRight, Eye
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, 
} from 'recharts';
import styles from './Dashboard.module.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const {
    activeOrganization,
    activeBranch,
    accessToken,
    isOffline: contextIsOffline,
    branches,
    setActiveBranch,
  } = useAuth();

  // Use settings from SettingsContext
  const {
    formatCurrency,
    formatCompactCurrency,
  } = useSettings();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(!contextIsOffline);
  const [period, setPeriod] = useState('today');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [, setTodayStats] = useState({
    todaySales: 0, transactions: 0, profit: 0, itemsSold: 0,
  });
  const [profitData, setProfitData] = useState({
    period: 'today', startDate: null, revenue: 0, cost: 0, profit: 0, margin: 0, salesCount: 0,
  });
  const [salesTrend, setSalesTrend] = useState({ labels: [], values: [] });
  const [todaySalesTrend, setTodaySalesTrend] = useState({ labels: [], values: [] });
  const [topProducts, setTopProducts] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [recentSales, setRecentSales] = useState([]);

  const [userPermissions, setUserPermissions] = useState([]);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  // Local branch view filter - initialize based on whether we have a specific branch selected
  const [branchViewFilter, setBranchViewFilter] = useState(() => {
    // If there's a stored selection, use it, otherwise default to 'own'
    const stored = localStorage.getItem('dashboardBranchFilter');
    return stored || 'own';
  });
  
  const requestIdRef = useRef(0);


  const orgId = activeOrganization?.id;
  const isOwner = userPermissions.includes('*');
  const canViewAllBranches = isOwner;

  // Save branch filter to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('dashboardBranchFilter', branchViewFilter);
  }, [branchViewFilter]);

  // Sync the branch view filter with the active branch when it changes from outside
  useEffect(() => {
    // If the active branch changes and we're not in 'all' mode, update the filter
    if (activeBranch && branchViewFilter !== 'all' && branchViewFilter !== activeBranch.id) {
      // Check if we're currently viewing a specific branch that might have been changed
      // Only update if we're in 'own' mode or if the branch doesn't match
      if (branchViewFilter === 'own' || branchViewFilter !== activeBranch.id) {
        setBranchViewFilter('own');
      }
    }
  }, [activeBranch, branchViewFilter]);

  // We no longer need custom formatCurrency and formatCompactCurrency
  // They are now provided by SettingsContext

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  useEffect(() => {
    const fetchPermissions = async () => {
      if (!orgId || !accessToken) return;
      try {
        const response = await axios.get(`/auth/me/dashboard?organizationId=${orgId}`);
        setUserPermissions(response.data.permissions || []);
      } catch (error) {
        console.error('Failed to fetch permissions:', error);
        setUserPermissions([]);
      } finally {
        setPermissionsLoaded(true);
      }
    };
    fetchPermissions();
  }, [orgId, accessToken]);

  const getServerBranchId = useCallback(() => {
    if (branchViewFilter === 'all' && canViewAllBranches) return null;
    if (branchViewFilter === 'own' || !canViewAllBranches) return activeBranch?.id || null;
    return branchViewFilter;
  }, [branchViewFilter, canViewAllBranches, activeBranch]);

  // Handle branch view change - updates local filter AND global context if needed
  const handleBranchViewChange = useCallback((value) => {
    setBranchViewFilter(value);
    
    // If a specific branch is selected (not 'own' or 'all'), update the global context
    if (value !== 'own' && value !== 'all') {
      const selectedBranch = branches.find(b => b.id === value);
      if (selectedBranch) {
        setActiveBranch(selectedBranch);
      }
    } else if (value === 'own' && activeBranch) {
      // If 'own' is selected, make sure the context has the correct branch
      // This is useful when switching back from a specific branch
      // We don't need to do anything if the activeBranch is already set
    }
  }, [branches, setActiveBranch, activeBranch]);

  const fetchDashboardData = useCallback(async () => {
    if (!orgId || !permissionsLoaded) return;

    const thisRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const isCurrentlyOnline = !contextIsOffline && navigator.onLine;

      const params = {};
      const serverBranchId = getServerBranchId();
      if (serverBranchId) params.branchId = serverBranchId;

      const periodMap = { today: 'today', week: 'week', month: 'month' };
      const apiPeriod = periodMap[period] || 'today';
      const daysMap = { today: 1, week: 7, month: 30 };

      const results = await Promise.allSettled([
        isCurrentlyOnline
          ? axios.get(`/organizations/${orgId}/kxtill/dashboard/today-stats`, { params })
          : Promise.resolve({ data: null }),
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
          ? axios.get(`/organizations/${orgId}/kxtill/dashboard/recent-sales`, { params: { ...params, limit: 5 } })
          : Promise.resolve({ data: null }),
      ]);

      if (thisRequestId !== requestIdRef.current) return;

      const [todayStatsRes, profitRes, salesTrendRes, todaySalesTrendRes, topProductsRes, lowStockRes, recentSalesRes] = results;

      if (todayStatsRes.status === 'fulfilled' && todayStatsRes.value?.data) {
        const data = todayStatsRes.value.data;
        setTodayStats({
          todaySales: data.todaySales || data.totalSales || 0,
          transactions: data.transactions || data.count || 0,
          profit: data.profit || 0,
          itemsSold: data.itemsSold || 0,
        });
      }

      if (profitRes.status === 'fulfilled' && profitRes.value?.data) {
        const data = profitRes.value.data;
        setProfitData({
          period: data.period || apiPeriod,
          startDate: data.startDate || null,
          revenue: data.revenue || 0,
          cost: data.cost || 0,
          profit: data.profit || 0,
          margin: data.margin || 0,
          salesCount: data.salesCount || 0,
        });
      }

      if (salesTrendRes.status === 'fulfilled' && salesTrendRes.value?.data) {
        const data = salesTrendRes.value.data;
        setSalesTrend({
          labels: data.labels || data.map?.(d => d.label) || [],
          values: data.values || data.map?.(d => d.value) || [],
        });
      }

      if (todaySalesTrendRes.status === 'fulfilled' && todaySalesTrendRes.value?.data) {
        const data = todaySalesTrendRes.value.data;
        setTodaySalesTrend({
          labels: data.labels || [],
          values: data.values || [],
        });
      }

      if (topProductsRes.status === 'fulfilled' && topProductsRes.value?.data) {
        setTopProducts(topProductsRes.value.data || []);
      }

      if (lowStockRes.status === 'fulfilled' && lowStockRes.value?.data) {
        setLowStockItems(lowStockRes.value.data || []);
      }

      if (recentSalesRes.status === 'fulfilled' && recentSalesRes.value?.data) {
        setRecentSales(recentSalesRes.value.data || []);
      }

    } catch (error) {
      if (thisRequestId !== requestIdRef.current) return;
      console.error('Error fetching dashboard data:', error);
      setError('Failed to load dashboard data');
      toast.error('Failed to load dashboard');
    } finally {
      if (thisRequestId === requestIdRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [orgId, permissionsLoaded, period, contextIsOffline, getServerBranchId]);

  useEffect(() => {
    setIsOnline(!contextIsOffline);
  }, [contextIsOffline]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await fetchDashboardData();
  }, [fetchDashboardData, isRefreshing]);

  useEffect(() => {
    if (orgId && permissionsLoaded) {
      fetchDashboardData();
    }
  }, [fetchDashboardData, orgId, permissionsLoaded]);

  useEffect(() => {
    if (!isOnline) return;

    const interval = setInterval(() => {
      if (navigator.onLine && !contextIsOffline) {
        fetchDashboardData();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [isOnline, contextIsOffline, fetchDashboardData]);

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

  // For Today view, use hourly trend data
  const todayChartData = todaySalesTrend.labels.map((label, i) => ({
    name: label,
    sales: todaySalesTrend.values?.[i] || 0,
  }));

  // For Week/Month view, use daily trend data
  const weekMonthChartData = salesTrend.labels.map((label, i) => ({
    name: label,
    sales: salesTrend.values?.[i] || 0,
  }));

  // Determine which data to show based on period
  const isTodayView = period === 'today';
  const chartData = isTodayView ? todayChartData : weekMonthChartData;
  
  // Check if there's any sales data
  const hasSalesData = chartData.some(d => d.sales > 0);
  
  // For Week/Month, require at least 2 data points with sales
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

  // Get the display name for the current branch view
  const getBranchDisplayName = () => {
    if (branchViewFilter === 'all') {
      return 'All Branches';
    }
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

  const getLowStockStatus = (stock) => {
    if (stock === 0) return { label: 'Out of Stock', variant: 'danger' };
    if (stock <= 2) return { label: 'Critical', variant: 'critical' };
    return { label: 'Low', variant: 'warning' };
  };

  return (
    <div className={styles.dashboard}>
      {/* Quick Actions */}
      <div className={styles.quickActions}>
        <button className={styles.quickActionBtn} onClick={() => navigate('/pos')}>
          <Plus size={18} />
          New Sale
        </button>
        <button className={styles.quickActionBtn} onClick={() => navigate('/products')}>
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

      {/* Header - Compact Full Width */}
      <div className={styles.headerCard}>
        <div className={styles.headerLeft}>
          <Store size={18} className={styles.orgIcon} />
          <span className={styles.branchTitle}>
            {getBranchDisplayName()}
          </span>
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
          <button onClick={fetchDashboardData}>Retry</button>
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

      {/* Sales Trend - Shows hourly for Today, daily for Week/Month */}
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
                <YAxis stroke="#6b7280" fontSize={11} tickFormatter={(value) => formatCompactCurrency(value)} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="sales" stroke="#FF6B2B" fillOpacity={1} fill="url(#salesGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.chartEmpty}>
              <BarChart3 size={32} />
              <p>No sales data available</p>
              <span>{isTodayView ? 'Sales will appear here as they happen' : 'Complete more sales to see your trend'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Low Stock - Premium Cards */}
      {lowStockItems.length > 0 && (
        <div className={styles.lowStockSection}>
          <div className={styles.lowStockHeader}>
            <div className={styles.lowStockTitle}>
              <AlertTriangle size={18} />
              <span>Low Stock Alert</span>
              <span className={styles.lowStockCount}>{lowStockItems.length} items</span>
            </div>
            <button 
              className={styles.viewAllBtn} 
              onClick={() => navigate('/kx/kxtill/low-stock')}
            >
              View All <ChevronRight size={14} />
            </button>
          </div>
          <div className={styles.lowStockGrid}>
            {lowStockItems.slice(0, 6).map((item) => {
              const status = getLowStockStatus(item.stock);
              return (
                <div key={item.id} className={`${styles.lowStockCard} ${styles[status.variant]}`}>
                  <div className={styles.lowStockCardHeader}>
                    <span className={styles.lowStockCardName}>{item.name}</span>
                    <span className={`${styles.lowStockCardStatus} ${styles[status.variant]}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className={styles.lowStockCardBody}>
                    <div className={styles.lowStockCardStock}>
                      <Package size={14} />
                      <span>{item.stock || 0} {item.unit || 'units'} left</span>
                    </div>
                    {item.sku && (
                      <span className={styles.lowStockCardSku}>SKU: {item.sku}</span>
                    )}
                  </div>
                  <button 
                    className={styles.lowStockCardAction}
                    onClick={() => navigate(`/kx/kxtill/inventory/${item.id}`)}
                  >
                    <Eye size={14} />
                    View Product
                  </button>
                </div>
              );
            })}
          </div>
          {lowStockItems.length > 6 && (
            <button 
              className={styles.lowStockViewMore}
              onClick={() => navigate('/kx/kxtill/low-stock')}
            >
              View all {lowStockItems.length} low stock items <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}

      {/* Bottom Row - Top Products & Recent Sales */}
      <div className={styles.bottomRow}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <Award size={18} />
              <span>Top Products</span>
            </div>
          </div>
          <div className={styles.cardBody}>
            {loading ? (
              <div className={styles.productSkeleton} />
            ) : topProducts.length > 0 ? (
              <div className={styles.topProducts}>
                {topProducts.map((product, index) => (
                  <div key={product.productId || index} className={styles.productItem}>
                    <div className={styles.productRank}>{index + 1}</div>
                    <span className={styles.productName}>{product.name}</span>
                    <span className={styles.productTotal}>{formatCurrency(product.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <Package size={32} />
                <p>No product data</p>
              </div>
            )}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <Clock size={18} />
              <span>Recent Sales</span>
            </div>
            <button className={styles.viewAllBtn} onClick={() => navigate('/sales')}>
              View All <ChevronRight size={14} />
            </button>
          </div>
          <div className={styles.cardBody}>
            {loading ? (
              <div className={styles.recentSkeleton} />
            ) : recentSales.length > 0 ? (
              <div className={styles.recentList}>
                {recentSales.slice(0, 5).map((sale) => (
                  <div key={sale.id} className={styles.recentItem}>
                    <span className={styles.recentRef}>{sale.reference || sale.id?.slice(0, 8)}</span>
                    <span className={styles.recentTotal}>{formatCurrency(sale.total)}</span>
                    <span className={styles.recentTime}>{formatDate(sale.createdAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <Clock size={32} />
                <p>No recent sales</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;