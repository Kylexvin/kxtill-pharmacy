// Products/kxtill/src/pages/Branches/components/BranchListView.jsx
import {
  Building2,
  Search,
  Plus,
  ExternalLink,
  RefreshCw,
  CheckCircle,
  Package,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  ShoppingCart,
  ChevronRight,
  Crown,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import styles from '../Branches.module.css';

// ---- tiny local primitives (only used here) ----
const StatusBadge = ({ isActive }) => (
  <span
    className={`${styles.statusPill} ${
      isActive ? styles.statusActive : styles.statusInactive
    }`}
  >
    {isActive ? <CheckCircle size={12} /> : <span>×</span>}
    {isActive ? 'Active' : 'Inactive'}
  </span>
);

const DefaultBadge = () => (
  <span className={styles.defaultBadge}>
    <Crown size={10} />
    Default
  </span>
);

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

const BranchListView = ({
  branches,
  totals,
  searchQuery,
  setSearchQuery,
  canManage,
  openingSuite,
  onOpenSuite,
  onSelectBranch,
  formatCurrency,
}) => {
  const filtered = branches.filter((b) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (b.name || '').toLowerCase().includes(q) ||
      (b.code || '').toLowerCase().includes(q)
    );
  });

  const chartData = branches.map((b) => ({
    name: b.code || b.name,
    fullName: b.name,
    sales: b.stats?.salesThisMonth || 0,
    isActive: b.isActive,
  }));

  const maxSalesBranch = chartData.reduce(
    (max, d) => (d.sales > (max?.sales || 0) ? d : max),
    null
  );

  return (
    <>
      {/* Totals */}
      <div className={styles.statsGrid}>
        <StatCard icon={Building2} label="Total Branches" value={totals.branches} />
        <StatCard
          icon={CheckCircle}
          label="Active"
          value={totals.activeBranches}
          variant="statCardActive"
        />
        <StatCard icon={Package} label="Total Stock" value={totals.totalStock} />
        <StatCard
          icon={AlertTriangle}
          label="Low Stock"
          value={totals.totalLowStock}
          variant={totals.totalLowStock > 0 ? 'statCardWarning' : ''}
        />
        <StatCard
          icon={DollarSign}
          label="Sales Today"
          value={formatCurrency(totals.totalSalesToday)}
        />
        <StatCard
          icon={TrendingUp}
          label="Sales This Month"
          value={formatCurrency(totals.totalSalesThisMonth)}
        />
      </div>

      {/* Slim sales chart */}
      {branches.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              <TrendingUp size={14} />
              Sales This Month
            </h3>
            {maxSalesBranch && (
              <span className={styles.cardHint}>
                Top: {maxSalesBranch.fullName}
              </span>
            )}
          </div>
          <div className={styles.chartWrapSlim}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={chartData}
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
                <Bar dataKey="sales" radius={[4, 4, 0, 0]} maxBarSize={36}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.isActive
                          ? 'var(--accent)'
                          : 'var(--border-strong)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Search */}
      <div className={styles.filtersBar}>
        <div className={styles.searchWrap}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search branches by name or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Grid or empty */}
      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <Building2 size={48} className={styles.emptyIcon} />
          <h3>{searchQuery ? 'No branches match' : 'No branches yet'}</h3>
          <p>
            {searchQuery
              ? 'Try adjusting your search'
              : canManage
              ? 'Branches are created in KXBYTE Suite. Click below to open it.'
              : 'No branches have been created yet.'}
          </p>
          {!searchQuery && canManage && (
            <button
              className={styles.primaryBtn}
              onClick={onOpenSuite}
              disabled={openingSuite}
              type="button"
            >
              {openingSuite ? (
                <RefreshCw size={14} className={styles.spinning} />
              ) : (
                <Plus size={14} />
              )}
              {openingSuite ? 'Opening…' : 'Create a branch in Suite'}
              {!openingSuite && (
                <ExternalLink size={12} className={styles.btnTrailing} />
              )}
            </button>
          )}
        </div>
      ) : (
        <div className={styles.branchGrid}>
          {filtered.map((branch) => (
            <button
              key={branch.id}
              type="button"
              className={styles.branchCard}
              onClick={() => onSelectBranch(branch.id)}
            >
              <div className={styles.branchCardHeader}>
                <div className={styles.branchCardIcon}>
                  <Building2 size={18} />
                </div>
                <div className={styles.branchCardTitleWrap}>
                  <div className={styles.branchCardName}>
                    {branch.name}
                    {branch.isDefault && <DefaultBadge />}
                  </div>
                  <div className={styles.branchCardCode}>{branch.code}</div>
                </div>
                <ChevronRight size={16} className={styles.branchCardArrow} />
              </div>

              <div className={styles.branchCardStatus}>
                <StatusBadge isActive={branch.isActive} />
              </div>

              <div className={styles.branchStats}>
                <div className={styles.branchStat}>
                  <Package size={12} />
                  <span className={styles.branchStatValue}>
                    {branch.stats?.stock ?? 0}
                  </span>
                  <span className={styles.branchStatLabel}>stock</span>
                </div>
                <div className={styles.branchStat}>
                  <AlertTriangle size={12} />
                  <span
                    className={`${styles.branchStatValue} ${
                      branch.stats?.lowStockCount > 0
                        ? styles.branchStatWarning
                        : ''
                    }`}
                  >
                    {branch.stats?.lowStockCount ?? 0}
                  </span>
                  <span className={styles.branchStatLabel}>low</span>
                </div>
                <div className={styles.branchStat}>
                  <ShoppingCart size={12} />
                  <span className={styles.branchStatValue}>
                    {branch.stats?.salesTodayCount ?? 0}
                  </span>
                  <span className={styles.branchStatLabel}>today</span>
                </div>
              </div>

              <div className={styles.branchCardFooter}>
                <span className={styles.branchSalesMonth}>
                  {formatCurrency(branch.stats?.salesThisMonth ?? 0)}
                </span>
                <span className={styles.branchSalesLabel}>this month</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
};

export default BranchListView;