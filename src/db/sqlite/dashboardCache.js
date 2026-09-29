// src/db/sqlite/dashboardCache.js
import { query, runNoSave, saveToStore } from './helpers.js';

export const saveDashboardSnapshot = (orgId, branchId, payload) => {
  const now = new Date().toISOString();
  const key = `${orgId}:${branchId || 'all'}`;
  runNoSave(
    `INSERT OR REPLACE INTO dashboard_cache (cacheKey, payload, updatedAt) VALUES (?, ?, ?)`,
    [key, JSON.stringify(payload), now]
  );
  saveToStore();
};

export const readDashboardSnapshot = (orgId, branchId) => {
  const key = `${orgId}:${branchId || 'all'}`;
  const rows = query(
    'SELECT payload FROM dashboard_cache WHERE cacheKey = ?',
    [key]
  );
  if (!rows.length) return null;
  try {
    return JSON.parse(rows[0].payload);
  } catch {
    return null;
  }
};

// ---------- Local pending sales overlay ----------
// Adds pending local sales to the cached server snapshot so the dashboard
// reflects sales that haven't synced yet. Trends and top products stay
// server-only — they're bucketed server-side and can't be reconstructed
// locally without re-implementing the report logic.

const getPendingLocalSalesForBranch = (branchId, period) => {
  if (!branchId) return [];
  const now = new Date();
  let startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);

  if (period === 'week') {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
  } else if (period === 'month') {
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    startDate.setHours(0, 0, 0, 0);
  }

  return query(
    `SELECT totalAmount, costAmount, createdAt FROM local_sales
     WHERE branchId = ? AND status = 'PENDING' AND createdAt >= ?`,
    [branchId, startDate.toISOString()]
  );
};

export const readDashboardSnapshotWithDelta = (
  orgId,
  branchId,
  period = 'today'
) => {
  const cached = readDashboardSnapshot(orgId, branchId);
  const base = cached?.[period] || null;

  const pending = getPendingLocalSalesForBranch(branchId, period);
  if (pending.length === 0) {
    return { snapshot: base, pendingCount: 0, pendingRevenue: 0, pendingCost: 0 };
  }

  const pendingRevenue = pending.reduce(
    (sum, s) => sum + (Number(s.totalAmount) || 0),
    0
  );
  const pendingCost = pending.reduce(
    (sum, s) => sum + (Number(s.costAmount) || 0),
    0
  );
  const pendingProfit = pendingRevenue - pendingCost;
  const pendingCount = pending.length;

  const merged = base
    ? (() => {
        const baseRevenue = Number(base.profit?.revenue) || 0;
        const baseCost = Number(base.profit?.cost) || 0;
        const baseProfit = Number(base.profit?.profit) || 0;
        const mergedRevenue = baseRevenue + pendingRevenue;
        const mergedCost = baseCost + pendingCost;
        const mergedProfit = baseProfit + pendingProfit;
        const margin =
          mergedRevenue > 0 ? (mergedProfit / mergedRevenue) * 100 : 0;

        return {
          ...base,
          profit: {
            ...base.profit,
            revenue: mergedRevenue,
            cost: mergedCost,
            profit: mergedProfit,
            margin,
            salesCount: (Number(base.profit?.salesCount) || 0) + pendingCount,
          },
          recentSalesCount:
            (Number(base.recentSalesCount) || 0) + pendingCount,
        };
      })()
    : {
        branchId,
        period,
        profit: {
          period,
          startDate: null,
          revenue: pendingRevenue,
          cost: pendingCost,
          profit: pendingProfit,
          margin:
            pendingRevenue > 0 ? (pendingProfit / pendingRevenue) * 100 : 0,
          salesCount: pendingCount,
        },
        salesTrend: { labels: [], values: [] },
        todayTrend: { labels: [], values: [] },
        topProducts: [],
        lowStockCount: 0,
        recentSalesCount: pendingCount,
        serverTime: null,
      };

  return {
    snapshot: merged,
    pendingCount,
    pendingRevenue,
    pendingCost,
  };
};