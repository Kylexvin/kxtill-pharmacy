// src/db/sqlite/sales.js
import { query, run } from './helpers.js';
import { enqueueSync } from './syncQueue.js';

export const createLocalSale = async (sale) => {
  const sql = `
    INSERT OR REPLACE INTO local_sales (
      id, branchId, customerName, customerId, customerTempId,
      items, payments, subtotal, taxAmount, totalAmount, costAmount,
      shiftId,
      status, syncedAt, error, createdAt, updatedAt, serverSaleId, receiptText
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  run(sql, [
    sale.id,
    sale.branchId,
    sale.customerName || null,
    sale.customerId || null,
    sale.customerTempId || null,
    sale.items,
    sale.payments,
    sale.subtotal || 0,
    sale.taxAmount || 0,
    sale.totalAmount || 0,
    sale.costAmount || 0,
    sale.shiftId || null,
    sale.status || 'PENDING',
    sale.syncedAt || null,
    sale.error || null,
    sale.createdAt,
    sale.updatedAt,
    sale.serverSaleId || null,
    sale.receiptText || null,
  ]);
};

export const getLocalSale = async (id) => {
  const results = query('SELECT * FROM local_sales WHERE id = ?', [id]);
  return results.length ? results[0] : null;
};

export const getPendingSales = async () => {
  return query("SELECT * FROM local_sales WHERE status = 'PENDING' ORDER BY createdAt ASC");
};

export const updateSaleStatus = async (id, status, error) => {
  const syncedAt = status === 'SYNCED' ? new Date().toISOString() : null;
  const sql = `
    UPDATE local_sales
    SET status = ?, syncedAt = ?, error = ?, updatedAt = ?
    WHERE id = ?
  `;
  run(sql, [status, syncedAt, error || null, new Date().toISOString(), id]);
};

export const setSaleServerId = async (id, serverSaleId) => {
  run('UPDATE local_sales SET serverSaleId = ?, updatedAt = ? WHERE id = ?',
    [serverSaleId, new Date().toISOString(), id]);
};

export const saveReceiptText = async (id, receiptText) => {
  run('UPDATE local_sales SET receiptText = ?, updatedAt = ? WHERE id = ?',
    [receiptText, new Date().toISOString(), id]);
};

export const getSyncedSalesMissingReceipt = async () => {
  return query(
    "SELECT * FROM local_sales WHERE status = 'SYNCED' AND serverSaleId IS NOT NULL AND (receiptText IS NULL OR receiptText = '')"
  );
};

export const getSaleByServerId = async (serverSaleId) => {
  const results = query('SELECT * FROM local_sales WHERE serverSaleId = ?', [serverSaleId]);
  return results.length ? results[0] : null;
};

export const getSalesWithServerId = async () => {
  return query("SELECT * FROM local_sales WHERE serverSaleId IS NOT NULL ORDER BY createdAt DESC");
};

export const getAllLocalSalesForBranch = async (branchId, options = {}) => {
  const { limit = 50, offset = 0, status, search, startDate, endDate } = options;

  let localSales = query(`
    SELECT 
      id,
      branchId,
      customerName,
      customerId,
      customerTempId,
      items,
      payments,
      subtotal,
      taxAmount,
      totalAmount,
      costAmount,
      shiftId,
      status,
      syncedAt,
      error,
      serverSaleId,
      receiptText,
      createdAt,
      updatedAt
    FROM local_sales 
    WHERE branchId = ?
      AND status IN ('PENDING', 'FAILED')
      AND (serverSaleId IS NULL OR serverSaleId = '')
    ORDER BY createdAt DESC
  `, [branchId]);

  if (status && status !== 'all') {
    localSales = localSales.filter((s) => s.status === status.toUpperCase());
  }

  if (search) {
    const searchLower = search.toLowerCase();
    localSales = localSales.filter((s) =>
      (s.customerName && s.customerName.toLowerCase().includes(searchLower)) ||
      (s.id && s.id.toLowerCase().includes(searchLower))
    );
  }

  if (startDate) {
    const start = new Date(startDate);
    localSales = localSales.filter((s) => new Date(s.createdAt) >= start);
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    localSales = localSales.filter((s) => new Date(s.createdAt) <= end);
  }

  const formattedLocal = localSales.map((sale) => {
    let items = [];
    let payments = [];
    try { items = JSON.parse(sale.items || '[]'); } catch (e) {}
    try { payments = JSON.parse(sale.payments || '[]'); } catch (e) {}

    const isLocalOnly = sale.status === 'PENDING' || sale.status === 'FAILED';

    return {
      id: sale.id,
      reference: sale.serverSaleId || sale.id.slice(0, 8).toUpperCase(),
      customerName: sale.customerName || 'Walk-in Customer',
      customerId: sale.customerId || null,
      customerTempId: sale.customerTempId || null,
      subtotal: sale.subtotal || 0,
      taxAmount: sale.taxAmount || 0,
      discount: 0,
      totalAmount: sale.totalAmount || 0,
      shiftId: sale.shiftId || null,
      status: isLocalOnly ? 'PENDING' : 'COMPLETED',
      paymentStatus: isLocalOnly ? 'PENDING' : 'PAID',
      paymentMethod: payments.length > 0 ? payments[0].method : null,
      itemsCount: items.length,
      items,
      payments,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
      isLocal: true,
      localStatus: sale.status,
      serverSaleId: sale.serverSaleId,
      error: sale.error,
      receiptText: sale.receiptText,
    };
  });

  return {
    items: formattedLocal,
    total: formattedLocal.length,
    limit: limit || 50,
    offset: offset || 0,
  };
};

export const getLocalSaleFormatted = async (saleId) => {
  const localSale = await getLocalSale(saleId);
  if (!localSale) return null;

  let items = [];
  let payments = [];
  try { items = JSON.parse(localSale.items || '[]'); } catch (e) {}
  try { payments = JSON.parse(localSale.payments || '[]'); } catch (e) {}

  return {
    id: localSale.id,
    reference: localSale.serverSaleId || localSale.id.slice(0, 8).toUpperCase(),
    customerName: localSale.customerName || 'Walk-in Customer',
    customerId: localSale.customerId || null,
    customerTempId: localSale.customerTempId || null,
    subtotal: localSale.subtotal || 0,
    taxAmount: localSale.taxAmount || 0,
    discount: 0,
    totalAmount: localSale.totalAmount || 0,
    shiftId: localSale.shiftId || null,
    status: localSale.status === 'PENDING' ? 'PENDING' : 'COMPLETED',
    paymentStatus: localSale.status === 'PENDING' ? 'PENDING' : 'PAID',
    items,
    payments,
    createdAt: localSale.createdAt,
    updatedAt: localSale.updatedAt,
    isLocal: true,
    localStatus: localSale.status,
    serverSaleId: localSale.serverSaleId,
    error: localSale.error,
    receiptText: localSale.receiptText,
  };
};

export const getLocalSaleByServerId = async (serverSaleId) => {
  const results = query('SELECT * FROM local_sales WHERE serverSaleId = ?', [serverSaleId]);
  if (results.length === 0) return null;

  const localSale = results[0];

  let items = [];
  let payments = [];
  try { items = JSON.parse(localSale.items || '[]'); } catch (e) {}
  try { payments = JSON.parse(localSale.payments || '[]'); } catch (e) {}

  return {
    id: localSale.id,
    reference: localSale.serverSaleId || localSale.id.slice(0, 8).toUpperCase(),
    customerName: localSale.customerName || 'Walk-in Customer',
    customerId: localSale.customerId || null,
    customerTempId: localSale.customerTempId || null,
    subtotal: localSale.subtotal || 0,
    taxAmount: localSale.taxAmount || 0,
    discount: 0,
    totalAmount: localSale.totalAmount || 0,
    shiftId: localSale.shiftId || null,
    status: 'COMPLETED',
    paymentStatus: 'PAID',
    items,
    payments,
    createdAt: localSale.createdAt,
    updatedAt: localSale.updatedAt,
    isLocal: true,
    localStatus: localSale.status,
    serverSaleId: localSale.serverSaleId,
    error: localSale.error,
    receiptText: localSale.receiptText,
  };
};

export const retryLocalSale = async (saleId) => {
  const result = query('SELECT status FROM local_sales WHERE id = ?', [saleId]);
  if (result.length === 0) throw new Error('Sale not found');
  if (result[0].status !== 'FAILED') throw new Error('Sale is not in failed state');

  run(`
    UPDATE local_sales 
    SET status = 'PENDING', error = NULL, updatedAt = ?
    WHERE id = ?
  `, [new Date().toISOString(), saleId]);

  const sale = await getLocalSale(saleId);
  if (sale) {
    let items = [];
    let payments = [];
    try { items = JSON.parse(sale.items || '[]'); } catch (e) {}
    try { payments = JSON.parse(sale.payments || '[]'); } catch (e) {}

    await enqueueSync('sale', saleId, 'CREATE', {
      clientSaleId: saleId,
      branchId: sale.branchId,
      customerName: sale.customerName,
      customerId: sale.customerId || null,
      customerTempId: sale.customerTempId || null,
      items,
      paymentMethod: payments[0]?.method || 'CASH',
      paymentReference: payments[0]?.reference || null,
      shiftId: sale.shiftId || null,
    });
  }

  return { success: true };
};

export const getPendingSalesCount = async (branchId) => {
  const result = query(`
    SELECT COUNT(*) as count 
    FROM local_sales 
    WHERE branchId = ? AND status = 'PENDING'
  `, [branchId]);
  return result.length > 0 ? result[0].count : 0;
};

export const getFailedSalesCount = async (branchId) => {
  const result = query(`
    SELECT COUNT(*) as count 
    FROM local_sales 
    WHERE branchId = ? AND status = 'FAILED'
  `, [branchId]);
  return result.length > 0 ? result[0].count : 0;
};