// src/db/sqlite/syncQueue.js
import { query, run } from './helpers.js';

export const enqueueSync = async (entityType, entityId, operation, payload) => {
  const now = new Date().toISOString();
  const sql = `
    INSERT INTO sync_queue (entityType, entityId, operation, payload, status, attempts, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  run(sql, [
    entityType,
    entityId,
    operation,
    JSON.stringify(payload),
    'PENDING',
    0,
    now,
    now,
  ]);
};

export const getPendingSyncItems = async (limit = 50) => {
  return query(`
    SELECT * FROM sync_queue
    WHERE status = 'PENDING'
      AND (nextRetryAt IS NULL OR nextRetryAt <= datetime('now'))
    ORDER BY createdAt ASC
    LIMIT ?
  `, [limit]);
};

export const updateSyncItemStatus = async (id, status, error) => {
  const now = new Date().toISOString();
  const sql = `
    UPDATE sync_queue
    SET status = ?, lastAttemptAt = ?, error = ?, attempts = attempts + 1, updatedAt = ?
    WHERE id = ?
  `;
  run(sql, [status, now, error || null, now, id]);
};

export const markAllFailedForRetry = async () => {
  const now = new Date().toISOString();
  const retryAfter = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  run(`
    UPDATE sync_queue
    SET status = 'PENDING', nextRetryAt = ?, updatedAt = ?
    WHERE status = 'FAILED'
  `, [retryAfter, now]);
};