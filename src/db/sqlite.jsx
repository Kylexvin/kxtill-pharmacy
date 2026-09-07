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
  if (db) {
    const data = db.export();
    const bytes = Array.from(data);
    localStorage.setItem('kxtill_db', JSON.stringify(bytes));
  }
};

// Fully tears down the in-memory db and localStorage copy, then reinitializes
// with fresh empty tables. Use this instead of removing 'kxtill_db' directly —
// removing the localStorage key alone leaves the stale in-memory singleton
// intact, and the next write silently re-persists the old data.
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
    `CREATE INDEX IF NOT EXISTS idx_local_sales_status ON local_sales(status);`,
    `CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);`,
    `CREATE INDEX IF NOT EXISTS idx_branch_products_branch ON branch_products(branchId);`,
    `CREATE INDEX IF NOT EXISTS idx_cart_branch ON cart(branchId);`,
    // Add the new columns to existing tables
    `ALTER TABLE local_sales ADD COLUMN serverSaleId TEXT;`,
    `ALTER TABLE local_sales ADD COLUMN receiptText TEXT;`,
    `CREATE INDEX IF NOT EXISTS idx_local_sales_server_sale_id ON local_sales(serverSaleId);`,
  ];

  for (const query of queries) {
    try {
      db.exec(query);
    } catch (err) {
      // Ignore "duplicate column" errors - they just mean the column already exists
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

// Product operations
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

// Product units
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

// Branch products
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

// Cart operations - scoped per branch
export const saveCart = async (cart) => {
  run('DELETE FROM cart WHERE branchId = ?', [cart.branchId]);
  const sql = `
    INSERT INTO cart (branchId, customerName, items, total, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `;
  run(sql, [
    cart.branchId,
    cart.customerName || null,
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

// Local sales operations
export const createLocalSale = async (sale) => {
  const sql = `
    INSERT OR REPLACE INTO local_sales (
      id, branchId, customerName, items, payments, subtotal, taxAmount, totalAmount,
      status, syncedAt, error, createdAt, updatedAt, serverSaleId, receiptText
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  run(sql, [
    sale.id,
    sale.branchId,
    sale.customerName || null,
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

// New: Set server sale ID after sync
export const setSaleServerId = async (id, serverSaleId) => {
  run('UPDATE local_sales SET serverSaleId = ?, updatedAt = ? WHERE id = ?',
    [serverSaleId, new Date().toISOString(), id]);
};

// New: Save receipt text locally
export const saveReceiptText = async (id, receiptText) => {
  run('UPDATE local_sales SET receiptText = ?, updatedAt = ? WHERE id = ?',
    [receiptText, new Date().toISOString(), id]);
};

// New: Get synced sales that are missing receipt text
export const getSyncedSalesMissingReceipt = async () => {
  return query(
    "SELECT * FROM local_sales WHERE status = 'SYNCED' AND serverSaleId IS NOT NULL AND (receiptText IS NULL OR receiptText = '')"
  );
};

// New: Get sale by server ID
export const getSaleByServerId = async (serverSaleId) => {
  const results = query('SELECT * FROM local_sales WHERE serverSaleId = ?', [serverSaleId]);
  return results.length ? results[0] : null;
};

// New: Get all sales with server IDs (synced sales)
export const getSalesWithServerId = async () => {
  return query("SELECT * FROM local_sales WHERE serverSaleId IS NOT NULL ORDER BY createdAt DESC");
};

// Sync queue operations
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

// Sync metadata operations
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