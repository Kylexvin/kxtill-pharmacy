// src/sync/engine.js

import axios from 'axios';
import {
  getPendingSales,
  updateSaleStatus,
  setSaleServerId,
  saveReceiptText,
  getSyncedSalesMissingReceipt,
  getLastProductSync,
  setLastProductSync,
  setLastBranchSync,
  getLastCustomerSync,
  setLastCustomerSync,
  getPendingSyncItems,
  updateSyncItemStatus,
  getUnsyncedCustomers,
  markCustomerSynced,
  replaceCustomerIdInSales,
  getLocalSale,
  upsertServerCustomer,
  setSyncMetadata,
  saveDashboardSnapshot,
  isAnyProductPharmacy,
  // new
  applyCatalogRecords,
  clearCatalog,
  withTransaction,
  flushSave,
} from '../db/sqlite';

// ============================================================
// CONFIG
// ============================================================

const RECEIPT_FETCH_TIMEOUT_MS = 5000;
const SYNC_HTTP_TIMEOUT_MS = 15000;
// Offline-sale posts run a long server transaction (FEFO + allocation writes).
// Keep this above the server tx timeout, otherwise the client aborts while the
// server is still committing, and the sale looks "failed" when it isn't.
const SALE_POST_TIMEOUT_MS = 70000;
const MAX_QUEUE_ATTEMPTS = 5;

const FULL_SYNC_INTERVAL_S = 120;      // heavy pull cycle
const PUSH_INTERVAL_S = 15;            // light "push pending sales" cycle
const DASHBOARD_MIN_INTERVAL_MS = 5 * 60 * 1000;
const RESUME_MIN_INTERVAL_MS = 10 * 1000;

// Keep at 1 while the backend sale transaction is slow: concurrent posts that
// touch the same batches/branch products contend on row locks and make each
// other slower. Raise to 3 once the server tx is fast.
const SALES_PUSH_CONCURRENCY = 1;
const RECEIPT_CONCURRENCY = 4;

// ============================================================
// ONLINE STATE
// ============================================================

let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

export const getOnlineStatus = () => isOnline;

export const setOnlineStatus = (value) => {
  isOnline = !!value;
};

// ============================================================
// IN-FLIGHT GUARDS
// ============================================================

let syncInFlight = null; // null | { branchId, promise }
let queueInFlight = false;
let fastPushInFlight = null;
let receiptsInFlight = null;
let lastFullSyncAt = 0;
let lastDashAt = 0;
let lastDashBranch = null;

// ============================================================
// SMALL UTILS
// ============================================================

const emit = (name, detail) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      detail === undefined ? new CustomEvent(name) : new CustomEvent(name, { detail })
    );
  }
};

const getOrgId = () => {
  const org = localStorage.getItem('activeOrganization');
  if (!org) return null;
  try {
    const parsed = JSON.parse(org);
    return parsed?.id || parsed;
  } catch {
    return org;
  }
};

const getStoredActiveBranchId = () => {
  const stored = localStorage.getItem('activeBranch');
  if (!stored) return undefined;
  try {
    return JSON.parse(stored)?.id;
  } catch {
    return undefined;
  }
};

const describeError = (err) => {
  if (!err) return 'Unknown error';
  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    String(err)
  );
};

const isAbortError = (err) =>
  err?.code === 'ECONNABORTED' || err?.name === 'CanceledError';

const num = (x, fallback = 0) => parseFloat(x) || fallback;

// Run fn over items with at most `limit` in flight.
const mapLimit = async (items, limit, fn) => {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
};

const safe = async (label, fn, results) => {
  try {
    await fn();
  } catch (err) {
    results.errors.push(`${label}: ${describeError(err)}`);
  }
};

// ============================================================
// LIFECYCLE
// ============================================================

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true;
    sync(getStoredActiveBranchId());
  });
  window.addEventListener('offline', () => {
    isOnline = false;
  });
}

// ============================================================
// PHARMACY HELPERS
// ============================================================

