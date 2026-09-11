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
  getLastBranchSync,
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
  // customer sync support
  getUnsyncedCustomers,
  markCustomerSynced,
  replaceCustomerIdInSales,
  getLocalSale,
  upsertServerCustomer,
} from '../db/sqlite';

let isOnline = navigator.onLine;

export const getOnlineStatus = () => isOnline;

export const setOnlineStatus = (value) => {
  isOnline = value;
};

const getOrgId = () => {
  const org = localStorage.getItem('activeOrganization');
  if (!org) return null;
  try {
    const parsed = JSON.parse(org);
    return parsed.id || parsed;
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

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true;
    sync(getStoredActiveBranchId());
  });
  window.addEventListener('offline', () => {
    isOnline = false;
  });
}

export const sync = async (branchId) => {
  if (!isOnline) {
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

  // ORDER:
  //   1. Push unsynced local customers (offline-created) so they get real ids
  //   2. Pull server customers that changed since last sync (incremental)
  //   3. Push sales (they can now reference real customerIds)
  //   4. Products, branch products, receipts
  // Every step is guarded so one failure never takes down the chain.

  try {
    await pushPendingCustomers(results);
  } catch (err) {
    results.errors.push(`Customer push fatal: ${err.message}`);
  }

  try {
    await pullCustomerUpdates(results);
  } catch (err) {
    results.errors.push(`Customer pull fatal: ${err.message}`);
  }

  try {
    await pushPendingSales(results);
  } catch (err) {
    results.errors.push(`Sales push fatal: ${err.message}`);
  }

  try {
    await pullProductUpdates(results, branchId);
  } catch (err) {
    results.errors.push(`Product pull fatal: ${err.message}`);
  }

  try {
    await pullBranchProductUpdates(results, branchId);
  } catch (err) {
    results.errors.push(`Branch product pull fatal: ${err.message}`);
  }

  try {
    await fetchPendingReceipts(results);
  } catch (err) {
    results.errors.push(`Receipt fetch fatal: ${err.message}`);
  }

  return { success: true, results };
};

// ============================================================
// CUSTOMERS — push first, then incremental pull
// ============================================================

const pushPendingCustomers = async (results) => {
  let pendingCustomers = [];

  try {
    pendingCustomers = await getUnsyncedCustomers();
  } catch (err) {
    results.errors.push(`Customer queue lookup failed: ${err.message}`);
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
        payload
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
          `markCustomerSynced failed for ${customer.name}: ${err.message}`
        );
      }

      try {
        await replaceCustomerIdInSales(customer.id, serverId);
      } catch (err) {
        results.errors.push(
          `replaceCustomerIdInSales failed for ${customer.name}: ${err.message}`
        );
      }

      results.customersPushed++;
    } catch (error) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;

      if (status === 409) {
        results.errors.push(`Customer conflict (${customer.name}): ${message}`);
        results.customersFailed++;
      } else if (status === 400 || status === 422) {
        results.errors.push(`Customer rejected (${customer.name}): ${message}`);
        results.customersFailed++;
      } else {
        results.customersFailed++;
      }
    }
  }
};

// Incremental pull — uses the serverTime from the previous response as
// the `since` cursor, exactly like products/branch-products. First call
// has no `since` and pulls everything; subsequent calls only get what
// changed.
const pullCustomerUpdates = async (results) => {
  try {
    const organizationId = getOrgId();
    if (!organizationId) {
      results.errors.push('No organization ID found for customer pull');
      return;
    }

    const lastSync = await getLastCustomerSync();

    const params = {};
    if (lastSync) params.since = lastSync;

    const response = await axios.get(
      `/organizations/${organizationId}/kxtill/customers/sync`,
      { params }
    );

    const data = response.data || {};
    const customersList = data.customers || data.items || [];

    if (customersList.length === 0) {
      // Still advance the cursor if the server returned a new serverTime
      if (data.serverTime) {
        await setLastCustomerSync(data.serverTime);
      }
      return;
    }

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
          `Customer cache write failed (${customer.name}): ${err.message}`
        );
      }
    }

    // Advance cursor so the next pull only fetches newer rows
    if (data.serverTime) {
      await setLastCustomerSync(data.serverTime);
    }
  } catch (error) {
    results.errors.push(`Customer pull failed: ${error.message}`);
  }
};

// ============================================================
// SALES — push pending sales, waiting on unresolved customers
// ============================================================

