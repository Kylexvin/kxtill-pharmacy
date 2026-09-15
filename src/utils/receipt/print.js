// src/utils/receipt/print.js
//
// Opens a new window with a monospace receipt and print/close buttons.
// Returns true if the window opened, false if popup was blocked.

export const openPrintWindow = (receiptText, title = 'Receipt') => {
  if (!receiptText) return false;

  const win = window.open('', '_blank', 'width=400,height=600');
  if (!win) return false;

  // Escape so receipt text can't break out of the <pre>
  const escapeHtml = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const safeTitle = escapeHtml(title);

  win.document.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${safeTitle}</title>
        <style>
          body {
            font-family: 'Courier New', monospace;
            padding: 20px;
            max-width: 350px;
            margin: 0 auto;
            background: #fff;
            color: #000;
          }
          pre {
            white-space: pre-wrap;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            margin: 0;
          }
          .actions {
            text-align: center;
            margin-top: 20px;
          }
          .actions button {
            padding: 8px 20px;
            font-size: 14px;
            cursor: pointer;
            margin: 0 4px;
            border: 1px solid #ccc;
            border-radius: 4px;
            background: #f5f5f5;
          }
          .actions button:hover { background: #e5e5e5; }
          @media print { .actions { display: none; } }
        </style>
      </head>
      <body>
        <pre>${escapeHtml(receiptText)}</pre>
        <div class="actions">
          <button onclick="window.print()">Print</button>
          <button onclick="window.close()">Close</button>
        </div>
      </body>
    </html>`);
  win.document.close();
  return true;
};

export default openPrintWindow;