const isSalePharmacy = (items) => {
  if (!Array.isArray(items) || items.length === 0) return false;
  const productIds = [...new Set(items.map((i) => i.productId).filter(Boolean))];
  if (productIds.length === 0) return false;
  return isAnyProductPharmacy(productIds);
};

// ============================================================
// SERVER PAYLOAD -> DB RECORDS
// ============================================================

const mapProduct = (p, productId, updatedAt) => ({
  id: productId,
  name: p.name,
  sku: p.sku || null,
  description: p.description || null,
  category: p.category || null,
  taxRate: num(p.taxRate),
  cost: num(p.cost),
  baseUnitId: p.baseUnit?.id || null,
  updatedAt,
});

const mapUnits = (units, productId) =>
  Array.isArray(units)
    ? units.map((u) => ({
        id: u.id,
        productId,
        name: u.name,
        abbreviation: u.abbreviation,
        unitType: u.unitType || 'unit',
        conversionQty: num(u.conversionQty, 1),
        price: num(u.price),
        cost: u.cost != null ? num(u.cost) : null,
        isBaseUnit: u.isBaseUnit ? 1 : 0,
        barcode: u.barcode || null,
      }))
    : [];

const mapBranchProduct = (bp, productId) => ({
  id: bp.id,
  productId: bp.productId || productId,
  branchId: bp.branchId,
  stock: num(bp.stock),
  minStock: num(bp.minStock),
  isAvailable: bp.isAvailable ? 1 : 0,
  updatedAt: bp.updatedAt,
});

// Item shape: product fields + branch product fields flattened
// (used by /sync/products and delta /sync/branch-products).
const recordFromItem = (item, fallbackBranchId) => {
  const productId = item.productId || item.id;
  return {
    product: mapProduct(item, productId, item.updatedAt),
    units: mapUnits(item.units, productId),
    branchProduct: item.id && item.branchId ? mapBranchProduct(item, productId) : null,
    pharmacy: {
      productId,
      branchProductId: item.id,
      branchId: item.branchId || fallbackBranchId,
      pp: item.pharmacyProduct,
      batches: item.batches,
      updatedAt: item.updatedAt,
    },
  };
};

// Item shape: branch product with a nested `product`
// (used by the full /sync/branch-products pull).
const recordFromBranchProduct = (bp, fallbackBranchId) => {
  const productId = bp.productId || bp.product?.id;
  return {
    product: bp.product ? mapProduct(bp.product, bp.product.id, bp.updatedAt) : null,
    units: bp.product ? mapUnits(bp.product.units, bp.product.id) : [],
    branchProduct: mapBranchProduct(bp, productId),
    pharmacy: {
      productId,
      branchProductId: bp.id,
      branchId: bp.branchId || fallbackBranchId,
      pp: bp.pharmacyProduct || bp.product?.pharmacyProduct,
      batches: bp.batches,
      updatedAt: bp.updatedAt,
    },
  };
};

// ============================================================
// MAIN SYNC
// ============================================================

export const sync = async (branchId) => {
  if (syncInFlight && syncInFlight.branchId === branchId) {
    return syncInFlight.promise;
  }

  if (syncInFlight) {
    emit('kxtill:sync-complete', { success: false, reason: 'superseded', results: null });
  }

  const run = (async () => {
    emit('kxtill:sync-start');

    try {
      if (!isOnline) {
        emit('kxtill:sync-complete', { success: false, reason: 'offline', results: null });
        return { success: false, reason: 'offline' };
      }

      const results = {
        customersPushed: 0,
        customersFailed: 0,
        customersPulled: 0,
        salesPushed: 0,
        salesFailed: 0,
        productsUpdated: 0,
        branchProductsUpdated: 0,
        receiptsFetched: 0,
        errors: [],
      };

      // 1) Customers must go first: sales reference temp customer ids.
      await safe('Customer push fatal', () => pushPendingCustomers(results), results);

      // 2) Everything else is independent -> run in parallel.
      await Promise.all([
        safe('Customer pull fatal', () => pullCustomerUpdates(results), results),
        safe(
          'Sales push fatal',
          async () => {
            await pushSalesOnce(results);
            await fetchPendingReceipts(results);
          },
          results
        ),
        safe('Product pull fatal', () => pullProductUpdates(results, branchId), results),
        safe('Dashboard snapshot fatal', () => maybePullDashboard(results, branchId), results),
      ]);

      lastFullSyncAt = Date.now();
      emit('kxtill:sync-complete', results);
      return { success: true, results };
    } catch (fatalErr) {
      emit('kxtill:sync-complete', {
        success: false,
        reason: 'fatal',
        results: { errors: [describeError(fatalErr)] },
      });
      throw fatalErr;
    }
  })();

  syncInFlight = { branchId, promise: run };

  try {
    return await run;
  } finally {
    if (syncInFlight && syncInFlight.branchId === branchId) {
      syncInFlight = null;
    }
  }
};

