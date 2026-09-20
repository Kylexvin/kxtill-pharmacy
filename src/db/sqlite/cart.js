// src/db/sqlite/cart.js
import { query, run } from './helpers.js';

export const saveCart = async (cart) => {
  run('DELETE FROM cart WHERE branchId = ?', [cart.branchId]);
  const sql = `
    INSERT INTO cart (
      branchId,
      customerName,
      customerId,
      customerTempId,
      customerPhone,
      items,
      total,
      updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  run(sql, [
    cart.branchId,
    cart.customerName || null,
    cart.customerId || null,
    cart.customerTempId || null,
    cart.customerPhone || null,
    cart.items,
    cart.total || 0,
    cart.updatedAt,
  ]);
};

export const getActiveCart = async (branchId) => {
  const results = query('SELECT * FROM cart WHERE branchId = ? LIMIT 1', [branchId]);
  return results.length ? results[0] : null;
};

export const clearCart = async (branchId) => {
  run('DELETE FROM cart WHERE branchId = ?', [branchId]);
};