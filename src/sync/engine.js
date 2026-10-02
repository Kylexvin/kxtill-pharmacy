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
  //getLastBranchSync,
  setLastBranchSync,
  getLastCustomerSync,
  setLastCustomerSync,
  upsertProduct,
  clearProducts,
  upsertProductUnit,
  clearProductUnits,
  upsertBranchProduct,
  clearBranchProducts,
  getPendingSyncItems,
  updateSyncItemStatus,
  getUnsyncedCustomers,
  markCustomerSynced,
  replaceCustomerIdInSales,
  getLocalSale,
  upsertServerCustomer,
  //deleteBranchProductsNotIn,
  //getSyncMetadata,
  setSyncMetadata,
  saveDashboardSnapshot,
} from '../db/sqlite';

// ============================================================
// CONFIG
// ============================================================

const RECEIPT_FETCH_TIMEOUT_MS = 5000;
const SYNC_HTTP_TIMEOUT_MS = 15000;
const MAX_QUEUE_ATTEMPTS = 5;
//const FULL_PULL_INTERVAL_MS = 5 * 60 * 1000;

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

// ============================================================
// STORAGE HELPERS
// ============================================================

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
    const parsed = JSON.parse(stored);
    return parsed?.id;
  } catch {
    return undefined;
  }
};

// ============================================================
// ERROR NORMALIZATION
// ============================================================

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
// MAIN SYNC
// ============================================================

export const sync = async (branchId) => {
  if (syncInFlight && syncInFlight.branchId === branchId) {
    return syncInFlight.promise;
  }

  if (syncInFlight && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('kxtill:sync-complete', {
        detail: { success: false, reason: 'superseded', results: null },
      })
    );
  }

  const run = (async () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kxtill:sync-start'));
    }

    try {
      if (!isOnline) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('kxtill:sync-complete', {
              detail: { success: false, reason: 'offline', results: null },
            })
          );
        }
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

      try {
        await pushPendingCustomers(results);
      } catch (err) {
        results.errors.push(`Customer push fatal: ${describeError(err)}`);
      }

      try {
        await pullCustomerUpdates(results);
      } catch (err) {
        results.errors.push(`Customer pull fatal: ${describeError(err)}`);
      }

      try {
        await pushPendingSales(results);
      } catch (err) {
        results.errors.push(`Sales push fatal: ${describeError(err)}`);
        try {
          const stuck = await getPendingSales();
          for (const s of stuck) {
            await updateSaleStatus(
              s.id,
              'FAILED',
              `Sync crashed before processing: ${describeError(err)}`
            );
            results.salesFailed++;
          }
        } catch (cleanupErr) {
          results.errors.push(
            `Failed to mark stuck sales as FAILED: ${describeError(cleanupErr)}`
          );
        }
      }

      try {
        await pullProductUpdates(results, branchId);
      } catch (err) {
        results.errors.push(`Product pull fatal: ${describeError(err)}`);
      }

      try {
        await pullDashboardSnapshots(results, branchId);
      } catch (err) {
        results.errors.push(`Dashboard snapshot fatal: ${describeError(err)}`);
      }

      try {
        await new Promise((r) => setTimeout(r, 1500));
        await fetchPendingReceipts(results);
      } catch (err) {
        results.errors.push(`Receipt fetch fatal: ${describeError(err)}`);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('kxtill:sync-complete', { detail: results })
        );
      }

      return { success: true, results };
    } catch (fatalErr) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('kxtill:sync-complete', {
            detail: {
              success: false,
              reason: 'fatal',
              results: { errors: [describeError(fatalErr)] },
            },
          })
        );
      }
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

  if (!Array.isArray(pendingCustomers) || pendingCustomers.length === 0) {
    return;
  }

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
        results.errors.push(
          `Customer sync: no id returned for ${customer.name}`
        );
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

const pushPendingSales = async (results) => {
  const pendingSales = await getPendingSales();

  if (pendingSales.length === 0) return;

  const organizationId = getOrgId();
  if (!organizationId) {
    results.errors.push('No organization ID found');
    return;
  }

  for (const sale of pendingSales) {
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
      const hasUnresolvedTempCustomer =
        freshSale?.customerTempId && !freshSale?.customerId;

      if (hasUnresolvedTempCustomer) {
        continue;
      }

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
        payments: Array.isArray(payments) && payments.length > 0
          ? payments.map((p) => ({
              method: p.method,
              amount: Number(p.amount),
              reference: p.reference || null,
            }))
          : undefined,
        // Legacy fallback if payments is missing:
        paymentMethod: payments[0]?.method || 'CASH',
        paymentReference: payments[0]?.reference || undefined,
      };

      const response = await axios.post(
        `/organizations/${organizationId}/kxtill/sales/offline`,
        payload,
        { timeout: SYNC_HTTP_TIMEOUT_MS }
      );

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
        status === 409 ||
        (status === 500 && /Unique constraint/i.test(message));

      if (isDuplicate) {
        await updateSaleStatus(sale.id, 'SYNCED', 'Duplicate sale on server');
        results.salesPushed++;
      } else if (status === 400 || status === 422) {
        await updateSaleStatus(sale.id, 'FAILED', message);
        results.salesFailed++;
      } else {
        results.errors.push(`Sale push failed (${sale.id}): ${message}`);
        results.salesFailed++;
      }
    }
  }
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

