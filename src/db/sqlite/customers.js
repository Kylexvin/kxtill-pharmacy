// src/db/sqlite/customers.js
import { query, run, runNoSave } from './helpers.js';

export const upsertLocalCustomer = async (customer) => {
  const now = new Date().toISOString();
  const sql = `
    INSERT OR REPLACE INTO local_customers
      (id, serverId, name, phone, email, isSynced, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  run(sql, [
    customer.id,
    customer.serverId || null,
    customer.name,
    customer.phone || null,
    customer.email || null,
    customer.isSynced ? 1 : 0,
    customer.createdAt || now,
    customer.updatedAt || now,
  ]);
};

export const upsertServerCustomer = async (customer) => {
  if (!customer?.id) return;

  const byServerId = query(
    `SELECT id FROM local_customers WHERE serverId = ? LIMIT 1`,
    [customer.id]
  );

  if (byServerId.length) {
    const localId = byServerId[0].id;
    const now = new Date().toISOString();
    run(`
      UPDATE local_customers
      SET name = ?, phone = ?, email = ?, isSynced = 1, updatedAt = ?
      WHERE id = ?
    `, [
      customer.name,
      customer.phone || null,
      customer.email || null,
      customer.updatedAt || now,
      localId,
    ]);
    return;
  }

  if (customer.phone) {
    const existing = query(
      `SELECT id, isSynced FROM local_customers WHERE phone = ? LIMIT 1`,
      [customer.phone]
    );
    if (existing.length && existing[0].isSynced === 0) {
      return;
    }
  }

  const now = new Date().toISOString();
  run(`
    INSERT OR REPLACE INTO local_customers
      (id, serverId, name, phone, email, isSynced, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `, [
    customer.id,
    customer.id,
    customer.name,
    customer.phone || null,
    customer.email || null,
    customer.createdAt || now,
    customer.updatedAt || now,
  ]);
};

export const searchLocalCustomers = async (searchTerm) => {
  if (!searchTerm || !searchTerm.trim()) return [];
  const like = `%${searchTerm.trim().toLowerCase()}%`;
  const phoneLike = `%${searchTerm.trim()}%`;

  const rows = query(`
    SELECT id, serverId, name, phone, email, isSynced, createdAt, updatedAt
    FROM local_customers
    WHERE LOWER(name) LIKE ? OR phone LIKE ?
    ORDER BY name ASC
    LIMIT 20
  `, [like, phoneLike]);

  return rows.map((r) => ({
    id: r.id,
    serverId: r.serverId,
    name: r.name,
    phone: r.phone,
    email: r.email,
    isSynced: r.isSynced === 1,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
};

export const getLocalCustomerByTempId = async (tempId) => {
  const rows = query('SELECT * FROM local_customers WHERE id = ?', [tempId]);
  if (!rows.length) return null;
  const r = rows[0];
  return { ...r, isSynced: r.isSynced === 1 };
};

export const getUnsyncedCustomers = async () => {
  const rows = query(`
    SELECT id, serverId, name, phone, email, isSynced, createdAt, updatedAt
    FROM local_customers
    WHERE isSynced = 0
    ORDER BY createdAt ASC
  `);
  return rows.map((r) => ({
    id: r.id,
    serverId: r.serverId,
    name: r.name,
    phone: r.phone,
    email: r.email,
    isSynced: r.isSynced === 1,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
};

export const markCustomerSynced = async (tempId, serverId) => {
  run(`
    UPDATE local_customers
    SET serverId = ?, isSynced = 1, updatedAt = ?
    WHERE id = ?
  `, [serverId, new Date().toISOString(), tempId]);
};

export const replaceCustomerIdInSales = async (tempId, serverId) => {
  run(`
    UPDATE local_sales
    SET customerId = ?, customerTempId = NULL, updatedAt = ?
    WHERE customerTempId = ?
  `, [serverId, new Date().toISOString(), tempId]);
};

export const clearLocalCustomers = async () => {
  runNoSave('DELETE FROM local_customers');
};