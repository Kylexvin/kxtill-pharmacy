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