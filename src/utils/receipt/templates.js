// src/utils/receipt/templates.js
//
// Pure receipt renderers. Each takes the structured receipt payload
// (from /sales/:saleId/receipt or built locally after a POS sale) and
// returns a monospace text block suitable for thermal printers.
//
// No React, no side effects. Safe to unit test.
//
// Payload shape (see backend receipt.service.js):
//   {
//     shop:     { name, phone, address, email, taxNumber }
//     receipt:  { number, header, footer, showTax, showCustomer,
//                 showCashier, currency, decimalPlaces, template }
//     sale:     { id, reference, createdAt, customerName, cashierName,
//                 branchName, organizationName }
//     items:    [{ name, sku, quantity, unitAbbrev, unitPrice, total }]
//     totals:   { subtotal, tax, taxRate, discount, total }
//     payments: [{ method, amount, reference }]
//   }

// ============================================================
// HELPERS
// ============================================================
const pad = (value, width, align = 'left') => {
  const s = String(value ?? '');
  if (s.length >= width) return s.slice(0, width);
  const padLen = width - s.length;
  if (align === 'right') return ' '.repeat(padLen) + s;
  if (align === 'center') {
    const left = Math.floor(padLen / 2);
    return ' '.repeat(left) + s + ' '.repeat(padLen - left);
  }
  return s + ' '.repeat(padLen);
};

const money = (amount, decimals = 2) => {
  const n = Number(amount || 0);
  return n.toFixed(decimals);
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hh}:${mm}`;
};

// ============================================================
// CLASSIC — 40-char thermal
// ============================================================
export const renderClassic = (data) => {
  const W = 40;
  const line = '-'.repeat(W);
  const lines = [];
  const { shop, receipt, sale, items, totals, payments } = data;
  const dec = receipt.decimalPlaces ?? 2;

  lines.push(pad(shop.name.toUpperCase(), W, 'center'));
  if (shop.phone) lines.push(pad(`Tel: ${shop.phone}`, W, 'center'));
  if (shop.address) lines.push(pad(shop.address, W, 'center'));
  if (shop.email) lines.push(pad(shop.email, W, 'center'));
  if (shop.taxNumber) lines.push(pad(`Tax No: ${shop.taxNumber}`, W, 'center'));
  lines.push(line);

  if (receipt.header) {
    lines.push(pad(receipt.header, W, 'center'));
    lines.push(line);
  }

  if (sale.branchName) lines.push(sale.branchName);
  lines.push(`Receipt #: ${receipt.number}`);
  lines.push(`Date: ${fmtDate(sale.createdAt)}`);
  if (receipt.showCashier && sale.cashierName) {
    lines.push(`Cashier: ${sale.cashierName}`);
  }
  if (receipt.showCustomer && sale.customerName) {
    lines.push(`Customer: ${sale.customerName}`);
  }
  lines.push(line);

  lines.push(pad('Item', 20) + pad('Qty', 8) + pad('Price', 12, 'right'));
  lines.push(line);

  for (const item of items) {
    const name =
      item.name.length > 18 ? item.name.slice(0, 17) + '…' : item.name;
    lines.push(
      pad(name, 20) + pad(item.quantity, 8) + pad(money(item.total, dec), 12, 'right')
    );
  }
  lines.push(line);

  lines.push(pad('Subtotal', 28) + pad(money(totals.subtotal, dec), 12, 'right'));
  if (receipt.showTax && totals.tax > 0) {
    lines.push(pad('Tax', 28) + pad(money(totals.tax, dec), 12, 'right'));
  }
  if (totals.discount > 0) {
    lines.push(pad('Discount', 28) + pad('-' + money(totals.discount, dec), 12, 'right'));
  }
  lines.push(
    pad(`TOTAL (${receipt.currency})`, 28) + pad(money(totals.total, dec), 12, 'right')
  );
  lines.push(line);

  if (payments.length > 0) {
    for (const p of payments) {
      lines.push(pad(p.method, 28) + pad(money(p.amount, dec), 12, 'right'));
    }
  } else {
    lines.push(pad('CASH', 28) + pad(money(totals.total, dec), 12, 'right'));
  }
  lines.push(line);

  lines.push(pad(receipt.footer, W, 'center'));

  return lines.join('\n');
};

