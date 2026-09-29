// src/db/sqlite/helpers.js
import initSqlJs from 'sql.js';

let db = null;

export const initDb = async () => {
  if (db) return db;

  try {
    const SQL = await initSqlJs({
      locateFile: () => '/sql-wasm.wasm',
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

export const query = (sql, params = []) => {
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

export const run = (sql, params = []) => {
  const dbInstance = getDb();
  dbInstance.run(sql, params);
  saveToStore();
};

export const runNoSave = (sql, params = []) => {
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

// ---------- Schema ----------

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
    `CREATE TABLE IF NOT EXISTS subscription_cache (
      organizationId TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS dashboard_cache (
      cacheKey TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
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
    `ALTER TABLE local_sales ADD COLUMN costAmount REAL DEFAULT 0;`,
    `ALTER TABLE products ADD COLUMN cost REAL DEFAULT 0;`,
    `ALTER TABLE product_units ADD COLUMN cost REAL;`,
  ];

  for (const q of queries) {
    try {
      db.exec(q);
    } catch (err) {
      if (!err.message.includes('duplicate column name')) {
        console.error('Error executing query:', q, err);
      }
    }
  }

  saveToStore();
  console.log('Database tables created/verified');
};