// ============================================================
// CUSTOMERS
// ============================================================

const pushPendingCustomers = async (results) => {
  let pendingCustomers = [];

  try {
    pendingCustomers = await getUnsyncedCustomers();
  } catch (err) {
    results.errors.push(`Customer queue lookup failed: ${describeError(err)}`);
    return;
  }

  if (!Array.isArray(pendingCustomers) || pendingCustomers.length === 0) return;

  const organizationId = getOrgId();
  if (!organizationId) {
    results.errors.push('No organization ID found for customer sync');
    return;
  }

  for (const customer of pendingCustomers) {
    try {
      const payload = {
        name: customer.name,
        customerType: 'INDIVIDUAL',
        phone: customer.phone || undefined,
        email: customer.email || undefined,
      };

      const response = await axios.post(
        `/organizations/${organizationId}/customers`,
        payload,
        { timeout: SYNC_HTTP_TIMEOUT_MS }
      );

      const created = response.data?.customer || response.data;
      const serverId = created?.id;

      if (!serverId) {
        results.errors.push(`Customer sync: no id returned for ${customer.name}`);
        results.customersFailed++;
        continue;
      }

      try {
        await markCustomerSynced(customer.id, serverId);
      } catch (err) {
        results.errors.push(
          `markCustomerSynced failed for ${customer.name}: ${describeError(err)}`
        );
      }

      try {
        await replaceCustomerIdInSales(customer.id, serverId);
      } catch (err) {
        results.errors.push(
          `replaceCustomerIdInSales failed for ${customer.name}: ${describeError(err)}`
        );
      }

      results.customersPushed++;
    } catch (error) {
      const status = error.response?.status;
      const message = describeError(error);

      if (status === 409) {
        results.errors.push(`Customer conflict (${customer.name}): ${message}`);
      } else if (status === 400 || status === 422) {
        results.errors.push(`Customer rejected (${customer.name}): ${message}`);
      } else {
        results.errors.push(`Customer push failed (${customer.name}): ${message}`);
      }
      results.customersFailed++;

      // No response at all = network is down; don't wait out every timeout.
      if (!error.response) break;
    }
  }
};

const pullCustomerUpdates = async (results) => {
  try {
    const organizationId = getOrgId();
    if (!organizationId) {
      results.errors.push('No organization ID found for customer pull');
      return;
    }

    const lastSync = await getLastCustomerSync();
    const params = lastSync ? { since: lastSync } : {};

    const response = await axios.get(
      `/organizations/${organizationId}/kxtill/customers/sync`,
      { params, timeout: SYNC_HTTP_TIMEOUT_MS }
    );

    const data = response.data || {};
    const customersList = data.customers || data.items || [];

    for (const customer of customersList) {
      try {
        await upsertServerCustomer({
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
        });
        results.customersPulled++;
      } catch (err) {
        results.errors.push(
          `Customer cache write failed (${customer.name}): ${describeError(err)}`
        );
      }
    }

    if (data.serverTime) {
      await setLastCustomerSync(data.serverTime);
    }
  } catch (error) {
    results.errors.push(`Customer pull failed: ${describeError(error)}`);
  }
};

// ============================================================
// SALES
// ============================================================

let salesPushPromise = null;