const pushPendingSales = async (results) => {
  const pendingSales = await getPendingSales();

  if (pendingSales.length === 0) {
    return;
  }

  for (const sale of pendingSales) {
    try {
      const items = JSON.parse(sale.items);
      const payments = JSON.parse(sale.payments);
      const organizationId = getOrgId();

      if (!organizationId) {
        results.errors.push('No organization ID found');
        continue;
      }

      let freshSale = sale;
      try {
        const reread = await getLocalSale(sale.id);
        if (reread) freshSale = reread;
      } catch {
        // fall back to the row we already have
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
        customerId: customerId || undefined,
        customerName: sale.customerName || undefined,
        items: items.map((item) => ({
          productId: item.productId,
          branchProductId: item.branchProductId,
          unitId: item.unitId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        paymentMethod: payments[0]?.method || 'CASH',
        paymentReference: payments[0]?.reference || undefined,
      };

      const response = await axios.post(
        `/organizations/${organizationId}/kxtill/sales/offline`,
        payload
      );

      await updateSaleStatus(sale.id, 'SYNCED');

      const serverSaleId = response.data?.sale?.id;
      if (serverSaleId) {
        await setSaleServerId(sale.id, serverSaleId);
      }

      results.salesPushed++;
    } catch (error) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;

      if (status === 409) {
        await updateSaleStatus(sale.id, 'SYNCED', 'Duplicate sale on server');
        results.salesPushed++;
      } else if (status === 400) {
        await updateSaleStatus(sale.id, 'FAILED', message);
        results.salesFailed++;
      } else {
        results.salesFailed++;
      }
    }
  }
};

// ============================================================
// RECEIPTS
// ============================================================

export const fetchPendingReceipts = async (results = null) => {
  if (!isOnline) return;

  const organizationId = getOrgId();
  if (!organizationId) return;

  const sales = await getSyncedSalesMissingReceipt();
  if (sales.length === 0) return;

  let fetchedCount = 0;

  for (const sale of sales) {
    try {
      const res = await axios.get(
        `/organizations/${organizationId}/kxtill/sales/${sale.serverSaleId}/receipt`,
        { timeout: 5000 }
      );

      const receiptText = res.data?.text || res.data?.receipt || JSON.stringify(res.data);
      if (receiptText) {
        await saveReceiptText(sale.id, receiptText);
        fetchedCount++;
      }
    } catch (err) {
      console.warn(`Receipt fetch failed for sale ${sale.id}:`, err.message);
      if (results) {
        results.errors.push(`Receipt fetch failed for ${sale.id}: ${err.message}`);
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

    const url = `/organizations/${organizationId}/kxtill/sync/products`;
    const params = {
      ...(lastSync ? { since: lastSync } : {}),
      branchId: branchId
    };

    const response = await axios.get(url, { params });
    const data = response.data;
    const productsList = data.products || data.items || [];

    if (productsList.length === 0) {
      return;
    }

    for (const product of productsList) {
      await upsertProduct({
        id: product.productId || product.id,
        name: product.name,
        sku: product.sku || null,
        description: product.description || null,
        category: product.category || null,
        taxRate: parseFloat(product.taxRate) || 0,
        baseUnitId: product.baseUnit?.id || null,
        updatedAt: product.updatedAt,
      });

      if (product.units) {
        for (const unit of product.units) {
          await upsertProductUnit({
            id: unit.id,
            productId: product.productId || product.id,
            name: unit.name,
            abbreviation: unit.abbreviation,
            unitType: unit.unitType || 'unit',
            conversionQty: parseFloat(unit.conversionQty) || 1,
            price: parseFloat(unit.price) || 0,
            isBaseUnit: unit.isBaseUnit ? 1 : 0,
            barcode: unit.barcode || null,
          });
        }
      }

      await upsertBranchProduct({
        id: product.id,
        productId: product.productId,
        branchId: product.branchId,
        stock: parseFloat(product.stock) || 0,
        minStock: parseFloat(product.minStock) || 0,
        isAvailable: product.isAvailable ? 1 : 0,
        updatedAt: product.updatedAt,
      });

      results.productsUpdated++;
    }

    if (data.version) {
      await setLastProductSync(data.version);
    }

  } catch (error) {
    results.errors.push(`Product sync: ${error.message}`);
  }
};

const pullBranchProductUpdates = async (results, branchId) => {
  try {
    const lastSync = await getLastBranchSync();
    const organizationId = getOrgId();

    if (!organizationId) {
      results.errors.push('No organization ID found');
      return;
    }

    if (!branchId) {
      results.errors.push('No branch ID provided');
      return;
    }

    const url = `/organizations/${organizationId}/kxtill/sync/branch-products`;
    const params = {
      branchId,
      ...(lastSync ? { since: lastSync } : {}),
    };

    const response = await axios.get(url, { params });
    const data = response.data;
    const branchProductsList = data.branchProducts || data.items || [];

    if (branchProductsList.length === 0) {
      return;
    }

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
          baseUnitId: bp.product.baseUnit?.id || null,
          updatedAt: bp.updatedAt,
        });

        if (bp.product.units) {
          for (const unit of bp.product.units) {
            await upsertProductUnit({
              id: unit.id,
              productId: bp.product.id,
              name: unit.name,
              abbreviation: unit.abbreviation,
              unitType: unit.unitType || 'unit',
              conversionQty: parseFloat(unit.conversionQty) || 1,
              price: parseFloat(unit.price) || 0,
              isBaseUnit: unit.isBaseUnit ? 1 : 0,
              barcode: unit.barcode || null,
            });
          }
        }
      }

      results.branchProductsUpdated++;
    }

    if (data.version) {
      await setLastBranchSync(data.version);
    }

  } catch (error) {
    results.errors.push(`Branch product sync: ${error.message}`);
  }
};

