// Products/kxtill/src/pages/Branches/components/BranchesList.jsx
import React, { useMemo } from 'react';
import {
  Building2,
  Search,
  Plus,
  ExternalLink,
  RefreshCw,
  Package,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  Crown,
  ChevronRight,
  ShoppingCart,
} from 'lucide-react';
import styles from '../Branches.module.css';

// ============================================================
// TINY PRIMITIVES
// ============================================================

const Sparkline = ({ data, width = 72, height = 22, className }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => `${i * step},${height - (v / max) * (height - 4) - 2}`)
    .join(' ');
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const ProgressBar = ({ value, max, className }) => {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className={`${styles.progressTrack} ${className || ''}`}>
      <div className={styles.progressFill} style={{ width: `${pct}%` }} />
    </div>
  );
};

const StatusDot = ({ isActive }) => (
  <span
    className={`${styles.statusDot} ${
      isActive ? styles.statusDotActive : styles.statusDotInactive
    }`}
    title={isActive ? 'Active' : 'Inactive'}
  />
);

// ============================================================
// SKELETON
// ============================================================

const Sk = ({ w, h = 12, r = 6, style }) => (
  <span
    className={styles.skeleton}
    style={{ width: w, height: h, borderRadius: r, ...style }}
  />
);

const SkeletonBento = () => (
  <div className={styles.page}>
    <div className={styles.hero}>
      <div className={styles.heroLeft}>
        <div className={styles.skeletonIconSquare} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Sk w={180} h={20} />
          <Sk w={260} h={12} />
        </div>
      </div>
      <div className={styles.heroRight}>
        <Sk w={200} h={38} r={10} />
        <Sk w={100} h={38} r={10} />
        <Sk w={100} h={38} r={10} />
      </div>
    </div>

    <div className={styles.bento}>
      <div className={styles.leaderTile}>
        <Sk w={120} h={10} />
        <Sk w={200} h={26} style={{ marginTop: 12 }} />
        <Sk w={90} h={14} style={{ marginTop: 12 }} />
        <Sk w="100%" h={40} style={{ marginTop: 20 }} />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.statTile}>
          <Sk w={28} h={28} r={8} />
          <Sk w="60%" h={22} style={{ marginTop: 14 }} />
          <Sk w="40%" h={10} style={{ marginTop: 8 }} />
        </div>
      ))}
      <div className={styles.rankingTile}>
        <Sk w={140} h={12} style={{ marginBottom: 16 }} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <Sk w="35%" h={11} />
            <Sk w="100%" h={8} style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>
      <div className={styles.branchGrid}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.skeletonBranchCard}>
            <Sk w={36} h={36} r={10} />
            <div style={{ flex: 1, marginLeft: 12 }}>
              <Sk w="60%" h={13} />
              <Sk w="40%" h={10} style={{ marginTop: 6 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ============================================================
// MAIN
// ============================================================

const EMPTY_TOTALS = {
  branches: 0,
  activeBranches: 0,
  totalStock: 0,
  totalLowStock: 0,
  totalSalesToday: 0,
  totalSalesThisMonth: 0,
  totalProducts: 0,
};

const BranchesList = ({
  branches = [],
  totals = EMPTY_TOTALS,
  searchQuery = '',
  setSearchQuery = () => {},
  canManage = false,
  openingSuite = false,
  isRefreshing = false,
  onOpenSuite = () => {},
  onSelectBranch = () => {},
  onRefresh = () => {},
  formatCurrency = (v) => String(v ?? ''),
  organizationName = '',
  loading = false,
}) => {
  const safeTotals = totals || EMPTY_TOTALS;

  const filtered = useMemo(() => {
    const q = String(searchQuery || '').trim().toLowerCase();
    if (!q) return branches;
    return branches.filter(
      (b) =>
        String(b?.name || '').toLowerCase().includes(q) ||
        String(b?.code || '').toLowerCase().includes(q)
    );
  }, [branches, searchQuery]);

  const { leader, ranked, maxSales } = useMemo(() => {
    const withSales = (branches || []).map((b) => ({
      ...b,
      sales: b?.stats?.salesThisMonth || 0,
    }));
    const rankedList = [...withSales].sort((a, b) => b.sales - a.sales);
    return {
      leader: rankedList[0] || null,
      ranked: rankedList,
      maxSales: rankedList[0]?.sales || 0,
    };
  }, [branches]);

  if (loading) return <SkeletonBento />;

  const filteredLeader =
    leader && filtered.some((b) => b.id === leader.id) ? leader : null;
  const filteredRest = filteredLeader
    ? filtered.filter((b) => b.id !== filteredLeader.id)
    : filtered;

  return (
    <div className={styles.page}>
      {/* ---------- HERO ---------- */}
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.heroIcon}>
            <Building2 size={22} />
          </div>
          <div className={styles.heroTitle}>
            <h1>Branches</h1>
            <p>
              <span className={styles.heroOrg}>{organizationName}</span>
              <span className={styles.heroSep}>·</span>
              <span className={styles.heroStat}>
                {safeTotals.activeBranches} of {safeTotals.branches} active
              </span>
            </p>
          </div>
        </div>
        <div className={styles.heroRight}>
          <div className={styles.searchWrap}>
            <Search size={15} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search branches…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            className={styles.iconBtn}
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh"
          >
            <RefreshCw
              size={15}
              className={isRefreshing ? styles.spinning : ''}
            />
          </button>
          {canManage && (
            <button
              className={styles.primaryBtn}
              onClick={onOpenSuite}
              disabled={openingSuite}
              type="button"
              title="Branches are managed in KXBYTE Suite"
            >
              {openingSuite ? (
                <RefreshCw size={14} className={styles.spinning} />
              ) : (
                <Plus size={14} />
              )}
              <span>{openingSuite ? 'Opening…' : 'Add branch'}</span>
              {!openingSuite && <ExternalLink size={11} />}
            </button>
          )}
        </div>
      </div>

      {/* ---------- EMPTY ---------- */}
      {branches.length === 0 ? (
        <div className={styles.emptyState}>
          <Building2 size={44} className={styles.emptyIcon} />
          <h3>No branches yet</h3>
          <p>
            {canManage
              ? 'Branches are created in KXBYTE Suite. Click below to open it.'
              : 'No branches have been created yet.'}
          </p>
          {canManage && (
            <button
              className={styles.primaryBtn}
              onClick={onOpenSuite}
              disabled={openingSuite}
            >
              <Plus size={14} />
              Create a branch in Suite
            </button>
          )}
        </div>
      ) : (
        <div className={styles.bento}>
          {/* ---------- LEADER TILE ---------- */}
          {filteredLeader && (
            <button
              type="button"
              className={styles.leaderTile}
              onClick={() => onSelectBranch(filteredLeader.id)}
            >
              <div className={styles.leaderHeader}>
                <span className={styles.leaderPill}>
                  <Crown size={11} />
                  Top branch
                </span>
                {filteredLeader.isDefault && (
                  <span className={styles.defaultChip}>DEFAULT</span>
                )}
              </div>
              <h2 className={styles.leaderName}>{filteredLeader.name}</h2>
              <div className={styles.leaderCode}>{filteredLeader.code}</div>

              <div className={styles.leaderSalesRow}>
                <span className={styles.leaderSales}>
                  {formatCurrency(filteredLeader.stats?.salesThisMonth ?? 0)}
                </span>
                {filteredLeader.stats?.salesTrend?.length > 1 ? (
                  <Sparkline
                    data={filteredLeader.stats.salesTrend}
                    width={110}
                    height={30}
                    className={styles.leaderSpark}
                  />
                ) : (
                  <span className={styles.leaderSalesLabel}>this month</span>
                )}
              </div>

              <div className={styles.leaderMeta}>
                <div className={styles.leaderMetaItem}>
                  <Package size={12} />
                  <span>{filteredLeader.stats?.stock ?? 0} stock</span>
                </div>
                <div className={styles.leaderMetaItem}>
                  <AlertTriangle size={12} />
                  <span
                    className={
                      filteredLeader.stats?.lowStockCount > 0
                        ? styles.warnText
                        : ''
                    }
                  >
                    {filteredLeader.stats?.lowStockCount ?? 0} low
                  </span>
                </div>
                <div className={styles.leaderMetaItem}>
                  <ShoppingCart size={12} />
                  <span>{filteredLeader.stats?.salesTodayCount ?? 0} today</span>
                </div>
              </div>

              <ChevronRight size={18} className={styles.leaderArrow} />
            </button>
          )}

          {/* ---------- STAT TILES ---------- */}
          <div className={styles.statTile}>
            <div className={`${styles.statTileIcon} ${styles.iconStock}`}>
              <Package size={16} />
            </div>
            <div className={styles.statTileValue}>
              {Number(safeTotals.totalStock || 0).toLocaleString()}
            </div>
            <div className={styles.statTileLabel}>Total stock</div>
          </div>

          <div className={styles.statTile}>
            <div
              className={`${styles.statTileIcon} ${
                safeTotals.totalLowStock > 0 ? styles.iconWarn : styles.iconOk
              }`}
            >
              <AlertTriangle size={16} />
            </div>
            <div
              className={`${styles.statTileValue} ${
                safeTotals.totalLowStock > 0 ? styles.warnText : ''
              }`}
            >
              {safeTotals.totalLowStock}
            </div>
            <div className={styles.statTileLabel}>Low stock items</div>
          </div>

          <div className={styles.statTile}>
            <div className={`${styles.statTileIcon} ${styles.iconAccent}`}>
              <DollarSign size={16} />
            </div>
            <div className={styles.statTileValue}>
              {formatCurrency(safeTotals.totalSalesToday)}
            </div>
            <div className={styles.statTileLabel}>Sales today</div>
          </div>

          {/* ---------- RANKING TILE ---------- */}
          <div className={styles.rankingTile}>
            <div className={styles.rankingHeader}>
              <TrendingUp size={14} />
              <span>Sales this month</span>
            </div>
            <div className={styles.rankingList}>
              {ranked.slice(0, 5).map((b) => (
                <div key={b.id} className={styles.rankingRow}>
                  <div className={styles.rankingLabel}>
                    <span className={styles.rankingName}>{b.code}</span>
                    <span className={styles.rankingValue}>
                      {formatCurrency(b.sales)}
                    </span>
                  </div>
                  <ProgressBar value={b.sales} max={maxSales} />
                </div>
              ))}
            </div>
          </div>

          {/* ---------- BRANCH GRID ---------- */}
          {filteredRest.length > 0 && (
            <div className={styles.branchGrid}>
              {filteredRest.map((branch) => (
                <button
                  key={branch.id}
                  type="button"
                  className={styles.branchCard}
                  onClick={() => onSelectBranch(branch.id)}
                >
                  <div className={styles.branchCardTop}>
                    <div
                      className={`${styles.branchIcon} ${
                        branch.isDefault ? styles.branchIconDefault : ''
                      }`}
                    >
                      <Building2 size={16} />
                    </div>
                    <div className={styles.branchCardInfo}>
                      <div className={styles.branchName}>{branch.name}</div>
                      <div className={styles.branchCode}>{branch.code}</div>
                    </div>
                    <StatusDot isActive={branch.isActive} />
                  </div>

                  <div className={styles.branchSales}>
                    <span className={styles.branchSalesValue}>
                      {formatCurrency(branch.stats?.salesThisMonth ?? 0)}
                    </span>
                    {branch.stats?.salesTrend?.length > 1 ? (
                      <Sparkline
                        data={branch.stats.salesTrend}
                        width={56}
                        height={18}
                        className={styles.branchSpark}
                      />
                    ) : (
                      <span className={styles.branchSalesLabel}>
                        this month
                      </span>
                    )}
                  </div>

                  <ProgressBar
                    value={branch.stats?.salesThisMonth ?? 0}
                    max={maxSales}
                    className={styles.branchProgress}
                  />

                  <div className={styles.branchFooter}>
                    <span className={styles.branchFootItem}>
                      <Package size={11} />
                      {branch.stats?.stock ?? 0}
                    </span>
                    <span
                      className={`${styles.branchFootItem} ${
                        branch.stats?.lowStockCount > 0
                          ? styles.warnText
                          : ''
                      }`}
                    >
                      <AlertTriangle size={11} />
                      {branch.stats?.lowStockCount ?? 0}
                    </span>
                    <span className={styles.branchFootItem}>
                      <ShoppingCart size={11} />
                      {branch.stats?.salesTodayCount ?? 0}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ---------- NO MATCH ---------- */}
          {searchQuery && filtered.length === 0 && (
            <div className={styles.emptyState}>
              <Search size={32} className={styles.emptyIcon} />
              <h3>No branches match "{searchQuery}"</h3>
              <p>Try a different name or code.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BranchesList;