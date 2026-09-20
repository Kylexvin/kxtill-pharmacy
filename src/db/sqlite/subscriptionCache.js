// src/db/sqlite/subscriptionCache.js
import { query, run } from './helpers.js';

export const setCachedSubscription = async (organizationId, payload) => {
  const now = new Date().toISOString();
  run(
    `INSERT OR REPLACE INTO subscription_cache (organizationId, payload, updatedAt)
     VALUES (?, ?, ?)`,
    [organizationId, JSON.stringify(payload), now]
  );
};

export const getCachedSubscription = async (organizationId) => {
  const rows = query(
    'SELECT payload, updatedAt FROM subscription_cache WHERE organizationId = ?',
    [organizationId]
  );
  if (!rows.length) return null;
  try {
    return { ...JSON.parse(rows[0].payload), _cachedAt: rows[0].updatedAt };
  } catch {
    return null;
  }
};

export const clearCachedSubscription = async (organizationId) => {
  run('DELETE FROM subscription_cache WHERE organizationId = ?', [organizationId]);
};