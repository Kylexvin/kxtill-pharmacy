// Products/kxtill/src/pages/Branches/components/BranchDrawer.jsx
import React, { useEffect } from 'react';
import {
  X,
  Package,
  AlertTriangle,
  ShoppingCart,
  DollarSign,
  CheckCircle,
  MapPin,
  Phone,
  Mail,
  Crown,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import styles from '../Branches.module.css';

const BranchDrawer = ({
  isOpen,
  branch,
  overview,
  loading,
  error,
  onClose,
  onRetry,
  formatCurrency,
  formatDateTime,
}) => {
  // Lock body scroll + ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const summary = overview?.summary;
  const info = overview?.branch;
  const topProducts = overview?.topProducts || [];
  const lowStockItems = overview?.lowStockItems || [];
  const recentSales = overview?.recentSales || [];

  const maxTop = topProducts.reduce(
    (m, p) => Math.max(m, p.total || 0),
    0
  );

  return (
    <div className={styles.drawerRoot}>
      <div className={styles.drawerBackdrop} onClick={onClose} />

      <aside
        className={styles.drawerPanel}
        role="dialog"
        aria-modal="true"
        aria-label={branch?.name || 'Branch'}
      >
        {/* ---------- HEADER ---------- */}
        <header className={styles.drawerHeader}>
          <div className={styles.drawerHeaderMain}>
            {branch?.isDefault && (
              <span className={styles.defaultChip}>
                <Crown size={10} />
                DEFAULT
              </span>
            )}
            <h2 className={styles.drawerTitle}>
              {branch?.name || 'Branch'}
            </h2>
            <div className={styles.drawerSub}>
              {branch?.code && (
                <span className={styles.drawerCode}>{branch.code}</span>
              )}
              <span
                className={`${styles.drawerStatus} ${
                  branch?.isActive
                    ? styles.drawerStatusActive
                    : styles.drawerStatusInactive
                }`}
              >
                <span className={styles.drawerDot} />
                {branch?.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
          <div className={styles.drawerActions}>
            <button
              className={styles.iconBtn}
              onClick={onRetry}
              disabled={loading}
              title="Refresh"
            >
              <RefreshCw
                size={15}
                className={loading ? styles.spinning : ''}
              />
            </button>
            <button
              className={styles.iconBtn}
              onClick={onClose}
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* ---------- BODY ---------- */}
        <div className={styles.drawerBody}>
          {loading ? (
            <DrawerSkeleton />
          ) : error ? (
            <div className={styles.errorState}>
              <AlertCircle size={28} className={styles.errorIcon} />
              <p className={styles.errorText}>{error}</p>
              <button className={styles.retryBtn} onClick={onRetry}>
                <RefreshCw size={14} />
                Retry
              </button>
            </div>
          ) : overview ? (
            <>
              {/* KPI strip */}
              <div className={styles.kpiStrip}>
                <Kpi
                  icon={Package}
                  value={summary?.totalProducts ?? 0}
                  label="Products"
                />
                <Kpi
                  icon={Package}
                  value={summary?.totalStock ?? 0}
                  label="Stock"
                />
                <Kpi
                  icon={AlertTriangle}
                  value={summary?.lowStockCount ?? 0}
                  label="Low"
                  warn={summary?.lowStockCount > 0}
                />
                <Kpi
                  icon={ShoppingCart}
                  value={summary?.salesTodayCount ?? 0}
                  label="Sales today"
                />
                <Kpi
                  icon={DollarSign}
                  value={formatCurrency(summary?.salesToday ?? 0)}
                  label="Revenue"
                />
              </div>

              {/* Contact info */}
              {info &&
                (info.address || info.phone || info.email) && (
                  <div className={styles.infoBlock}>
                    {info.address && (
                      <div className={styles.infoLine}>
                        <MapPin size={13} />
                        <span>{info.address}</span>
                      </div>
                    )}
                    {info.phone && (
                      <div className={styles.infoLine}>
                        <Phone size={13} />
                        <span>{info.phone}</span>
                      </div>
                    )}
                    {info.email && (
                      <div className={styles.infoLine}>
                        <Mail size={13} />
                        <span>{info.email}</span>
                      </div>
                    )}
                  </div>
                )}

              {/* Top products */}
              {topProducts.length > 0 && (
                <section className={styles.drawerSection}>
                  <h3 className={styles.drawerSectionTitle}>
                    <span>Top products</span>
                    <span className={styles.drawerSectionCount}>
                      {topProducts.length}
                    </span>
                  </h3>
                  <div className={styles.barList}>
                    {topProducts.slice(0, 6).map((p) => {
                      const pct = maxTop > 0 ? (p.total / maxTop) * 100 : 0;
                      return (
                        <div key={p.productId || p.sku || p.name} className={styles.barRow}>
                          <div className={styles.barLabel}>
                            <span className={styles.barName}>
                              {p.name}
                            </span>
                            <span className={styles.barValue}>
                              {formatCurrency(p.total)}
                            </span>
                          </div>
                          <div className={styles.barTrack}>
                            <div
                              className={styles.barFill}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Low stock */}
              <section className={styles.drawerSection}>
                <h3 className={styles.drawerSectionTitle}>
                  <span>Low stock</span>
                  <span className={styles.drawerSectionCount}>
                    {lowStockItems.length}
                  </span>
                </h3>
                {lowStockItems.length > 0 ? (
                  <div className={styles.miniList}>
                    {lowStockItems.map((item) => (
                      <div
                        key={item.productId}
                        className={styles.miniRow}
                      >
                        <div className={styles.miniRowMain}>
                          <div className={styles.miniRowName}>
                            {item.name}
                          </div>
                          <div className={styles.miniRowSub}>
                            {item.sku}
                          </div>
                        </div>
                        <div className={styles.miniRowRight}>
                          <span className={styles.warnBig}>
                            {item.stock}
                          </span>
                          <span className={styles.miniRowSub}>
                            / {item.minStock}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.miniEmpty}>
                    <CheckCircle size={18} />
                    <span>All stock levels healthy</span>
                  </div>
                )}
              </section>

              {/* Recent sales */}
              <section className={styles.drawerSection}>
                <h3 className={styles.drawerSectionTitle}>
                  <span>Recent sales</span>
                  <span className={styles.drawerSectionCount}>
                    {recentSales.length}
                  </span>
                </h3>
                {recentSales.length > 0 ? (
                  <div className={styles.miniList}>
                    {recentSales.map((sale) => (
                      <div key={sale.id} className={styles.miniRow}>
                        <div className={styles.miniRowMain}>
                          <div className={styles.miniRowName}>
                            {sale.reference}
                          </div>
                          <div className={styles.miniRowSub}>
                            {sale.customerName} · {sale.itemsCount} item
                            {sale.itemsCount !== 1 ? 's' : ''} · {sale.user}
                          </div>
                        </div>
                        <div className={styles.miniRowRight}>
                          <span className={styles.saleAmount}>
                            {formatCurrency(sale.total)}
                          </span>
                          <span className={styles.miniRowSub}>
                            {formatDateTime(sale.createdAt)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.miniEmpty}>
                    <ShoppingCart size={18} />
                    <span>No sales yet</span>
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
};

// ---- tiny primitives ----
const Kpi = ({ icon: Icon, value, label, warn }) => (
  <div className={styles.kpi}>
    <Icon size={13} className={styles.kpiIcon} />
    <div className={`${styles.kpiValue} ${warn ? styles.warnText : ''}`}>
      {value}
    </div>
    <div className={styles.kpiLabel}>{label}</div>
  </div>
);

const DrawerSkeleton = () => (
  <>
    <div className={styles.kpiStrip}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={styles.kpi}>
          <span className={styles.skeleton} style={{ width: 40, height: 18 }} />
          <span
            className={styles.skeleton}
            style={{ width: 50, height: 10, marginTop: 6 }}
          />
        </div>
      ))}
    </div>
    <section className={styles.drawerSection}>
      <span
        className={styles.skeleton}
        style={{ width: 100, height: 12, marginBottom: 16 }}
      />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <span
            className={styles.skeleton}
            style={{ width: '50%', height: 11, marginBottom: 8 }}
          />
          <span className={styles.skeleton} style={{ width: '100%', height: 8 }} />
        </div>
      ))}
    </section>
  </>
);

export default BranchDrawer;