// Only one sales push at a time (full sync, fast path and timer share it).
const pushSalesOnce = (results) => {
  if (!salesPushPromise) {
    salesPushPromise = pushPendingSales(results).finally(() => {
      salesPushPromise = null;
    });
  }
  return salesPushPromise;
};

const pushPendingSales = async (results) => {
  const pendingSales = await getPendingSales();
  if (pendingSales.length === 0) return;

  const organizationId = getOrgId();
  if (!organizationId) {
    results.errors.push('No organization ID found');
    return;
  }

  let networkDown = false;

  await mapLimit(pendingSales, SALES_PUSH_CONCURRENCY, async (sale) => {
    if (networkDown) return;

    try {
      const items = JSON.parse(sale.items);
      const payments = JSON.parse(sale.payments);

      let freshSale = sale;
      try {
        const reread = await getLocalSale(sale.id);
        if (reread) freshSale = reread;
      } catch {
        // fall back
      }

      const customerId = freshSale?.customerId || null;
      const hasUnresolvedTempCustomer = freshSale?.customerTempId && !freshSale?.customerId;
      if (hasUnresolvedTempCustomer) return;

      const payload = {
        clientSaleId: sale.id,
        branchId: sale.branchId,
        shiftId: sale.shiftId || undefined,
        customerId: customerId || undefined,
        customerName: sale.customerName || undefined,
        items: items.map((item) => ({
          productId: item.productId,
          branchProductId: item.branchProductId,
          unitId: item.unitId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        payments:
          Array.isArray(payments) && payments.length > 0
            ? payments.map((p) => ({
                method: p.method,
                amount: Number(p.amount),
                reference: p.reference || null,
              }))
            : undefined,
        paymentMethod: payments[0]?.method || 'CASH',
        paymentReference: payments[0]?.reference || undefined,
      };

      const endpoint = isSalePharmacy(items)
        ? `/organizations/${organizationId}/kxtill/pharmacy/sales/offline`
        : `/organizations/${organizationId}/kxtill/sales/offline`;

      const response = await axios.post(endpoint, payload, {
        timeout: SALE_POST_TIMEOUT_MS,
      });

      const serverSaleId = response.data?.sale?.id;

      await updateSaleStatus(sale.id, 'SYNCED');
      if (serverSaleId) {
        await setSaleServerId(sale.id, serverSaleId);
      }

      results.salesPushed++;
    } catch (error) {
      const status = error.response?.status;
      const message = describeError(error);

      const isDuplicate =
        status === 409 || (status === 500 && /Unique constraint/i.test(message));

      if (isDuplicate) {
        await updateSaleStatus(sale.id, 'SYNCED', 'Duplicate sale on server');
        // If the server tells us which sale it already has, keep the id so the
        // receipt can still be fetched (receipts require serverSaleId).
        const existingId =
          error.response?.data?.sale?.id || error.response?.data?.existingSaleId;
        if (existingId) await setSaleServerId(sale.id, existingId);
        results.salesPushed++;
      } else if (status === 400 || status === 422) {
        await updateSaleStatus(sale.id, 'FAILED', message);
        results.salesFailed++;
      } else {
        results.errors.push(`Sale push failed (${sale.id}): ${message}`);
        results.salesFailed++;
        // Timeout / offline: stop hammering, the next tick retries.
        if (!error.response) networkDown = true;
      }
    }
  });
};

// ============================================================
// RECEIPTS
// ============================================================

const coerceReceiptText = (data) => {
  if (data == null) return null;
  if (typeof data === 'string') return data;
  if (typeof data === 'object') {
    if (typeof data.text === 'string') return data.text;
    if (typeof data.receipt === 'string') return data.receipt;
    try {
      return JSON.stringify(data);
    } catch {
      return null;
    }
  }
  return String(data);
};

export const fetchPendingReceipts = (results = null) => {
  if (receiptsInFlight) return receiptsInFlight;
  receiptsInFlight = doFetchPendingReceipts(results).finally(() => {
    receiptsInFlight = null;
  });
  return receiptsInFlight;
};

const doFetchPendingReceipts = async (results) => {
  if (!isOnline) return;

  const organizationId = getOrgId();
  if (!organizationId) return;

  const sales = (await getSyncedSalesMissingReceipt()).filter((s) => s.serverSaleId);
  if (sales.length === 0) return;

  let fetchedCount = 0;

  await mapLimit(sales, RECEIPT_CONCURRENCY, async (sale) => {
    try {
      const res = await axios.get(
        `/organizations/${organizationId}/kxtill/sales/${sale.serverSaleId}/receipt`,
        { timeout: RECEIPT_FETCH_TIMEOUT_MS }
      );

      const receiptText = coerceReceiptText(res.data);
      if (receiptText && typeof receiptText === 'string') {
        await saveReceiptText(sale.id, receiptText);
        fetchedCount++;
      }
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) return; // not generated yet; retried next cycle
      if (isAbortError(err)) return;

      const message = describeError(err);
      console.warn(
        `Receipt fetch failed for sale ${sale.id} (serverId ${sale.serverSaleId}):`,
        message
      );
      if (results) results.errors.push(`Receipt fetch failed for ${sale.id}: ${message}`);
    }
  });

  if (results) results.receiptsFetched = fetchedCount;
};

// ============================================================
// PRODUCTS
// ============================================================

const pullProductUpdates = async (results, branchId) => {
  const organizationId = getOrgId();
  if (!organizationId) {
    results.errors.push('No organization ID found');
    return;
  }

  const lastSync = await getLastProductSync();

  const params = {
    ...(lastSync ? { since: lastSync } : {}),
    ...(branchId ? { branchId } : {}),
  };

  const response = await axios.get(
    `/organizations/${organizationId}/kxtill/sync/branch-products`,
    { params, timeout: SYNC_HTTP_TIMEOUT_MS }
  );

  const data = response.data || {};
  const items = data.items || data.branchProducts || [];

  if (items.length > 0) {
    // One transaction, prepared statements. If this throws, nothing is
    // written AND the sync version is not advanced, so the next pull retries.
    applyCatalogRecords(items.map((it) => recordFromItem(it, branchId)));
    results.productsUpdated += items.length;
  }

  if (data.version) {
    await setLastProductSync(data.version);
  }
};

// ============================================================
// DASHBOARD SNAPSHOTS
// ============================================================

const maybePullDashboard = async (results, branchId) => {
  if (!branchId) return;
  const fresh = Date.now() - lastDashAt < DASHBOARD_MIN_INTERVAL_MS;
  if (fresh && lastDashBranch === branchId) return;

  lastDashAt = Date.now();
  lastDashBranch = branchId;
  await pullDashboardSnapshots(results, branchId);
};

const pullDashboardSnapshots = async (results, branchId) => {
  try {
    const organizationId = getOrgId();
    if (!organizationId || !branchId) return;

    const periods = ['today', 'week', 'month'];

    const entries = await Promise.all(
      periods.map(async (period) => {
        try {
          const res = await axios.get(
            `/organizations/${organizationId}/kxtill/sync/dashboard`,
            { params: { branchId, period }, timeout: SYNC_HTTP_TIMEOUT_MS }
          );
          return [period, res.data?.snapshot || null];
        } catch {
          return [period, null];
        }
      })
    );

    const snapshotPayload = Object.fromEntries(entries);
    if (periods.some((p) => snapshotPayload[p])) {
      saveDashboardSnapshot(organizationId, branchId, snapshotPayload);
    } else {
      // Nothing came back: allow a retry on the next cycle.
      lastDashAt = 0;
    }
  } catch (error) {
    lastDashAt = 0;
    results.errors.push(`Dashboard snapshot sync: ${describeError(error)}`);
  }
};

// ============================================================
// FAST PUSH PATH
// ============================================================

// Light cycle: customers (needed for temp ids) -> sales -> receipts.
// Returns immediately when nothing is pending. Safe to call often.
export const pushNow = () => {
  if (fastPushInFlight) return fastPushInFlight;

  fastPushInFlight = (async () => {
    if (!isOnline) return null;

    const results = {
      customersPushed: 0,
      customersFailed: 0,
      salesPushed: 0,
      salesFailed: 0,
      receiptsFetched: 0,
      errors: [],
    };

    try {
      await pushPendingCustomers(results);
      await pushSalesOnce(results);

      if (results.salesPushed > 0) {
        // Give the server a moment to render receipts, then grab them.
        await new Promise((r) => setTimeout(r, 800));
        await fetchPendingReceipts(results);
        emit('kxtill:push-complete', results);
      }
    } catch (err) {
      results.errors.push(describeError(err));
    }
    return results;
  })().finally(() => {
    fastPushInFlight = null;
  });

  return fastPushInFlight;
};

// Call right after a sale is saved locally.
let pushTimer = null;
export const syncSoon = (delay = 300) => {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushNow();
  }, delay);
};

