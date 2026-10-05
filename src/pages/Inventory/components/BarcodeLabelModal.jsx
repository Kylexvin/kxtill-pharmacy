// src/pages/Inventory/components/BarcodeLabelModal.jsx
import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { X, Printer } from 'lucide-react';
import styles from './BarcodeLabelModal.module.css';

const BarcodeLabelModal = ({
  isOpen,
  onClose,
  barcode,
  productName,
  price,
  currency = 'KES',
}) => {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !barcode || !svgRef.current) return;
    try {
      JsBarcode(svgRef.current, String(barcode), {
        format: 'EAN13',
        width: 2,
        height: 70,
        displayValue: true,
        fontSize: 14,
        margin: 6,
      });
    } catch (err) {
      console.error('Barcode render failed:', err);
    }
  }, [isOpen, barcode]);

  const handlePrint = () => {
    if (!svgRef.current) return;
    const svgHTML = svgRef.current.outerHTML;
    const win = window.open('', '_blank', 'width=400,height=300');
    if (!win) {
      alert('Please allow popups to print the label');
      return;
    }
    win.document.write(`
      <html>
        <head>
          <title>Barcode ${barcode}</title>
          <style>
            body { font-family: system-ui, sans-serif; margin: 0; padding: 12px; text-align: center; }
            .name { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
            .price { font-size: 12px; margin-bottom: 8px; }
            svg { display: block; margin: 0 auto; }
          </style>
        </head>
        <body>
          <div class="name">${productName || ''}</div>
          <div class="price">${currency} ${Number(price || 0).toFixed(2)}</div>
          ${svgHTML}
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 300);
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>Barcode Label</div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.productName}>{productName}</div>
          <div className={styles.productPrice}>
            {currency} {Number(price || 0).toFixed(2)}
          </div>
          <div className={styles.barcodeWrap}>
            <svg ref={svgRef} />
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>
            Close
          </button>
          <button type="button" className={styles.printBtn} onClick={handlePrint}>
            <Printer size={14} />
            Print Label
          </button>
        </div>
      </div>
    </div>
  );
};

export default BarcodeLabelModal;