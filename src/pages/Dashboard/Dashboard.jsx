// src/pages/Dashboard/Dashboard.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useSettings } from '../../contexts/SettingsContext';
import {
  RefreshCw, Award, BarChart3, Building2,
  WifiOff, Plus, FileText,
  Package as PackageIcon, Store,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import styles from './Dashboard.module.css';
import { readDashboardSnapshotWithDelta } from '../../db/sqlite/dashboardCache.js';
import { sync } from '../../sync/engine';
import StatsGrid from './components/StatsGrid';
import CountersGrid from './components/CountersGrid';

const PERIODS = ['today', 'week', 'month'];

const toNumber = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const formatFreshness = (iso) => {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const {
    activeOrganization,
    activeBranch,
    isOffline: contextIsOffline,
  } = useAuth();
  const { isOwner } = usePermissions();
  const { formatCurrency, formatCompactCurrency } = useSettings();

  const [period, setPeriod] = useState('today');
  const [snapshot, setSnapshot] = useState(null);
  const [freshness, setFreshness] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const orgId = activeOrganization?.id;
  const branchId = activeBranch?.id;
  const canViewAllBranches = isOwner;

  // ---------- read from cache ----------
  const readCache = useCallback(() => {
    if (!orgId || !branchId) {
      setSnapshot(null);
      setFreshness(null);
      setPendingCount(0);
      return;
    }
    const result = readDashboardSnapshotWithDelta(orgId, branchId, period);
    if (result?.snapshot) {
      setSnapshot(result.snapshot);
      setFreshness(result.snapshot.serverTime || null);
      setPendingCount(result.pendingCount || 0);
    } else {
      setSnapshot(null);
      setFreshness(null);
      setPendingCount(0);
    }
  }, [orgId, branchId, period]);

  useEffect(() => {
    readCache();
  }, [readCache]);

  // Re-read whenever a sync finishes (engine pulls fresh snapshot)
  useEffect(() => {
    const handler = () => readCache();
    window.addEventListener('kxtill:sync-complete', handler);
    return () => window.removeEventListener('kxtill:sync-complete', handler);
  }, [readCache]);

  const handleRefresh = useCallback(async () => {
    if (!branchId || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await sync(branchId);
    } catch {
      // engine surfaces errors via sync-complete
    } finally {
      setIsRefreshing(false);
      readCache();
    }
  }, [branchId, isRefreshing, readCache]);

  const handleBranchViewAll = useCallback(() => {
    // All-branch aggregate lives in the suite, not on the POS.
    // Kept as a UX affordance: if you want to wire a link later, do it here.
    navigate('/reports');
  }, [navigate]);

  const showOffline = contextIsOffline;

  // ---------- derived ----------
  const profitData = useMemo(() => {
    if (!snapshot?.profit) {
      return {
        period,
        startDate: null,
        revenue: 0,
        cost: 0,
        profit: 0,
        margin: 0,
        salesCount: 0,
      };
    }
    return {
      period: snapshot.profit.period || period,
      startDate: snapshot.profit.startDate || null,
      revenue: toNumber(snapshot.profit.revenue),
      cost: toNumber(snapshot.profit.cost),
      profit: toNumber(snapshot.profit.profit),
      margin: toNumber(snapshot.profit.margin),
      salesCount: toNumber(snapshot.profit.salesCount),
    };
  }, [snapshot, period]);

  const chartData = useMemo(() => {
    if (!snapshot) return [];
    const trend = period === 'today' ? snapshot.todayTrend : snapshot.salesTrend;
    if (!trend?.labels || !trend?.values) return [];
    return trend.labels.map((label, i) => ({
      name: label,
      sales: toNumber(trend.values[i]),
    }));
  }, [snapshot, period]);

  const topProducts = useMemo(
    () => (Array.isArray(snapshot?.topProducts) ? snapshot.topProducts : []),
    [snapshot]
  );

  const lowStockCount = toNumber(snapshot?.lowStockCount);
  const recentSalesCount = toNumber(snapshot?.recentSalesCount);

  const hasSalesData = chartData.some((d) => d.sales > 0);
  const shouldShowChart =
    period === 'today'
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

  const hasAnyData = !!snapshot;

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
          <span className={styles.branchTitle}>
            {activeBranch?.name || activeOrganization?.name || 'Dashboard'}
          </span>
        </div>

        <div className={styles.headerRight}>
          {canViewAllBranches && (
            <button
              type="button"
              className={styles.branchSelector}
              onClick={handleBranchViewAll}
              title="All-branch reports are available in the suite"
              style={{ cursor: 'pointer', border: 'none', background: 'transparent' }}
            >
              <Building2 size={14} />
              <span style={{ marginLeft: 6, fontSize: 12 }}>All branches →</span>
            </button>
          )}

          {showOffline && (
            <span className={styles.offlineBadge}>
              <WifiOff size={14} />
              Offline
            </span>
          )}

          <div className={styles.periodSelector}>
            {PERIODS.map((p) => (
              <button
                key={p}
                className={`${styles.periodBtn} ${period === p ? styles.active : ''}`}
                onClick={() => setPeriod(p)}
              >
                {p === 'today' ? 'Today' : p === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>

          <button
            className={styles.refreshBtn}
            onClick={handleRefresh}
            disabled={isRefreshing || showOffline}
          >
            <RefreshCw size={14} className={isRefreshing ? styles.spinning : ''} />
            {isRefreshing ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      {!hasAnyData ? (
        <div className={styles.emptyState} style={{ padding: '60px 24px' }}>
          <BarChart3 size={48} />
          <h3>No dashboard data yet</h3>
          <p style={{ maxWidth: 380, margin: '8px auto 0', lineHeight: 1.5 }}>
            {showOffline
              ? 'Reconnect to load your branch summary.'
              : 'Hit Refresh to pull the latest numbers for this branch.'}
          </p>
          {!showOffline && (
            <button
              className={styles.quickActionBtn}
              style={{ marginTop: 20 }}
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw size={16} />
              {isRefreshing ? 'Loading…' : 'Load now'}
            </button>
          )}
        </div>
      ) : (
        <>
          <StatsGrid
            loading={false}
            profitData={profitData}
            periodLabel={getPeriodLabel()}
            offlineTag={showOffline ? 'offline' : null}
            formatCompactCurrency={formatCompactCurrency}
          />

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>
                <BarChart3 size={18} />
                <span>Sales Trend</span>
              </div>
              <span className={styles.cardSubtitle}>
                {period === 'today' ? 'Hourly' : getPeriodLabel()}
              </span>
            </div>
            <div className={styles.cardBody}>
              {shouldShowChart ? (
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
                      interval={period === 'today' ? Math.floor(chartData.length / 8) : 0}
                    />
                    <YAxis
                      stroke="#6b7280"
                      fontSize={11}
                      tickFormatter={(value) => formatCompactCurrency(value)}
                    />
                    <Tooltip
                      content={({ active, payload, label }) =>
                        active && payload && payload.length ? (
                          <div className={styles.customTooltip}>
                            <p className={styles.customTooltipLabel}>{label}</p>
                            <p className={styles.customTooltipValue}>
                              {formatCurrency(payload[0].value)}
                            </p>
                          </div>
                        ) : null
                      }
                    />
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
                  <p>{showOffline ? 'Chart not available offline' : 'No sales in this period'}</p>
                  <span>
                    {showOffline
                      ? 'Reconnect to load the trend'
                      : 'Try a wider period, or make a new sale'}
                  </span>
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

          {pendingCount > 0 && (
            <div
              style={{
                textAlign: 'right',
                fontSize: 11,
                color: '#f59e0b',
                padding: '8px 4px 0',
              }}
            >
              + {pendingCount} local sale{pendingCount > 1 ? 's' : ''} not yet synced
            </div>
          )}

          {freshness && (
            <div
              style={{
                textAlign: 'right',
                fontSize: 11,
                color: '#6b7280',
                padding: '4px 4px 0',
              }}
            >
              Last updated {formatFreshness(freshness)}
              {showOffline ? ' · offline' : ''}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;