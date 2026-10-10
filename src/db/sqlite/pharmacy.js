// src/db/sqlite/pharmacy.js
//
// Local SQLite cache of pharmacy data.
// Read-only mirror of the server's pharmacy state — used by POS for
// offline FEFO, expiry display, and (future) offline batch allocation.
//
// Write functions are called exclusively by the sync engine.

import { query, runNoSave, saveToStore } from './helpers.js';

// ============================================================
// PHARMACY PRODUCT METADATA
// ============================================================

export const upsertPharmacyProduct = (pp) => {
  runNoSave(
    `INSERT OR REPLACE INTO pharmacy_product (
      productId, genericName, brandName, strength, dosageForm, route,
      prescriptionCategory, packSize, storageConditions, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      pp.productId,
      pp.genericName || null,
      pp.brandName || null,
      pp.strength || null,
      pp.dosageForm || null,
      pp.route || null,
      pp.prescriptionCategory || null,
      pp.packSize || null,
      pp.storageConditions || null,
      pp.updatedAt || new Date().toISOString(),
    ]
  );
};

export const getPharmacyProduct = (productId) => {
  const rows = query('SELECT * FROM pharmacy_product WHERE productId = ?', [productId]);
  return rows.length ? rows[0] : null;
};

export const getPharmacyProductsByProductIds = (productIds) => {
  if (!productIds?.length) return {};
  const placeholders = productIds.map(() => '?').join(',');
  const rows = query(
    `SELECT * FROM pharmacy_product WHERE productId IN (${placeholders})`,
    productIds
  );
  return Object.fromEntries(rows.map((r) => [r.productId, r]));
};

export const clearPharmacyProducts = () => {
  runNoSave('DELETE FROM pharmacy_product');
};

// ============================================================
// PHARMACY BATCHES
// ============================================================

export const upsertPharmacyBatch = (batch) => {
  runNoSave(
    `INSERT OR REPLACE INTO pharmacy_batch (
      id, productId, batchNumber, expiryDate, manufacturer, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      batch.id,
      batch.productId,
      batch.batchNumber,
      batch.expiryDate,
      batch.manufacturer || null,
      batch.updatedAt || new Date().toISOString(),
    ]
  );
};

export const getPharmacyBatch = (id) => {
  const rows = query('SELECT * FROM pharmacy_batch WHERE id = ?', [id]);
  return rows.length ? rows[0] : null;
};

export const getBatchesForProduct = (productId) => {
  return query(
    'SELECT * FROM pharmacy_batch WHERE productId = ? ORDER BY expiryDate ASC',
    [productId]
  );
};

export const clearPharmacyBatches = () => {
  runNoSave('DELETE FROM pharmacy_batch');
};

export const deleteBatchesNotIn = (ids) => {
  const keep = new Set((ids || []).filter(Boolean));
  const rows = query('SELECT id FROM pharmacy_batch');
  let removed = 0;
  for (const row of rows) {
    if (!keep.has(row.id)) {
      runNoSave('DELETE FROM pharmacy_batch WHERE id = ?', [row.id]);
      removed++;
    }
  }
  return removed;
};

// ============================================================
// PHARMACY BATCH STOCK
// ============================================================

export const upsertPharmacyBatchStock = (bs) => {
  runNoSave(
    `INSERT OR REPLACE INTO pharmacy_batch_stock (
      id, batchId, branchProductId, branchId,
      quantityOnHand, unitCost, sellingPrice, status, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      bs.id,
      bs.batchId,
      bs.branchProductId,
      bs.branchId,
      bs.quantityOnHand ?? 0,
      bs.unitCost ?? 0,
      bs.sellingPrice ?? null,
      bs.status || 'AVAILABLE',
      bs.updatedAt || new Date().toISOString(),
    ]
  );
};

export const getBatchStock = (batchId, branchProductId) => {
  const rows = query(
    'SELECT * FROM pharmacy_batch_stock WHERE batchId = ? AND branchProductId = ?',
    [batchId, branchProductId]
  );
  return rows.length ? rows[0] : null;
};

// FEFO candidates for a product at a branch — stock > 0, AVAILABLE, not expired.
export const getSellableBatchesForProduct = (productId, branchId) => {
  return query(
    `SELECT
       bs.id AS batchStockId,
       bs.batchId,
       bs.branchProductId,
       bs.quantityOnHand,
       bs.unitCost,
       bs.sellingPrice,
       bs.status,
       b.batchNumber,
       b.expiryDate,
       b.manufacturer
     FROM pharmacy_batch_stock bs
     JOIN pharmacy_batch b ON b.id = bs.batchId
     WHERE b.productId = ?
       AND bs.branchId = ?
       AND bs.quantityOnHand > 0
       AND bs.status = 'AVAILABLE'
       AND b.expiryDate > ?
     ORDER BY b.expiryDate ASC`,
    [productId, branchId, new Date().toISOString()]
  );
};

export const getBatchStockForBranchProduct = (branchProductId) => {
  return query(
    `SELECT
       bs.*,
       b.batchNumber,
       b.expiryDate,
       b.manufacturer
     FROM pharmacy_batch_stock bs
     JOIN pharmacy_batch b ON b.id = bs.batchId
     WHERE bs.branchProductId = ?
       AND bs.quantityOnHand > 0
     ORDER BY b.expiryDate ASC`,
    [branchProductId]
  );
};

export const clearPharmacyBatchStock = () => {
  runNoSave('DELETE FROM pharmacy_batch_stock');
};

export const deleteBatchStockNotIn = (ids) => {
  const keep = new Set((ids || []).filter(Boolean));
  const rows = query('SELECT id FROM pharmacy_batch_stock');
  let removed = 0;
  for (const row of rows) {
    if (!keep.has(row.id)) {
      runNoSave('DELETE FROM pharmacy_batch_stock WHERE id = ?', [row.id]);
      removed++;
    }
  }
  return removed;
};

// ============================================================
// DETECTION
// ============================================================

// True if any of the given productIds is pharmacy-tracked in local cache.
// Used by sync to route sales to the pharmacy endpoint.
export const isAnyProductPharmacy = (productIds) => {
  if (!Array.isArray(productIds) || productIds.length === 0) return false;
  try {
    const placeholders = productIds.map(() => '?').join(',');
    const rows = query(
      `SELECT productId FROM pharmacy_product WHERE productId IN (${placeholders})`,
      productIds
    );
    return rows.length > 0;
  } catch {
    return false;
  }
};

// ============================================================
// BULK / CLEANUP
// ============================================================

export const clearAllPharmacyData = () => {
  runNoSave('DELETE FROM pharmacy_batch_stock');
  runNoSave('DELETE FROM pharmacy_batch');
  runNoSave('DELETE FROM pharmacy_product');
};

export const flushPharmacy = () => {
  saveToStore();
};