// src/pages/POS/ReceiptModal.jsx

import React from 'react';
import { X, Printer, Check } from 'lucide-react';
import styles from './ReceiptModal.module.css';

const ReceiptModal = ({ receipt, onClose }) => {
  if (!receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  // Build receipt text from structured data
  const buildReceiptText = () => {
    const lines = [];
    const width = 40;
    const line = '-'.repeat(width);

    // Header
    lines.push(' '.repeat((width - 12) / 2) + 'KXBYTE');
    lines.push(' '.repeat((width - 16) / 2) + 'KxTill POS');
    lines.push(line);

    // Branch
    if (receipt.branchName) {
      lines.push(receipt.branchName);
    }

    // Sale ID
    if (receipt.sale?.id) {
      lines.push(`Sale: ${receipt.sale.id}`);
    }

    // Date
    if (receipt.sale?.createdAt) {
      const date = new Date(receipt.sale.createdAt);
      lines.push(`Date: ${date.toLocaleString()}`);
    }

    // Customer
    if (receipt.sale?.customerName) {
      lines.push(`Customer: ${receipt.sale.customerName}`);
    }

    lines.push(line);

    // Items
    const items = receipt.items || [];
    if (items.length === 0 && receipt.sale?.items) {
      try {
        const parsed = JSON.parse(receipt.sale.items);
        items.push(...parsed);
      } catch (e) {}
    }

    // If still empty, try cartItems
    if (items.length === 0 && receipt.cartItems) {
      items.push(...receipt.cartItems);
    }

    // If still empty, try saleItems
    if (items.length === 0 && receipt.saleItems) {
      items.push(...receipt.saleItems);
    }

    // Headers
    lines.push(`Item`.padEnd(20) + `Qty`.padEnd(8) + `Price`.padStart(12));
    lines.push(line);

    let subtotal = 0;
    for (const item of items) {
      const name = item.productName || item.name || 'Unknown';
      const qty = item.quantity || 1;
      const price = item.unitPrice || item.price || 0;
      const totalPrice = qty * price;
      subtotal += totalPrice;

      const nameDisplay = name.length > 18 ? name.substring(0, 18) + '…' : name;
      lines.push(
        nameDisplay.padEnd(20) +
        qty.toString().padEnd(8) +
        totalPrice.toFixed(2).padStart(12)
      );
    }

    lines.push(line);

    // Totals
    const taxAmount = receipt.taxAmount || receipt.sale?.taxAmount || 0;
    const totalAmount = receipt.total || receipt.sale?.totalAmount || subtotal;

    lines.push(`Subtotal`.padEnd(28) + subtotal.toFixed(2).padStart(12));
    if (taxAmount > 0) {
      lines.push(`Tax`.padEnd(28) + taxAmount.toFixed(2).padStart(12));
    }
    lines.push(`Total`.padEnd(28) + totalAmount.toFixed(2).padStart(12));
    lines.push(line);

    // Payment info
    let payments = receipt.payments || [];
    if (payments.length === 0 && receipt.sale?.payments) {
      try {
        payments = JSON.parse(receipt.sale.payments);
      } catch (e) {}
    }

    if (payments.length > 0) {
      for (const p of payments) {
        const method = p.method || 'CASH';
        const amount = p.amount || totalAmount;
        lines.push(`${method}`.padEnd(28) + amount.toFixed(2).padStart(12));
      }
    } else {
      lines.push(`CASH`.padEnd(28) + totalAmount.toFixed(2).padStart(12));
    }

    lines.push(line);
    lines.push(' '.repeat((width - 12) / 2) + 'THANK YOU');
    lines.push(' '.repeat((width - 18) / 2) + 'Visit us again');

    return lines.join('\n');
  };

  const receiptText = receipt.text || buildReceiptText();

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Check size={18} className={styles.successIcon} />
            <span>Sale complete</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.receiptArea}>
          <pre className={styles.receiptText}>{receiptText}</pre>
        </div>

        <div className={styles.footer}>
          <button className={styles.printBtn} onClick={handlePrint}>
            <Printer size={16} />
            Print receipt
          </button>
          <button className={styles.newSaleBtn} onClick={onClose}>
            New sale
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;