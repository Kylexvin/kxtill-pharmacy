// src/pages/POS/ReceiptModal.jsx
import React from 'react';
import { X, Check } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import styles from './ReceiptModal.module.css';

const ReceiptModal = ({ receipt, onClose }) => {
  const {
    settings,
    getShopName,
    getTaxNumber,
    getReceiptHeader,
    getReceiptFooter,
    getDecimalPlaces,
    getCurrency,
    formatDate,
    formatTime,
  } = useSettings();

  if (!receipt) return null;

  const decimals = getDecimalPlaces();
  const currency = getCurrency();
  const shopName = getShopName();
  const taxNumber = getTaxNumber();
  const receiptHeader = getReceiptHeader();
  const receiptFooter = getReceiptFooter();

  const showTax = settings.showTax !== false;
  const showCustomer = settings.showCustomer !== false;
  const showCashier = settings.showCashier !== false;

  // Build receipt text from structured data.
  // Monospace layout — keep numbers aligned, no currency symbol inline
  // (symbol only appears on the TOTAL line for clarity).
  const buildReceiptText = () => {
    const lines = [];
    const width = 40;
    const line = '-'.repeat(width);
    const center = (str) => {
      const pad = Math.max(0, Math.floor((width - str.length) / 2));
      return ' '.repeat(pad) + str;
    };
    const formatAmount = (n) => Number(n || 0).toFixed(decimals);

    // -------- Header --------
    lines.push(center(shopName));
    if (taxNumber) lines.push(center(`Tax: ${taxNumber}`));
    lines.push(center('KxTill POS'));
    lines.push(line);

    // -------- Receipt Header --------
    if (receiptHeader) {
      lines.push(receiptHeader);
      lines.push(line);
    }

    // -------- Branch --------
    if (receipt.branchName) {
      lines.push(receipt.branchName);
    }

    // -------- Reference --------
    if (receipt.sale?.reference) {
      lines.push(`Receipt #: ${receipt.sale.reference}`);
    } else if (receipt.sale?.id) {
      lines.push(`Sale #: ${receipt.sale.id.substring(0, 8).toUpperCase()}`);
    }

    // -------- Date --------
    if (receipt.sale?.createdAt) {
      const d = receipt.sale.createdAt;
      lines.push(`Date: ${formatDate(d)} ${formatTime(d)}`);
    }

    // -------- Customer (conditional) --------
    if (showCustomer && receipt.sale?.customerName) {
      lines.push(`Customer: ${receipt.sale.customerName}`);
    }

    // -------- Cashier (conditional) --------
    if (showCashier) {
      const cashierName =
        receipt.sale?.cashierName ||
        receipt.cashierName ||
        receipt.sale?.user?.firstName ||
        null;
      if (cashierName) {
        lines.push(`Cashier: ${cashierName}`);
      }
    }

    lines.push(line);

    // -------- Items (non-mutating) --------
    let items = [];
    if (Array.isArray(receipt.items) && receipt.items.length > 0) {
      items = receipt.items;
    } else if (receipt.sale?.items) {
      try {
        const parsed =
          typeof receipt.sale.items === 'string'
            ? JSON.parse(receipt.sale.items)
            : receipt.sale.items;
        if (Array.isArray(parsed)) items = parsed;
      } catch {
        // ignore malformed
      }
    }
    if (items.length === 0 && Array.isArray(receipt.cartItems)) {
      items = receipt.cartItems;
    }
    if (items.length === 0 && Array.isArray(receipt.saleItems)) {
      items = receipt.saleItems;
    }

    lines.push(`Item`.padEnd(20) + `Qty`.padEnd(8) + `Price`.padStart(12));
    lines.push(line);

    let subtotal = 0;
    for (const item of items) {
      const name = item.productName || item.name || 'Unknown';
      const qty = item.quantity || 1;
      const price = item.unitPrice || item.price || 0;
      const lineTotal = qty * price;
      subtotal += lineTotal;

      const nameDisplay = name.length > 18 ? name.substring(0, 18) + '…' : name;
      lines.push(
        nameDisplay.padEnd(20) +
          qty.toString().padEnd(8) +
          formatAmount(lineTotal).padStart(12)
      );
    }

    lines.push(line);

    // -------- Totals --------
    const taxAmount = receipt.taxAmount || receipt.sale?.taxAmount || 0;
    const totalAmount = receipt.total || receipt.sale?.totalAmount || subtotal;

    lines.push(`Subtotal`.padEnd(28) + formatAmount(subtotal).padStart(12));

    if (showTax && taxAmount > 0) {
      lines.push(`Tax`.padEnd(28) + formatAmount(taxAmount).padStart(12));
    }

    lines.push(
      `TOTAL (${currency})`.padEnd(28) + formatAmount(totalAmount).padStart(12)
    );
    lines.push(line);

    // -------- Payments --------
    let payments = [];
    if (Array.isArray(receipt.payments) && receipt.payments.length > 0) {
      payments = receipt.payments;
    } else if (receipt.sale?.payments) {
      try {
        const parsed =
          typeof receipt.sale.payments === 'string'
            ? JSON.parse(receipt.sale.payments)
            : receipt.sale.payments;
        if (Array.isArray(parsed)) payments = parsed;
      } catch {
        // ignore
      }
    }

    if (payments.length > 0) {
      for (const p of payments) {
        const method = (p.method || 'CASH').toUpperCase();
        const amount = p.amount || totalAmount;
        lines.push(method.padEnd(28) + formatAmount(amount).padStart(12));
      }
    } else {
      lines.push('CASH'.padEnd(28) + formatAmount(totalAmount).padStart(12));
    }

    lines.push(line);

    // -------- Footer --------
    if (receiptFooter) {
      lines.push(receiptFooter);
    } else {
      lines.push(center('THANK YOU'));
      lines.push(center('Visit us again'));
    }

    return lines.join('\n');
  };

  // Prefer pre-built text if present (historical receipts preserve what
  // was originally printed). Fresh sales build from current settings.
  const receiptText = receipt.text || buildReceiptText();

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Check size={18} className={styles.successIcon} />
            <span>Sale Complete</span>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className={styles.receiptArea}>
          <pre className={styles.receiptText}>{receiptText}</pre>
        </div>

        <div className={styles.footer}>
          <button
            className={styles.newSaleBtn}
            onClick={onClose}
            type="button"
          >
            New sale
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;