// ============================================================
// QUEUE PROCESSOR (unchanged logic; still not called automatically)
// ============================================================

export const processSyncQueue = async () => {
  if (queueInFlight) return;
  queueInFlight = true;

  try {
    if (!isOnline) return;

    const items = await getPendingSyncItems(20);
    if (items.length === 0) return;

    const organizationId = getOrgId();
    if (!organizationId) return;

    const sorted = [...items].sort((a, b) => {
      if (a.entityType === 'customer' && b.entityType !== 'customer') return -1;
      if (b.entityType === 'customer' && a.entityType !== 'customer') return 1;
      return 0;
    });

    for (const item of sorted) {
      try {
        const payload = JSON.parse(item.payload);

        switch (item.entityType) {
          case 'customer': {
            const res = await axios.post(
              `/organizations/${organizationId}/customers`,
              payload,
              { timeout: SYNC_HTTP_TIMEOUT_MS }
            );
            const created = res.data?.customer || res.data;
            const serverId = created?.id;

            if (serverId && payload.tempId) {
              await markCustomerSynced(payload.tempId, serverId);
              await replaceCustomerIdInSales(payload.tempId, serverId);
            }
            break;
          }
          case 'sale': {
            const saleItems = Array.isArray(payload.items) ? payload.items : [];
            const endpoint = isSalePharmacy(saleItems)
              ? `/organizations/${organizationId}/kxtill/pharmacy/sales/offline`
              : `/organizations/${organizationId}/kxtill/sales/offline`;

            const response = await axios.post(endpoint, payload, {
              timeout: SYNC_HTTP_TIMEOUT_MS,
            });
            const serverSaleId = response.data?.sale?.id;
            if (serverSaleId && payload.clientSaleId) {
              await setSaleServerId(payload.clientSaleId, serverSaleId);
            }
            break;
          }
          default:
            await updateSyncItemStatus(
              item.id,
              'FAILED',
              `Unknown entity type: ${item.entityType}`
            );
            continue;
        }

        await updateSyncItemStatus(item.id, 'SYNCED');
      } catch (error) {
        const status = error.response?.status;
        const message = describeError(error);

        if (status === 409) {
          await updateSyncItemStatus(item.id, 'SYNCED', 'Already exists on server');
        } else if (status === 400 || status === 422) {
          await updateSyncItemStatus(item.id, 'FAILED', message);
        } else if (item.attempts >= MAX_QUEUE_ATTEMPTS) {
          await updateSyncItemStatus(item.id, 'FAILED', `Max retries exceeded: ${message}`);
        } else {
          await updateSyncItemStatus(item.id, 'PENDING', message);
        }
      }
    }
  } finally {
    queueInFlight = false;
  }
};

