// src/db/sqlite/products.js
import { query, runNoSave } from './helpers.js';

export const upsertProduct = async (product) => {
  const sql = `
    INSERT OR REPLACE INTO products (
      id, name, sku, description, category, taxRate, cost, baseUnitId, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  runNoSave(sql, [
    product.id,
    product.name,
    product.sku || null,
    product.description || null,
    product.category || null,
    product.taxRate || 0,
    product.cost || 0,
    product.baseUnitId || null,
    product.updatedAt,
  ]);
};


export const getProduct = async (id) => {
  const results = query('SELECT * FROM products WHERE id = ?', [id]);
  return results.length ? results[0] : null;
};

export const getAllProducts = async () => {
  const products = query('SELECT * FROM products ORDER BY name ASC');
  for (const product of products) {
    const units = query('SELECT * FROM product_units WHERE productId = ?', [product.id]);
    product.units = units;
  }
  return products;
};

export const clearProducts = async () => {
  runNoSave('DELETE FROM products');
};

export const upsertProductUnit = async (unit) => {
  const sql = `
    INSERT OR REPLACE INTO product_units (
      id, productId, name, abbreviation, unitType,
      conversionQty, price, cost, isBaseUnit, barcode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  runNoSave(sql, [
    unit.id,
    unit.productId,
    unit.name,
    unit.abbreviation,
    unit.unitType,
    unit.conversionQty || 1,
    unit.price || 0,
    unit.cost != null ? Number(unit.cost) : null,
    unit.isBaseUnit || 0,
    unit.barcode || null,
  ]);
};

export const getProductUnits = async (productId) => {
  return query('SELECT * FROM product_units WHERE productId = ?', [productId]);
};

export const clearProductUnits = async () => {
  runNoSave('DELETE FROM product_units');
};