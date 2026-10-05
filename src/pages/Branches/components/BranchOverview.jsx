// Products/kxtill/src/pages/Branches/components/BranchOverview.jsx
import {
  Package,
  AlertTriangle,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  MapPin,
  Phone,
  Mail,
  CheckCircle,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import styles from '../Branches.module.css';

// ---- tiny local primitives (only used here) ----
const StatCard = ({ icon: Icon, label, value, variant }) => (
  <div className={`${styles.statCard} ${variant ? styles[variant] : ''}`}>
    <div className={styles.statIcon}>
      <Icon size={16} />
    </div>
    <div className={styles.statValue}>{value}</div>
    <div className={styles.statLabel}>{label}</div>
  </div>
);

const ChartTooltip = ({ active, payload, label, formatCurrency }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.chartTooltip}>
      <div className={styles.chartTooltipLabel}>{label}</div>
      <div className={styles.chartTooltipValue}>
        {formatCurrency(payload[0].value)}
      </div>
    </div>
  );
};

const BranchOverview = ({
  overview,
  formatCurrency,
  formatDateTime,
}) => {
  if (!overview) return null;
  const { summary, branch, topProducts, lowStockItems, recentSales } = overview;

  return (
    <>
      {/* Summary */}
      <div className={styles.statsGrid}>
        <StatCard icon={Package} label="Products" value={summary?.totalProducts ?? 0} />
        <StatCard icon={Package} label="Total Stock" value={summary?.totalStock ?? 0} />
        <StatCard
          icon={AlertTriangle}
          label="Low Stock"
          value={summary?.lowStockCount ?? 0}
          variant={summary?.lowStockCount > 0 ? 'statCardWarning' : ''}
        />
        <StatCard
          icon={ShoppingCart}
          label="Sales Today"
          value={summary?.salesTodayCount ?? 0}
        />
        <StatCard
          icon={DollarSign}
          label="Revenue Today"
          value={formatCurrency(summary?.salesToday)}
        />
      </div>

      {/* Branch contact info */}
      {branch && (branch.address || branch.phone || branch.email) && (
        <div className={styles.infoCard}>
          <div className={styles.infoGrid}>
            {branch.address && (
              <div className={styles.infoItem}>
                <MapPin size={14} className={styles.infoIcon} />
                <span>{branch.address}</span>
              </div>
            )}
            {branch.phone && (
              <div className={styles.infoItem}>
                <Phone size={14} className={styles.infoIcon} />
                <span>{branch.phone}</span>
              </div>
            )}
            {branch.email && (
              <div className={styles.infoItem}>
                <Mail size={14} className={styles.infoIcon} />
                <span>{branch.email}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top products — slim chart */}
      {topProducts?.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              <TrendingUp size={14} />
              Top Products by Revenue
            </h3>
            <span className={styles.cardCount}>{topProducts.length}</span>
          </div>
          <div className={styles.chartWrapSlim}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={topProducts.map((p) => ({
                  name: p.sku || p.name,
                  total: p.total,
                }))}
                margin={{ top: 6, right: 4, left: 0, bottom: 0 }}
                barCategoryGap="28%"
              >
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  height={18}
                />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: 'rgba(255,106,43,0.06)' }}
                  content={<ChartTooltip formatCurrency={formatCurrency} />}
                />
                <Bar
                  dataKey="total"
                  radius={[4, 4, 0, 0]}
                  fill="var(--accent)"
                  maxBarSize={36}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Low stock + Recent sales */}
      <div className={styles.twoCol}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              <AlertTriangle size={14} />
              Low Stock Items
            </h3>
            <span className={styles.cardCount}>{lowStockItems?.length || 0}</span>
          </div>
          {lowStockItems?.length > 0 ? (
            <div className={styles.listBody}>
              {lowStockItems.map((item) => (
                <div key={item.productId} className={styles.listRow}>
                  <div className={styles.listRowMain}>
                    <div className={styles.listRowName}>{item.name}</div>
                    <div className={styles.listRowSub}>{item.sku}</div>
                  </div>
                  <div className={styles.listRowRight}>
                    <span className={styles.stockLow}>{item.stock}</span>
                    <span className={styles.stockMin}>/ {item.minStock}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptySmall}>
              <CheckCircle size={20} />
              <span>All stock levels healthy</span>
            </div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              <ShoppingCart size={14} />
              Recent Sales
            </h3>
            <span className={styles.cardCount}>{recentSales?.length || 0}</span>
          </div>
          {recentSales?.length > 0 ? (
            <div className={styles.listBody}>
              {recentSales.map((sale) => (
                <div key={sale.id} className={styles.listRow}>
                  <div className={styles.listRowMain}>
                    <div className={styles.listRowName}>{sale.reference}</div>
                    <div className={styles.listRowSub}>
                      {sale.customerName} · {sale.itemsCount} item
                      {sale.itemsCount !== 1 ? 's' : ''} · {sale.user}
                    </div>
                  </div>
                  <div className={styles.listRowRight}>
                    <span className={styles.saleTotal}>
                      {formatCurrency(sale.total)}
                    </span>
                    <span className={styles.saleTime}>
                      {formatDateTime(sale.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptySmall}>
              <ShoppingCart size={20} />
              <span>No sales yet</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default BranchOverview;