export const fetchPendingReceipts = async (results = null) => {
  if (!isOnline) return;

  const organizationId = getOrgId();
  if (!organizationId) return;

  const sales = await getSyncedSalesMissingReceipt();
  if (sales.length === 0) return;

  let fetchedCount = 0;

  for (const sale of sales) {
    if (!sale.serverSaleId) continue;

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
      if (status === 404) continue;
      if (isAbortError(err)) continue;

      const message = describeError(err);
      console.warn(
        `Receipt fetch failed for sale ${sale.id} (serverId ${sale.serverSaleId}):`,
        message
      );
      if (results) {
        results.errors.push(`Receipt fetch failed for ${sale.id}: ${message}`);
      }
    }
  }

  if (results) {
    results.receiptsFetched = fetchedCount;
  }
};

// ============================================================
// PRODUCTS
// ============================================================

const pullProductUpdates = async (results, branchId) => {
  try {
    const lastSync = await getLastProductSync();
    const organizationId = getOrgId();

    if (!organizationId) {
      results.errors.push('No organization ID found');
      return;
    }

    const params = {
      ...(lastSync ? { since: lastSync } : {}),
      ...(branchId ? { branchId } : {}),
    };

    const response = await axios.get(
      `/organizations/${organizationId}/kxtill/sync/products`,
      { params, timeout: SYNC_HTTP_TIMEOUT_MS }
    );

    const data = response.data;
    const productsList = data.products || data.items || [];

    for (const product of productsList) {
      const productId = product.productId || product.id;

await upsertProduct({
  id: productId,
  name: product.name,
  sku: product.sku || null,
  description: product.description || null,
  category: product.category || null,
  taxRate: parseFloat(product.taxRate) || 0,
  cost: parseFloat(product.cost) || 0,
  baseUnitId: product.baseUnit?.id || null,
  updatedAt: product.updatedAt,
});

      if (Array.isArray(product.units)) {
        for (const unit of product.units) {
          await upsertProductUnit({
            id: unit.id,
            productId,
            name: unit.name,
            abbreviation: unit.abbreviation,
            unitType: unit.unitType || 'unit',
            conversionQty: parseFloat(unit.conversionQty) || 1,
            price: parseFloat(unit.price) || 0,
            cost: unit.cost != null ? parseFloat(unit.cost) : null,
            isBaseUnit: unit.isBaseUnit ? 1 : 0,
            barcode: unit.barcode || null,
          });
        }
      }

      if (product.id && product.branchId) {
        await upsertBranchProduct({
          id: product.id,
          productId: product.productId,
          branchId: product.branchId,
          stock: parseFloat(product.stock) || 0,
          minStock: parseFloat(product.minStock) || 0,
          isAvailable: product.isAvailable ? 1 : 0,
          updatedAt: product.updatedAt,
        });
      }

      results.productsUpdated++;
    }

    if (data.version) {
      await setLastProductSync(data.version);
    }
  } catch (error) {
    results.errors.push(`Product sync: ${describeError(error)}`);
  }
};

// ============================================================
// DASHBOARD SNAPSHOTS
// ============================================================

const pullDashboardSnapshots = async (results, branchId) => {
  try {
    const organizationId = getOrgId();
    if (!organizationId || !branchId) return;

    const periods = ['today', 'week', 'month'];
    const snapshotPayload = {};

    for (const period of periods) {
      try {
        const res = await axios.get(
          `/organizations/${organizationId}/kxtill/sync/dashboard`,
          { params: { branchId, period }, timeout: SYNC_HTTP_TIMEOUT_MS }
        );
        snapshotPayload[period] = res.data?.snapshot || null;
      } catch (err) {
        snapshotPayload[period] = null;
      }
    }

    const anyContent = periods.some((p) => snapshotPayload[p]);
    if (anyContent) {
      saveDashboardSnapshot(organizationId, branchId, snapshotPayload);
    }
  } catch (error) {
    results.errors.push(`Dashboard snapshot sync: ${describeError(error)}`);
  }
};

