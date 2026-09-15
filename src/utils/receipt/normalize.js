// src/utils/receipt/normalize.js
//
// Normalizes any receipt-like object into the canonical payload shape.
// Handles two sources:
//   (a) Backend /sales/:saleId/receipt — already close to canonical
//   (b) POS-local post-sale object — smaller, needs reshaping + settings fill
//
// Settings values are passed in as a fallback so the local path renders
// with the same formatting as the server would.

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const normalizeReceipt = (raw, settings = {}) => {
  if (!raw) return null;

  // If it already has the canonical top-level shape, keep most of it.
  const isCanonical = raw.shop && raw.receipt && raw.totals;

  if (isCanonical) {
    return {
      shop: raw.shop,
      receipt: raw.receipt,
      sale: raw.sale,
      items: raw.items || [],
      totals: raw.totals,
      payments: raw.payments || [],
    };
  }

  // Otherwise treat it as a POS-local payload and reshape.
  const sale = raw.sale || {};
  const items = (raw.items || []).map((i) => ({
    id: i.id,
    productId: i.productId,
    name: i.productName || i.name || 'Unknown',
    sku: i.sku || null,
    quantity: safeNum(i.quantity || 1),
    unitAbbrev: i.unitName || i.unitAbbrev || '',
    unitPrice: safeNum(i.unitPrice || i.price || 0),
    total: safeNum(i.total || (i.unitPrice || i.price || 0) * (i.quantity || 1)),
  }));

  const subtotal = safeNum(raw.subtotal);
  const tax = safeNum(raw.taxAmount ?? raw.tax);
  const discount = safeNum(raw.discount);
  const total = safeNum(raw.total ?? subtotal + tax - discount);

  const payments =
    raw.payments && raw.payments.length > 0
      ? raw.payments.map((p) => ({
          method: p.method || 'CASH',
          amount: safeNum(p.amount || total),
          reference: p.reference || null,
        }))
      : [
          {
            method: 'CASH',
            amount: total,
            reference: null,
          },
        ];

  return {
    shop: {
      name: raw.shopName || settings.shopName || 'Shop',
      phone: raw.shopPhone || settings.shopPhone || '',
      address: raw.shopAddress || settings.shopAddress || '',
      email: raw.shopEmail || settings.shopEmail || '',
      taxNumber: raw.taxNumber || settings.taxNumber || '',
    },
    receipt: {
      number: sale.reference || sale.id?.slice(0, 8).toUpperCase() || '—',
      header: raw.receiptHeader ?? settings.receiptHeader ?? '',
      footer: raw.receiptFooter ?? settings.receiptFooter ?? 'Thank you!',
      showTax: settings.showTax !== false,
      showCustomer: settings.showCustomer !== false,
      showCashier: settings.showCashier !== false,
      currency: settings.currency || 'KES',
      decimalPlaces: settings.decimalPlaces ?? 2,
      template: settings.receiptTemplate || 'classic',
    },
    sale: {
      id: sale.id || null,
      reference: sale.reference || sale.id?.slice(0, 8).toUpperCase() || '—',
      createdAt: sale.createdAt || new Date().toISOString(),
      customerName: sale.customerName || null,
      cashierName: sale.cashierName || null,
      branchName: raw.branchName || null,
      organizationName: raw.organizationName || settings.shopName || null,
    },
    items,
    totals: {
      subtotal,
      tax,
      taxRate: safeNum(raw.taxRate),
      discount,
      total,
    },
    payments,
  };
};

export default normalizeReceipt;