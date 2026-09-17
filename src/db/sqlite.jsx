// src/db/sqlite.js
import initSqlJs from 'sql.js';

let db = null;

export const initDb = async () => {
  if (db) return db;

  try {
    const SQL = await initSqlJs({
      locateFile: () => '/sql-wasm.wasm'
    });

    const saved = localStorage.getItem('kxtill_db');
    if (saved) {
      const bytes = new Uint8Array(JSON.parse(saved));
      db = new SQL.Database(bytes);
    } else {
      db = new SQL.Database();
    }

    await createTables();
    return db;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
};

export const saveToStore = () => {
  if (!db) return;
  try {
    const data = db.export();
    const bytes = Array.from(data);
    localStorage.setItem('kxtill_db', JSON.stringify(bytes));
  } catch (err) {
    console.error('saveToStore failed:', err);
  }
};

export const resetDb = async () => {
  if (db) {
    db.close();
    db = null;
  }
  localStorage.removeItem('kxtill_db');
  await initDb();
};

const createTables = async () => {
  if (!db) throw new Error('Database not initialized');

  const queries = [
    `CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT,
      description TEXT,
      category TEXT,
      taxRate REAL DEFAULT 0,
      baseUnitId TEXT,
      updatedAt TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS product_units (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      name TEXT NOT NULL,
      abbreviation TEXT NOT NULL,
      unitType TEXT NOT NULL,
      conversionQty REAL DEFAULT 1,
      price REAL,
      isBaseUnit INTEGER DEFAULT 0,
      barcode TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS branch_products (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      branchId TEXT NOT NULL,
      stock REAL DEFAULT 0,
      minStock REAL DEFAULT 0,
      isAvailable INTEGER DEFAULT 1,
      updatedAt TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS cart (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branchId TEXT NOT NULL,
      customerName TEXT,
      items TEXT NOT NULL,
      total REAL DEFAULT 0,
      updatedAt TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS local_sales (
      id TEXT PRIMARY KEY,
      branchId TEXT NOT NULL,
      customerName TEXT,
      items TEXT NOT NULL,
      payments TEXT NOT NULL,
      subtotal REAL DEFAULT 0,
      taxAmount REAL DEFAULT 0,
      totalAmount REAL DEFAULT 0,
      status TEXT DEFAULT 'PENDING',
      syncedAt TEXT,
      error TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      attempts INTEGER DEFAULT 0,
      lastAttemptAt TEXT,
      nextRetryAt TEXT,
      error TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS local_customers (
      id TEXT PRIMARY KEY,
      serverId TEXT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      isSynced INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_local_sales_status ON local_sales(status);`,
    `CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);`,
    `CREATE INDEX IF NOT EXISTS idx_branch_products_branch ON branch_products(branchId);`,
    `CREATE INDEX IF NOT EXISTS idx_cart_branch ON cart(branchId);`,
    `CREATE INDEX IF NOT EXISTS idx_local_customers_phone ON local_customers(phone);`,
    `CREATE INDEX IF NOT EXISTS idx_local_customers_name ON local_customers(name);`,
    `CREATE INDEX IF NOT EXISTS idx_local_customers_unsynced ON local_customers(isSynced);`,
    `ALTER TABLE local_sales ADD COLUMN serverSaleId TEXT;`,
    `ALTER TABLE local_sales ADD COLUMN receiptText TEXT;`,
    `ALTER TABLE local_sales ADD COLUMN customerId TEXT;`,
    `ALTER TABLE local_sales ADD COLUMN customerTempId TEXT;`,
    `CREATE INDEX IF NOT EXISTS idx_local_sales_server_sale_id ON local_sales(serverSaleId);`,
    `CREATE INDEX IF NOT EXISTS idx_local_sales_customer_temp ON local_sales(customerTempId);`,
    `ALTER TABLE cart ADD COLUMN customerId TEXT;`,
    `ALTER TABLE cart ADD COLUMN customerTempId TEXT;`,
    `ALTER TABLE cart ADD COLUMN customerPhone TEXT;`,
  ];

  for (const query of queries) {
    try {
      db.exec(query);
    } catch (err) {
      if (!err.message.includes('duplicate column name')) {
        console.error('Error executing query:', query, err);
      }
    }
  }

  saveToStore();
  console.log('Database tables created/verified');
};

export const getDb = () => {
  if (!db) throw new Error('Database not initialized');
  return db;
};

export const closeDb = () => {
  if (db) {
    saveToStore();
    db.close();
    db = null;
  }
};

const query = (sql, params = []) => {
  const dbInstance = getDb();
  const stmt = dbInstance.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
};

const run = (sql, params = []) => {
  const dbInstance = getDb();
  dbInstance.run(sql, params);
  saveToStore();
};

const runNoSave = (sql, params = []) => {
  const dbInstance = getDb();
  dbInstance.run(sql, params);
};

export const beginTransaction = () => {
  getDb().exec('BEGIN TRANSACTION');
};

export const commitTransaction = () => {
  getDb().exec('COMMIT');
  saveToStore();
};

export const rollbackTransaction = () => {
  try {
    getDb().exec('ROLLBACK');
  } catch (err) {
    console.error('Rollback failed:', err);
  }
};

// ============================================================
// PRODUCT OPERATIONS
// ============================================================

export const upsertProduct = async (product) => {
  const sql = `
    INSERT OR REPLACE INTO products (id, name, sku, description, category, taxRate, baseUnitId, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  runNoSave(sql, [
    product.id,
    product.name,
    product.sku || null,
    product.description || null,
    product.category || null,
    product.taxRate || 0,
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

// ============================================================
// PRODUCT UNITS
// ============================================================

export const upsertProductUnit = async (unit) => {
  const sql = `
    INSERT OR REPLACE INTO product_units (id, productId, name, abbreviation, unitType, conversionQty, price, isBaseUnit, barcode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  runNoSave(sql, [
    unit.id,
    unit.productId,
    unit.name,
    unit.abbreviation,
    unit.unitType,
    unit.conversionQty || 1,
    unit.price || 0,
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

// ============================================================
// BRANCH PRODUCTS
// ============================================================

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

/**
 * Delete local branch_products rows for a branch whose id is not in `ids`.
 * ONLY call after a full pull (no `since` cursor) — otherwise you'd wipe
 * every row the incremental response didn't mention.
 */
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

// ============================================================
// CART OPERATIONS
// ============================================================

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

// ============================================================
// LOCAL SALES OPERATIONS
// ============================================================

export const createLocalSale = async (sale) => {
  const sql = `
    INSERT OR REPLACE INTO local_sales (
      id, branchId, customerName, customerId, customerTempId,
      items, payments, subtotal, taxAmount, totalAmount,
      status, syncedAt, error, createdAt, updatedAt, serverSaleId, receiptText
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

// ============================================================
// SALES HELPERS
// ============================================================

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
    localSales = localSales.filter(s => s.status === status.toUpperCase());
  }

  if (search) {
    const searchLower = search.toLowerCase();
    localSales = localSales.filter(s => 
      (s.customerName && s.customerName.toLowerCase().includes(searchLower)) ||
      (s.id && s.id.toLowerCase().includes(searchLower))
    );
  }

  if (startDate) {
    const start = new Date(startDate);
    localSales = localSales.filter(s => new Date(s.createdAt) >= start);
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    localSales = localSales.filter(s => new Date(s.createdAt) <= end);
  }

  const formattedLocal = localSales.map(sale => {
    let items = [];
    let payments = [];
    try {
      items = JSON.parse(sale.items || '[]');
    } catch (e) {}
    try {
      payments = JSON.parse(sale.payments || '[]');
    } catch (e) {}

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
      status: isLocalOnly ? 'PENDING' : 'COMPLETED',
      paymentStatus: isLocalOnly ? 'PENDING' : 'PAID',
      paymentMethod: payments.length > 0 ? payments[0].method : null,
      itemsCount: items.length,
      items: items,
      payments: payments,
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
  try {
    items = JSON.parse(localSale.items || '[]');
  } catch (e) {}
  try {
    payments = JSON.parse(localSale.payments || '[]');
  } catch (e) {}

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
    status: localSale.status === 'PENDING' ? 'PENDING' : 'COMPLETED',
    paymentStatus: localSale.status === 'PENDING' ? 'PENDING' : 'PAID',
    items: items,
    payments: payments,
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
  try {
    items = JSON.parse(localSale.items || '[]');
  } catch (e) {}
  try {
    payments = JSON.parse(localSale.payments || '[]');
  } catch (e) {}

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
    status: 'COMPLETED',
    paymentStatus: 'PAID',
    items: items,
    payments: payments,
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
  if (result.length === 0) {
    throw new Error('Sale not found');
  }

  if (result[0].status !== 'FAILED') {
    throw new Error('Sale is not in failed state');
  }

  run(`
    UPDATE local_sales 
    SET status = 'PENDING', error = NULL, updatedAt = ?
    WHERE id = ?
  `, [new Date().toISOString(), saleId]);

  const sale = await getLocalSale(saleId);
  if (sale) {
    let items = [];
    let payments = [];
    try {
      items = JSON.parse(sale.items || '[]');
    } catch (e) {}
    try {
      payments = JSON.parse(sale.payments || '[]');
    } catch (e) {}

    await enqueueSync('sale', saleId, 'CREATE', {
      clientSaleId: saleId,
      branchId: sale.branchId,
      customerName: sale.customerName,
      customerId: sale.customerId || null,
      customerTempId: sale.customerTempId || null,
      items: items,
      paymentMethod: payments[0]?.method || 'CASH',
      paymentReference: payments[0]?.reference || null,
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

// ============================================================
// LOCAL CUSTOMERS
// ============================================================

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

  return rows.map(r => ({
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
  const rows = query(
    'SELECT * FROM local_customers WHERE id = ?',
    [tempId]
  );
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
  return rows.map(r => ({
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

// ============================================================
// SYNC QUEUE OPERATIONS
// ============================================================

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

// ============================================================
// SYNC METADATA OPERATIONS
// ============================================================

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

export const getLastProductSync = async () => {
  return await getSyncMetadata('last_product_sync');
};

export const setLastProductSync = async (value) => {
  await setSyncMetadata('last_product_sync', value);
};

export const getLastBranchSync = async () => {
  return await getSyncMetadata('last_branch_sync');
};

export const setLastBranchSync = async (value) => {
  await setSyncMetadata('last_branch_sync', value);
};

export const getLastCustomerSync = async () => {
  return await getSyncMetadata('last_customer_sync');
};

export const setLastCustomerSync = async (value) => {
  await setSyncMetadata('last_customer_sync', value);
};