// src/db/sqlite/bulk.js
//
// Fast, transactional catalog writes used by the sync engine.
// One transaction, prepared statements reused for every row.
//
// A "record" looks like:
// {
//   product:       { id, name, sku, description, category, taxRate, cost, baseUnitId, updatedAt } | null,
//   units:         [{ id, productId, name, abbreviation, unitType, conversionQty, price, cost, isBaseUnit, barcode }],
//   branchProduct: { id, productId, branchId, stock, minStock, isAvailable, updatedAt } | null,
//   pharmacy:      { productId, branchProductId, branchId, pp, batches, updatedAt } | null
// }

import { getDb, withTransaction } from './helpers.js';

const n = (v) => (v === undefined ? null : v);

export const clearCatalog = () => {
  const db = getDb();
  withTransaction(() => {
    db.run('DELETE FROM pharmacy_batch_stock');
    db.run('DELETE FROM pharmacy_batch');
    db.run('DELETE FROM pharmacy_product');
    db.run('DELETE FROM branch_products');
    db.run('DELETE FROM product_units');
    db.run('DELETE FROM products');
  });
};

export const applyCatalogRecords = (records) => {
  if (!Array.isArray(records) || records.length === 0) return 0;

  const db = getDb();
  const now = new Date().toISOString();

  const st = {
    product: db.prepare(
      `INSERT OR REPLACE INTO products
        (id, name, sku, description, category, taxRate, cost, baseUnitId, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    unit: db.prepare(
      `INSERT OR REPLACE INTO product_units
        (id, productId, name, abbreviation, unitType, conversionQty, price, cost, isBaseUnit, barcode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    bp: db.prepare(
      `INSERT OR REPLACE INTO branch_products
        (id, productId, branchId, stock, minStock, isAvailable, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ),
    pp: db.prepare(
      `INSERT OR REPLACE INTO pharmacy_product
        (productId, genericName, brandName, strength, dosageForm, route,
         prescriptionCategory, packSize, storageConditions, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    batch: db.prepare(
      `INSERT OR REPLACE INTO pharmacy_batch
        (id, productId, batchNumber, expiryDate, manufacturer, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`
    ),
    stock: db.prepare(
      `INSERT OR REPLACE INTO pharmacy_batch_stock
        (id, batchId, branchProductId, branchId, quantityOnHand, unitCost, sellingPrice, status, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    delStock: db.prepare('DELETE FROM pharmacy_batch_stock WHERE id = ?'),
  };

  try {
    withTransaction(() => {
      let touchedBatches = false;

      for (const r of records) {
        if (r.product) {
          const p = r.product;
          st.product.run([
            p.id, p.name, n(p.sku), n(p.description), n(p.category),
            p.taxRate || 0, p.cost || 0, n(p.baseUnitId), p.updatedAt || now,
          ]);
        }

        for (const u of r.units || []) {
          st.unit.run([
            u.id, u.productId, u.name, u.abbreviation, u.unitType || 'unit',
            u.conversionQty || 1, u.price || 0, u.cost != null ? u.cost : null,
            u.isBaseUnit ? 1 : 0, n(u.barcode),
          ]);
        }

        if (r.branchProduct) {
          const b = r.branchProduct;
          st.bp.run([
            b.id, b.productId, b.branchId, b.stock || 0, b.minStock || 0,
            b.isAvailable ?? 1, b.updatedAt || now,
          ]);
        }

        const ph = r.pharmacy;
        if (ph) {
          const ts = ph.updatedAt || now;

          if (ph.pp && ph.productId) {
            const pp = ph.pp;
            st.pp.run([
              ph.productId, n(pp.genericName), n(pp.brandName), n(pp.strength),
              n(pp.dosageForm), n(pp.route), n(pp.prescriptionCategory),
              n(pp.packSize), n(pp.storageConditions), ts,
            ]);
          }

          // Only touch batches when the server actually sent a batches array.
          if (Array.isArray(ph.batches) && ph.branchProductId && ph.branchId) {
            const keep = new Set();

            for (const b of ph.batches) {
              if (!b?.batchId) continue;

              st.batch.run([
                b.batchId, ph.productId, b.batchNumber, b.expiryDate,
                b.manufacturer || null, ts,
              ]);

              const stockId = b.id || b.batchStockId || `${b.batchId}:${ph.branchProductId}`;
              st.stock.run([
                stockId, b.batchId, ph.branchProductId, ph.branchId,
                Number(b.quantityOnHand || 0), Number(b.unitCost || 0),
                b.sellingPrice != null ? Number(b.sellingPrice) : null,
                b.status || 'AVAILABLE', ts,
              ]);
              keep.add(stockId);
            }

            // Scoped cleanup: remove stock rows for THIS branch product that the
            // server no longer lists. Other products are never touched.
            const existing = db.exec(
              'SELECT id FROM pharmacy_batch_stock WHERE branchProductId = ?',
              [ph.branchProductId]
            );
            for (const row of existing[0]?.values || []) {
              if (!keep.has(row[0])) st.delStock.run([row[0]]);
            }
            touchedBatches = true;
          }
        }
      }

      if (touchedBatches) {
        // Batches that no longer have any stock row anywhere.
        db.run('DELETE FROM pharmacy_batch WHERE id NOT IN (SELECT batchId FROM pharmacy_batch_stock)');
      }
    });
  } finally {
    for (const s of Object.values(st)) {
      try { s.free(); } catch { /* ignore */ }
    }
  }

  return records.length;
};