// ============================================================
// INITIAL SYNC
// ============================================================

export const initialSync = async (branchId) => {
  if (!isOnline) {
    throw new Error('Cannot perform initial sync — device is offline');
  }

  const organizationId = getOrgId();
  if (!organizationId) throw new Error('No organization ID found');
  if (!branchId) throw new Error('No branch ID provided');

  // Fetch EVERYTHING first. Previously the local catalog was wiped before the
  // requests, so a failed request left the device with an empty catalog.
  const [productsRes, branchRes, customersRes] = await Promise.all([
    axios.get(`/organizations/${organizationId}/kxtill/sync/products`, {
      params: { branchId },
      timeout: SYNC_HTTP_TIMEOUT_MS,
    }),
    axios.get(`/organizations/${organizationId}/kxtill/sync/branch-products`, {
      params: { branchId },
      timeout: SYNC_HTTP_TIMEOUT_MS,
    }),
    axios
      .get(`/organizations/${organizationId}/kxtill/customers/sync`, {
        timeout: SYNC_HTTP_TIMEOUT_MS,
      })
      .catch((err) => {
        console.warn('Customer seed during initialSync failed:', describeError(err));
        return null;
      }),
  ]);

  const productsData = productsRes.data || {};
  const productsList = productsData.products || productsData.items || [];

  const branchData = branchRes.data || {};
  const branchProductsList = branchData.branchProducts || branchData.items || [];

  const records = [
    ...productsList.map((p) => recordFromItem(p, branchId)),
    ...branchProductsList.map((bp) => recordFromBranchProduct(bp, branchId)),
  ];

  // Wipe + reload atomically: either the whole new catalog lands or nothing changes.
  withTransaction(() => {
    clearCatalog();
    applyCatalogRecords(records);
  });

  if (productsData.version) await setLastProductSync(productsData.version);
  if (branchData.version) await setLastBranchSync(branchData.version);
  await setSyncMetadata('last_branch_full_pull', new Date().toISOString());

  if (customersRes) {
    const customersData = customersRes.data || {};
    const customersList = customersData.customers || customersData.items || [];

    for (const customer of customersList) {
      try {
        await upsertServerCustomer({
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
        });
      } catch (err) {
        console.warn(`Customer cache write failed (${customer.name}):`, describeError(err));
      }
    }

    if (customersData.serverTime) {
      await setLastCustomerSync(customersData.serverTime);
    }
  }

  await flushSave();
  return { success: true };
};

