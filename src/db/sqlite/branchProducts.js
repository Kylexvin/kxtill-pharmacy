// src/db/sqlite/branchProducts.js
import { query, runNoSave, saveToStore } from './helpers.js';

export const upsertBranchProduct = async (bp) => {
  const sql = `
    INSERT OR REPLACE INTO branch_products (id, productId, branchId, stock, minStock, isAvailable, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  runNoSave(sql, [
    bp.id,
    bp.productId,
    bp.branchId,
    bp.stock || 0,
    bp.minStock || 0,
    bp.isAvailable ?? 1,
    bp.updatedAt,
  ]);
};

export const getBranchProducts = async (branchId) => {
  const results = query(`
    SELECT 
      bp.id,
      bp.productId,
      bp.branchId,
      bp.stock,
      bp.minStock,
      bp.isAvailable,
      bp.updatedAt,
      p.name,
      p.sku,
      p.category,
      p.description,
      p.taxRate
    FROM branch_products bp
    LEFT JOIN products p ON bp.productId = p.id
    WHERE bp.branchId = ?
  `, [branchId]);

  for (const bp of results) {
    bp.isAvailable = Number(bp.isAvailable);
    const units = query('SELECT * FROM product_units WHERE productId = ?', [bp.productId]);
    bp.units = units;
  }

  return results;
};

export const getBranchProduct = async (id) => {
  const results = query('SELECT * FROM branch_products WHERE id = ?', [id]);
  return results.length ? results[0] : null;
};

export const clearBranchProducts = async () => {
  runNoSave('DELETE FROM branch_products');
};

export const deleteBranchProductsNotIn = async (branchId, ids) => {
  if (!branchId || !Array.isArray(ids)) return 0;
  const keep = new Set(ids.filter(Boolean));
  const rows = query('SELECT id FROM branch_products WHERE branchId = ?', [branchId]);
  let removed = 0;
  for (const row of rows) {
    if (!keep.has(row.id)) {
      runNoSave('DELETE FROM branch_products WHERE id = ?', [row.id]);
      removed++;
    }
  }
  return removed;
};

export const decrementBranchProductStock = async (branchProductId, amount) => {
  const baseQty = Number(amount || 0);
  if (!branchProductId || baseQty <= 0) return;

  const rows = query(
    'SELECT stock FROM branch_products WHERE id = ?',
    [branchProductId]
  );
  if (!rows.length) return;

  const current = Number(rows[0].stock || 0);
  const next = Math.max(0, current - baseQty);
  runNoSave(
    'UPDATE branch_products SET stock = ?, updatedAt = ? WHERE id = ?',
    [next, new Date().toISOString(), branchProductId]
  );
};

export const flushBranchProducts = () => {
  saveToStore();
};