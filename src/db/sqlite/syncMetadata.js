// src/db/sqlite/syncMetadata.js
import { query, run } from './helpers.js';

export const getSyncMetadata = async (key) => {
  const results = query('SELECT value FROM sync_metadata WHERE key = ?', [key]);
  return results.length ? results[0].value : null;
};

export const setSyncMetadata = async (key, value) => {
  const now = new Date().toISOString();
  const sql = `
    INSERT OR REPLACE INTO sync_metadata (key, value, updatedAt)
    VALUES (?, ?, ?)
  `;
  run(sql, [key, value, now]);
};

export const getLastProductSync = async () => getSyncMetadata('last_product_sync');
export const setLastProductSync = async (value) => setSyncMetadata('last_product_sync', value);

export const getLastBranchSync = async () => getSyncMetadata('last_branch_sync');
export const setLastBranchSync = async (value) => setSyncMetadata('last_branch_sync', value);

export const getLastCustomerSync = async () => getSyncMetadata('last_customer_sync');
export const setLastCustomerSync = async (value) => setSyncMetadata('last_customer_sync', value);