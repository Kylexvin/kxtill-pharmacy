// Products/kxtill/src/pages/Reports/components/ExportsView.jsx
import React from 'react';
import {
  FileSpreadsheet,
  File,
  AlertCircle,
} from 'lucide-react';
import styles from '../Reports.module.css';

const ExportsView = ({ reports, exporting, onExport }) => {
  return (
    <>
      <div className={styles.reportsGrid}>
        {reports.map((report) => {
          const Icon = report.icon;
          const isCsvExporting = exporting === `${report.id}-csv`;
          const isPdfExporting = exporting === `${report.id}-pdf`;
          const isAnyExporting = isCsvExporting || isPdfExporting;
          const isDisabled = report.disabled;

          return (
            <div
              key={report.id}
              className={`${styles.reportCard} ${
                isDisabled ? styles.reportCardDisabled : ''
              }`}
            >
              <div className={styles.reportCardTop}>
                <div
                  className={`${styles.reportIcon} ${
                    isDisabled ? styles.reportIconDisabled : ''
                  }`}
                >
                  <Icon size={18} />
                </div>
                <div className={styles.reportTitleWrap}>
                  <div className={styles.reportTitleRow}>
                    <h3 className={styles.reportTitle}>{report.label}</h3>
                    {report.comingSoon && (
                      <span className={styles.comingSoonBadge}>
                        Soon
                      </span>
                    )}
                  </div>
                  <p className={styles.reportDescription}>
                    {report.description}
                  </p>
                </div>
              </div>

              <div className={styles.reportActions}>
                <button
                  type="button"
                  className={styles.exportBtn}
                  onClick={() => onExport(report.id, report.endpoint, 'csv')}
                  disabled={isAnyExporting || isDisabled}
                >
                  {isCsvExporting ? (
                    <span className={styles.spinnerSmall} />
                  ) : (
                    <FileSpreadsheet size={14} />
                  )}
                  <span>CSV</span>
                </button>

                <button
                  type="button"
                  className={styles.exportBtn}
                  onClick={() => onExport(report.id, report.endpoint, 'pdf')}
                  disabled={isAnyExporting || isDisabled}
                >
                  {isPdfExporting ? (
                    <span className={styles.spinnerSmall} />
                  ) : (
                    <File size={14} />
                  )}
                  <span>PDF</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.footerNote}>
        <AlertCircle size={16} className={styles.footerNoteIcon} />
        <div className={styles.footerNoteText}>
          <strong>Reports are export-only.</strong> For viewing sales,
          inventory, and performance data, visit the{' '}
          <span className={styles.footerNoteLink}>Overview</span> or{' '}
          <span className={styles.footerNoteLink}>Sales</span> dashboard.
        </div>
      </div>
    </>
  );
};

export default ExportsView;