// ============================================================
// COMPACT — 32-char thermal (small printers)
// ============================================================
export const renderCompact = (data) => {
  const W = 32;
  const line = '-'.repeat(W);
  const lines = [];
  const { shop, receipt, sale, items, totals, payments } = data;
  const dec = receipt.decimalPlaces ?? 2;

  lines.push(pad(shop.name.toUpperCase(), W, 'center'));
  if (shop.phone) lines.push(pad(shop.phone, W, 'center'));
  lines.push(line);
  lines.push(`#${receipt.number}`);
  lines.push(fmtDate(sale.createdAt));
  if (receipt.showCashier && sale.cashierName) {
    lines.push(`Cashier: ${sale.cashierName}`);
  }
  lines.push(line);

  for (const item of items) {
    const name =
      item.name.length > 20 ? item.name.slice(0, 19) + '…' : item.name;
    lines.push(`${item.quantity}x ${name}`);
    lines.push(pad('', 20) + pad(money(item.total, dec), 12, 'right'));
  }
  lines.push(line);

  lines.push(pad('Subtotal', 20) + pad(money(totals.subtotal, dec), 12, 'right'));
  if (receipt.showTax && totals.tax > 0) {
    lines.push(pad('Tax', 20) + pad(money(totals.tax, dec), 12, 'right'));
  }
  if (totals.discount > 0) {
    lines.push(pad('Disc', 20) + pad('-' + money(totals.discount, dec), 12, 'right'));
  }
  lines.push(pad('TOTAL', 20) + pad(money(totals.total, dec), 12, 'right'));
  lines.push(line);

  if (payments.length > 0) {
    const p = payments[0];
    lines.push(pad(p.method, 20) + pad(money(p.amount, dec), 12, 'right'));
  }
  lines.push(line);
  lines.push(pad(receipt.footer, W, 'center'));

  return lines.join('\n');
};

// ============================================================
// MODERN — 48-char box-drawing (A5/email)
// ============================================================
export const renderModern = (data) => {
  const W = 48;
  const line = '─'.repeat(W);
  const dbl = '═'.repeat(W);
  const lines = [];
  const { shop, receipt, sale, items, totals, payments } = data;
  const dec = receipt.decimalPlaces ?? 2;

  lines.push(dbl);
  lines.push(pad(shop.name.toUpperCase(), W, 'center'));
  lines.push(dbl);
  if (shop.address) lines.push(pad(shop.address, W, 'center'));
  if (shop.phone) lines.push(pad(shop.phone, W, 'center'));
  if (shop.email) lines.push(pad(shop.email, W, 'center'));
  if (shop.taxNumber) lines.push(pad(`TAX: ${shop.taxNumber}`, W, 'center'));
  lines.push(line);

  if (receipt.header) {
    lines.push(pad(receipt.header, W, 'center'));
    lines.push(line);
  }

  lines.push(`Receipt:  ${receipt.number}`);
  lines.push(`Date:     ${fmtDate(sale.createdAt)}`);
  if (sale.branchName) lines.push(`Branch:   ${sale.branchName}`);
  if (receipt.showCashier && sale.cashierName) {
    lines.push(`Cashier:  ${sale.cashierName}`);
  }
  if (receipt.showCustomer && sale.customerName) {
    lines.push(`Customer: ${sale.customerName}`);
  }
  lines.push(line);

  lines.push(pad('Item', 24) + pad('Qty', 6) + pad('Price', 18, 'right'));
  lines.push(line);

  for (const item of items) {
    const name =
      item.name.length > 22 ? item.name.slice(0, 21) + '…' : item.name;
    lines.push(
      pad(name, 24) +
        pad(item.quantity, 6) +
        pad(money(item.total, dec), 18, 'right')
    );
  }
  lines.push(line);

  lines.push(pad('Subtotal', 30) + pad(money(totals.subtotal, dec), 18, 'right'));
  if (receipt.showTax && totals.tax > 0) {
    const label = totals.taxRate > 0 ? `Tax (${totals.taxRate}%)` : 'Tax';
    lines.push(pad(label, 30) + pad(money(totals.tax, dec), 18, 'right'));
  }
  if (totals.discount > 0) {
    lines.push(pad('Discount', 30) + pad('-' + money(totals.discount, dec), 18, 'right'));
  }
  lines.push(dbl);
  lines.push(
    pad(`TOTAL (${receipt.currency})`, 30) +
      pad(money(totals.total, dec), 18, 'right')
  );
  lines.push(dbl);

  if (payments.length > 0) {
    for (const p of payments) {
      lines.push(pad(p.method, 30) + pad(money(p.amount, dec), 18, 'right'));
    }
  }
  lines.push(line);

  lines.push(pad(receipt.footer, W, 'center'));
  lines.push(dbl);

  return lines.join('\n');
};

// ============================================================
// DISPATCHER
// ============================================================
export const TEMPLATES = {
  classic: renderClassic,
  compact: renderCompact,
  modern: renderModern,
};

/**
 * Render a receipt from structured data.
 * @param {object} data - structured receipt payload
 * @param {string} [template='classic'] - 'classic' | 'compact' | 'modern'
 * @returns {string} monospace text block
 */
export const renderReceipt = (data, template) => {
  const name = template || data?.receipt?.template || 'classic';
  const renderer = TEMPLATES[name] || TEMPLATES.classic;
  try {
    return renderer(data);
  } catch (err) {
    console.error(`Receipt render failed (${name}):`, err);
    return 'Unable to render receipt. Please try again.';
  }
};

export default renderReceipt;