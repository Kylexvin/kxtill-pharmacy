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
  upsertProduct,
  clearProducts,
  upsertProductUnit,
  clearProductUnits,
  upsertBranchProduct,
  clearBranchProducts,
  getPendingSyncItems,
  updateSyncItemStatus,
} from '../db/sqlite';

let isOnline = navigator.onLine;

export const getOnlineStatus = () => isOnline;

// Lets an external, verified connectivity check (e.g. TopBar's heartbeat)
// override the browser's navigator.onLine-based guess, so sync() and the
// UI's connectivity indicator agree on the same value.
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
    salesPushed: 0,
    salesFailed: 0,
    productsUpdated: 0,
    branchProductsUpdated: 0,
    receiptsFetched: 0,
    errors: [],
  };

  try {
    await pushPendingSales(results);
    await pullProductUpdates(results, branchId);
    await pullBranchProductUpdates(results, branchId);
    await fetchPendingReceipts(results);
    return { success: true, results };
  } catch (error) {
    results.errors.push(error.message);
    return { success: false, results, error: error.message };
  }
};

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

      const payload = {
        clientSaleId: sale.id,
        branchId: sale.branchId,
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
      
      // Capture and store server sale ID
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

// New: Fetch and cache official receipts for synced sales
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
      
      // Check if receipt text exists in response
      const receiptText = res.data?.text || res.data?.receipt || JSON.stringify(res.data);
      if (receiptText) {
        await saveReceiptText(sale.id, receiptText);
        fetchedCount++;
      }
    } catch (err) {
      // Leave it null — will retry next interval
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
      // Store product
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

      // Store units with barcode
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

      // Store branch product with stock
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

export const processSyncQueue = async () => {
  if (!isOnline) {
    return;
  }

  const items = await getPendingSyncItems(20);

  if (items.length === 0) {
    return;
  }

  for (const item of items) {
    try {
      const payload = JSON.parse(item.payload);
      const organizationId = getOrgId();

      if (!organizationId) {
        await updateSyncItemStatus(item.id, 'FAILED', 'No organization ID found');
        continue;
      }

      switch (item.entityType) {
        case 'sale':
          const response = await axios.post(
            `/organizations/${organizationId}/kxtill/sales/offline`,
            payload
          );
          // Capture server sale ID if this is a sale
          const serverSaleId = response.data?.sale?.id;
          if (serverSaleId && payload.clientSaleId) {
            await setSaleServerId(payload.clientSaleId, serverSaleId);
          }
          break;
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
      // Store product
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

      // Store units with barcode
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

      // Store branch product with stock
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

    return { success: true };

  } catch (error) {
    throw error;
  }
};

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