// src/db/sqlite/helpers.js
import initSqlJs from 'sql.js';

let db = null;
let initPromise = null;

// ============================================================
// PERSISTENCE (IndexedDB, binary, debounced)
// ============================================================
//
// Old behaviour: every run() did db.export() -> Array.from() -> JSON.stringify()
// -> localStorage.setItem(). That is a full DB copy + a ~4x size blow-up on
// EVERY write, and localStorage caps at ~5MB, so large DBs silently stopped saving.
//
// New behaviour: raw bytes go to IndexedDB, at most once per SAVE_DEBOUNCE_MS,
// never in the middle of a transaction.

const IDB_NAME = 'kxtill_store';
const IDB_STORE = 'kv';
const IDB_KEY = 'db';
const LEGACY_LS_KEY = 'kxtill_db';
const SAVE_DEBOUNCE_MS = 500;

let idbPromise = null;
const openIdb = () => {
  if (!idbPromise) {
    idbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return idbPromise;
};

const idbGet = async (key) => {
  const d = await openIdb();
  return new Promise((resolve, reject) => {
    const req = d.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
};

const idbPut = async (key, value) => {
  const d = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

const idbDelete = async (key) => {
  const d = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

let txDepth = 0;
let dirty = false;
let saveTimer = null;
let saveChain = Promise.resolve();

const writeNow = () => {
  if (!db || !dirty) return saveChain;
  if (txDepth > 0) {
    // db.export() mid-transaction would break it; try again shortly.
    scheduleSave();
    return saveChain;
  }
  dirty = false;
  try {
    const bytes = db.export(); // Uint8Array (note: invalidates prepared statements)
    saveChain = saveChain
      .then(() => idbPut(IDB_KEY, bytes))
      .catch((err) => {
        console.error('saveToStore failed:', err);
        dirty = true;
      });
  } catch (err) {
    console.error('db.export failed:', err);
    dirty = true;
  }
  return saveChain;
};

export const scheduleSave = () => {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeNow();
  }, SAVE_DEBOUNCE_MS);
};

// Backwards compatible name: existing code calls saveToStore() after writes.
export const saveToStore = scheduleSave;

// Force a save right now and resolve when it is on disk.
// Use for data you cannot afford to lose (e.g. a completed sale).
export const flushSave = () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  return writeNow();
};

if (typeof window !== 'undefined') {
  // Persist before the tab goes away / is backgrounded.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
  window.addEventListener('pagehide', () => {
    flushSave();
  });
}

// ============================================================
// INIT / LIFECYCLE
// ============================================================

const loadSavedBytes = async () => {
  try {
    const bytes = await idbGet(IDB_KEY);
    if (bytes) return { bytes, migrated: false };
  } catch (err) {
    console.error('IndexedDB read failed:', err);
  }

  // One-time migration from the old localStorage format.
  try {
    const legacy = localStorage.getItem(LEGACY_LS_KEY);
    if (legacy) return { bytes: new Uint8Array(JSON.parse(legacy)), migrated: true };
  } catch (err) {
    console.error('Legacy DB migration read failed:', err);
  }
  return { bytes: null, migrated: false };
};

export const initDb = () => {
  if (db) return Promise.resolve(db);
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' });

      const { bytes, migrated } = await loadSavedBytes();
      db = bytes ? new SQL.Database(bytes) : new SQL.Database();

      await createTables();

      if (migrated) {
        // Only drop the legacy copy once the new store has the data.
        dirty = true;
        await flushSave();
        if (!dirty) localStorage.removeItem(LEGACY_LS_KEY);
      }

      // Ask the browser not to evict our storage under pressure.
      try {
        if (navigator.storage?.persist) navigator.storage.persist();
      } catch {
        /* ignore */
      }

      return db;
    } catch (error) {
      console.error('Failed to initialize database:', error);
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
};

export const resetDb = async () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  dirty = false;
  await saveChain;
  if (db) {
    db.close();
    db = null;
  }
  initPromise = null;
  localStorage.removeItem(LEGACY_LS_KEY);
  try {
    await idbDelete(IDB_KEY);
  } catch (err) {
    console.error('idbDelete failed:', err);
  }
  await initDb();
};

export const getDb = () => {
  if (!db) throw new Error('Database not initialized');
  return db;
};

export const closeDb = async () => {
  if (db) {
    await flushSave();
    db.close();
    db = null;
    initPromise = null;
  }
};

// ============================================================
// QUERY / RUN
// ============================================================

export const query = (sql, params = []) => {
  const dbInstance = getDb();
  const stmt = dbInstance.prepare(sql);
  try {
    stmt.bind(params);
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    return results;
  } finally {
    stmt.free();
  }
};

// Write + schedule a (debounced) save.
export const run = (sql, params = []) => {
  getDb().run(sql, params);
  scheduleSave();
};

// Write only. Kept for compatibility; callers should schedule a save themselves
// (or just use run()). Since saves are now debounced, run() is just as cheap.
export const runNoSave = (sql, params = []) => {
  getDb().run(sql, params);
  scheduleSave();
};

// ============================================================
// TRANSACTIONS
// ============================================================

// Synchronous transaction wrapper. fn MUST be synchronous (no awaits inside).
// Nested calls join the outer transaction.
export const withTransaction = (fn) => {
  const d = getDb();
  if (txDepth > 0) return fn();

  d.exec('BEGIN');
  txDepth++;
  try {
    const result = fn();
    d.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      d.exec('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr);
    }
    throw err;
  } finally {
    txDepth--;
    scheduleSave();
  }
};

// Manual API kept for existing callers.
export const beginTransaction = () => {
  getDb().exec('BEGIN TRANSACTION');
  txDepth++;
};

export const commitTransaction = () => {
  getDb().exec('COMMIT');
  txDepth = Math.max(0, txDepth - 1);
  scheduleSave();
};

export const rollbackTransaction = () => {
  try {
    getDb().exec('ROLLBACK');
  } catch (err) {
    console.error('Rollback failed:', err);
  } finally {
    txDepth = Math.max(0, txDepth - 1);
  }
};

// ============================================================
// SCHEMA
// ============================================================

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
    // ---------- PHARMACY ----------
    `CREATE TABLE IF NOT EXISTS pharmacy_product (
      productId TEXT PRIMARY KEY,
      genericName TEXT,
      brandName TEXT,
      strength TEXT,
      dosageForm TEXT,
      route TEXT,
      prescriptionCategory TEXT,
      packSize TEXT,
      storageConditions TEXT,
      updatedAt TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS pharmacy_batch (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      batchNumber TEXT NOT NULL,
      expiryDate TEXT NOT NULL,
      manufacturer TEXT,
      updatedAt TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS pharmacy_batch_stock (
      id TEXT PRIMARY KEY,
      batchId TEXT NOT NULL,
      branchProductId TEXT NOT NULL,
      branchId TEXT NOT NULL,
      quantityOnHand REAL NOT NULL DEFAULT 0,
      unitCost REAL NOT NULL DEFAULT 0,
      sellingPrice REAL,
      status TEXT NOT NULL DEFAULT 'AVAILABLE',
      updatedAt TEXT NOT NULL,
      UNIQUE(batchId, branchProductId)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_local_sales_status ON local_sales(status);`,
    `CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);`,
    `CREATE INDEX IF NOT EXISTS idx_branch_products_branch ON branch_products(branchId);`,
    `CREATE INDEX IF NOT EXISTS idx_cart_branch ON cart(branchId);`,
    `CREATE INDEX IF NOT EXISTS idx_local_customers_phone ON local_customers(phone);`,
    `CREATE INDEX IF NOT EXISTS idx_local_customers_name ON local_customers(name);`,
    `CREATE INDEX IF NOT EXISTS idx_local_customers_unsynced ON local_customers(isSynced);`,
    `CREATE INDEX IF NOT EXISTS idx_pharmacy_batch_product ON pharmacy_batch(productId);`,
    `CREATE INDEX IF NOT EXISTS idx_pharmacy_batch_expiry ON pharmacy_batch(expiryDate);`,
    `CREATE INDEX IF NOT EXISTS idx_pharmacy_batch_stock_bp ON pharmacy_batch_stock(branchProductId);`,
    `CREATE INDEX IF NOT EXISTS idx_pharmacy_batch_stock_branch ON pharmacy_batch_stock(branchId);`,
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
    `ALTER TABLE local_sales ADD COLUMN shiftId TEXT;`,
    // ---------- NEW INDEXES (perf) ----------
    // product_units had NO index on productId: every per-product lookup was a full scan.
    `CREATE INDEX IF NOT EXISTS idx_product_units_product ON product_units(productId);`,
    `CREATE INDEX IF NOT EXISTS idx_branch_products_product ON branch_products(productId);`,
    `CREATE INDEX IF NOT EXISTS idx_local_sales_branch_status ON local_sales(branchId, status);`,
    `CREATE INDEX IF NOT EXISTS idx_local_sales_receipt ON local_sales(status, serverSaleId);`,
    `CREATE INDEX IF NOT EXISTS idx_pharmacy_batch_stock_batch ON pharmacy_batch_stock(batchId);`,
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

  scheduleSave();
  console.log('Database tables created/verified');
};

if (typeof window !== 'undefined') {
  window.__kxdb = () => db;
}