// ============================================================
// QUEUE PROCESSOR — same order: customers before sales
// ============================================================

export const processSyncQueue = async () => {
  if (!isOnline) {
    return;
  }

  const items = await getPendingSyncItems(20);

  if (items.length === 0) {
    return;
  }

  const organizationId = getOrgId();
  if (!organizationId) {
    return;
  }

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
            payload
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
            payload
          );
          const serverSaleId = response.data?.sale?.id;
          if (serverSaleId && payload.clientSaleId) {
            await setSaleServerId(payload.clientSaleId, serverSaleId);
          }
          break;
        }
        default:
          await updateSyncItemStatus(item.id, 'FAILED', `Unknown entity type: ${item.entityType}`);
          continue;
      }

      await updateSyncItemStatus(item.id, 'SYNCED');

    } catch (error) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;

      if (status === 409) {
        await updateSyncItemStatus(item.id, 'SYNCED', 'Already exists on server');
      } else if (status === 400 || status === 422) {
        await updateSyncItemStatus(item.id, 'FAILED', message);
      } else if (item.attempts >= 5) {
        await updateSyncItemStatus(item.id, 'FAILED', `Max retries exceeded: ${message}`);
      } else {
        await updateSyncItemStatus(item.id, 'PENDING', message);
      }
    }
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

  if (!organizationId) {
    throw new Error('No organization ID found');
  }

  if (!branchId) {
    throw new Error('No branch ID provided');
  }

  try {
    await clearProducts();
    await clearProductUnits();
    await clearBranchProducts();

    const productsResponse = await axios.get(
      `/organizations/${organizationId}/kxtill/sync/products`,
      { params: { branchId } }
    );
    const productsData = productsResponse.data;
    const productsList = productsData.products || productsData.items || [];
    console.log('Products to sync:', productsList.length);

    for (const product of productsList) {
      await upsertProduct({
        id: product.productId || product.id,
        name: product.name,
        sku: product.sku || null,
        description: product.description || null,
        category: product.category || null,
        taxRate: parseFloat(product.taxRate) || 0,
        baseUnitId: product.baseUnit?.id || null,
        updatedAt: product.updatedAt,
      });

      if (product.units) {
        for (const unit of product.units) {
          await upsertProductUnit({
            id: unit.id,
            productId: product.productId || product.id,
            name: unit.name,
            abbreviation: unit.abbreviation,
            unitType: unit.unitType || 'unit',
            conversionQty: parseFloat(unit.conversionQty) || 1,
            price: parseFloat(unit.price) || 0,
            isBaseUnit: unit.isBaseUnit ? 1 : 0,
            barcode: unit.barcode || null,
          });
        }
      }

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

    if (productsData.version) {
      await setLastProductSync(productsData.version);
    }

    const branchResponse = await axios.get(
      `/organizations/${organizationId}/kxtill/sync/branch-products`,
      { params: { branchId } }
    );
    const branchData = branchResponse.data;
    const branchProductsList = branchData.branchProducts || branchData.items || [];
    console.log('Branch products to sync:', branchProductsList.length);

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
          baseUnitId: bp.product.baseUnit?.id || null,
          updatedAt: bp.updatedAt,
        });

        if (bp.product.units) {
          for (const unit of bp.product.units) {
            await upsertProductUnit({
              id: unit.id,
              productId: bp.product.id,
              name: unit.name,
              abbreviation: unit.abbreviation,
              unitType: unit.unitType || 'unit',
              conversionQty: parseFloat(unit.conversionQty) || 1,
              price: parseFloat(unit.price) || 0,
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

    // Seed customer cache (full pull, no `since`)
    try {
      const customersResponse = await axios.get(
        `/organizations/${organizationId}/kxtill/customers/sync`
      );
      const customersData = customersResponse.data || {};
      const customersList = customersData.customers || customersData.items || [];
      console.log('Customers to cache:', customersList.length);

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
          console.warn(`Customer cache write failed (${customer.name}):`, err.message);
        }
      }

      if (customersData.serverTime) {
        await setLastCustomerSync(customersData.serverTime);
      }
    } catch (err) {
      // Non-fatal — the next sync() cycle will pull
      console.warn('Customer seed during initialSync failed:', err.message);
    }

    return { success: true };

  } catch (error) {
    throw error;
  }
};

// ============================================================
// AUTO-SYNC LIFECYCLE
// ============================================================

let syncInterval = null;

export const startAutoSync = (intervalSeconds = 60) => {
  if (syncInterval) {
    clearInterval(syncInterval);
  }

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