// ============================================================
// AUTO-SYNC LIFECYCLE
// ============================================================

let fullTimer = null;
let pushInterval = null;
let listenersAttached = false;

const syncIfStale = (maxAgeMs = RESUME_MIN_INTERVAL_MS) => {
  if (Date.now() - lastFullSyncAt < maxAgeMs) return pushNow();
  return sync(getStoredActiveBranchId());
};

const onVisibility = () => {
  if (document.visibilityState === 'visible') syncIfStale();
};
const onPageShow = () => syncIfStale();

export const startAutoSync = (intervalSeconds = FULL_SYNC_INTERVAL_S) => {
  stopAutoSync();

  sync(getStoredActiveBranchId());

  // Heavy cycle
  fullTimer = setInterval(() => {
    sync(getStoredActiveBranchId());
  }, intervalSeconds * 1000);

  // Light cycle: get sales out quickly. No-ops when nothing is pending.
  pushInterval = setInterval(() => {
    if (document.visibilityState === 'visible' || isOnline) pushNow();
  }, PUSH_INTERVAL_S * 1000);

  // Browsers throttle/freeze timers when the tab is hidden. Catch up the
  // moment the app comes back.
  if (!listenersAttached && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onPageShow);
    listenersAttached = true;
  }
};

export const stopAutoSync = () => {
  if (fullTimer) {
    clearInterval(fullTimer);
    fullTimer = null;
  }
  if (pushInterval) {
    clearInterval(pushInterval);
    pushInterval = null;
  }
  if (listenersAttached) {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('focus', onPageShow);
    listenersAttached = false;
  }
};

export const forceSync = async (branchId) => {
  lastDashAt = 0; // manual refresh also refreshes the dashboard
  return await sync(branchId);
};

const syncEngine = {
  sync,
  forceSync,
  initialSync,
  startAutoSync,
  stopAutoSync,
  processSyncQueue,
  getOnlineStatus,
  setOnlineStatus,
  fetchPendingReceipts,
  pushNow,
  syncSoon,
};

export default syncEngine;