// ============================================================
// QUEUE PROCESSOR
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
            const response = await axios.post(
              `/organizations/${organizationId}/kxtill/sales/offline`,
              payload,
              { timeout: SYNC_HTTP_TIMEOUT_MS }
            );
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
          await updateSyncItemStatus(
            item.id,
            'FAILED',
            `Max retries exceeded: ${message}`
          );
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

  await clearProducts();
  await clearProductUnits();
  await clearBranchProducts();

  const productsResponse = await axios.get(
    `/organizations/${organizationId}/kxtill/sync/products`,
    { params: { branchId }, timeout: SYNC_HTTP_TIMEOUT_MS }
  );

  const productsData = productsResponse.data || {};
  const productsList = productsData.products || productsData.items || [];

  for (const product of productsList) {
    const productId = product.productId || product.id;

    await upsertProduct({
      id: productId,
      name: product.name,
      sku: product.sku || null,
      description: product.description || null,
      category: product.category || null,
      taxRate: parseFloat(product.taxRate) || 0,
      cost: parseFloat(product.cost) || 0,
      baseUnitId: product.baseUnit?.id || null,
      updatedAt: product.updatedAt,
      
    });

    if (Array.isArray(product.units)) {
      for (const unit of product.units) {
        await upsertProductUnit({
          id: unit.id,
          productId,
          name: unit.name,
          abbreviation: unit.abbreviation,
          unitType: unit.unitType || 'unit',
          conversionQty: parseFloat(unit.conversionQty) || 1,
          price: parseFloat(unit.price) || 0,
          cost: unit.cost != null ? parseFloat(unit.cost) : null,
          isBaseUnit: unit.isBaseUnit ? 1 : 0,
          barcode: unit.barcode || null,
        });
      }
    }

    if (product.id && product.branchId) {
      await upsertBranchProduct({
        id: product.id,
        productId: product.productId,
        branchId: product.branchId,
        stock: parseFloat(product.stock) || 0,
        minStock: parseFloat(product.minStock) || 0,
        isAvailable: product.isAvailable ? 1 : 0,
        updatedAt: product.updatedAt,
      });
    }
  }

  if (productsData.version) {
    await setLastProductSync(productsData.version);
  }

  const branchResponse = await axios.get(
    `/organizations/${organizationId}/kxtill/sync/branch-products`,
    { params: { branchId }, timeout: SYNC_HTTP_TIMEOUT_MS }
  );

  const branchData = branchResponse.data || {};
  const branchProductsList = branchData.branchProducts || branchData.items || [];

  for (const bp of branchProductsList) {
    await upsertBranchProduct({
      id: bp.id,
      productId: bp.productId,
      branchId: bp.branchId,
      stock: parseFloat(bp.stock) || 0,
      minStock: parseFloat(bp.minStock) || 0,
      isAvailable: bp.isAvailable ? 1 : 0,
      updatedAt: bp.updatedAt,
    });

    if (bp.product) {
      await upsertProduct({
        id: bp.product.id,
        name: bp.product.name,
        sku: bp.product.sku || null,
        description: bp.product.description || null,
        category: bp.product.category || null,
        taxRate: parseFloat(bp.product.taxRate) || 0,
        cost: parseFloat(bp.product.cost) || 0,
        baseUnitId: bp.product.baseUnit?.id || null,
        updatedAt: bp.updatedAt,
      });

      if (Array.isArray(bp.product.units)) {
        for (const unit of bp.product.units) {
          await upsertProductUnit({
            id: unit.id,
            productId: bp.product.id,
            name: unit.name,
            abbreviation: unit.abbreviation,
            unitType: unit.unitType || 'unit',
            conversionQty: parseFloat(unit.conversionQty) || 1,
            price: parseFloat(unit.price) || 0,
            cost: unit.cost != null ? parseFloat(unit.cost) : null,
            isBaseUnit: unit.isBaseUnit ? 1 : 0,
            barcode: unit.barcode || null,
          });
        }
      }
    }
  }

  if (branchData.version) {
    await setLastBranchSync(branchData.version);
  }

  await setSyncMetadata('last_branch_full_pull', new Date().toISOString());

  try {
    const customersResponse = await axios.get(
      `/organizations/${organizationId}/kxtill/customers/sync`,
      { timeout: SYNC_HTTP_TIMEOUT_MS }
    );
    const customersData = customersResponse.data || {};
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
        console.warn(
          `Customer cache write failed (${customer.name}):`,
          describeError(err)
        );
      }
    }

    if (customersData.serverTime) {
      await setLastCustomerSync(customersData.serverTime);
    }
  } catch (err) {
    console.warn(
      'Customer seed during initialSync failed:',
      describeError(err)
    );
  }

  return { success: true };
};

// ============================================================
// AUTO-SYNC LIFECYCLE
// ============================================================

let syncInterval = null;

export const startAutoSync = (intervalSeconds = 60) => {
  if (syncInterval) clearInterval(syncInterval);

  sync(getStoredActiveBranchId());

  syncInterval = setInterval(() => {
    sync(getStoredActiveBranchId());
  }, intervalSeconds * 1000);
};

export const stopAutoSync = () => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
};

export const forceSync = async (branchId) => {
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
};

export default syncEngine;