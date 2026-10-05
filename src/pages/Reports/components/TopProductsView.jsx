// Products/kxtill/src/pages/Reports/components/TopProductsView.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSettings } from '../../../contexts/SettingsContext';
import axios from 'axios';
import {
  TrendingUp,
  Award,
  RefreshCw,
  AlertCircle,
  Package,
  DollarSign,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import styles from '../Reports.module.css';

// ---------- tooltip ----------
const ChartTooltip = ({ active, payload, label, formatCurrency }) => {
  if (!active || !payload || !payload.length) return null;
  const value = payload[0].value;
  return (
    <div className={styles.chartTooltip}>
      <div className={styles.chartTooltipLabel}>{label}</div>
      <div className={styles.chartTooltipValue}>
        {typeof formatCurrency === 'function'
          ? formatCurrency(value)
          : String(value)}
      </div>
    </div>
  );
};

// ---------- skeleton ----------
const Sk = ({ w, h = 12, r = 6, style }) => (
  <span
    className={styles.skeleton}
    style={{ width: w, height: h, borderRadius: r, ...style }}
  />
);

const Skeleton = () => (
  <div className={styles.productsView}>
    <div className={styles.summaryRow}>
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.summaryTile}>
          <Sk w={60} h={10} />
          <Sk w={110} h={22} style={{ marginTop: 10 }} />
        </div>
      ))}
    </div>
    <div className={styles.chartCard}>
      <Sk w={160} h={14} />
      <Sk w="100%" h={260} style={{ marginTop: 20 }} />
    </div>
    <div className={styles.productsTableCard}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={styles.productsTableRow}>
          <Sk w={28} h={20} r={6} />
          <Sk w="45%" h={12} />
          <Sk w={70} h={10} />
          <Sk w={40} h={12} />
          <Sk w={80} h={12} />
        </div>
      ))}
    </div>
  </div>
);

// ============================================================
// MAIN
// ============================================================
const TopProductsView = ({ orgId, branchId, dateRange }) => {
  const { formatCurrency, formatCompactCurrency } = useSettings();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);

  const isMountedRef = useRef(true);
  const fetchControllerRef = useRef(null);

  const fetchTopProducts = useCallback(async () => {
    if (!orgId) return;

    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    setError(null);

    try {
      const params = {
        startDate: dateRange.start,
        endDate: dateRange.end,
        limit: 20,
      };
      if (branchId) params.branchId = branchId;

      const res = await axios.get(
        `/organizations/${orgId}/kxtill/dashboard/top-products`,
        { params, signal: controller.signal, timeout: 15000 }
      );

      if (controller.signal.aborted || !isMountedRef.current) return;

      const data = res.data;
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.products)
        ? data.products
        : Array.isArray(data?.data)
        ? data.data
        : [];

      setProducts(list);
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      console.error('Failed to fetch top products:', err);
      if (isMountedRef.current) {
        setError(
          err.response?.data?.error ||
            err.response?.data?.message ||
            'Failed to load top products'
        );
      }
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [orgId, branchId, dateRange.start, dateRange.end]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      fetchControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!orgId) return;
    fetchTopProducts();
  }, [orgId, fetchTopProducts]);

  // ---- derived (safe with defaults + Number coercion) ----
  const list = Array.isArray(products) ? products : [];

  const chartData = list.map((p) => ({
    name: p?.sku || p?.name || '—',
    fullName: p?.name || '—',
    total: Number(p?.total || 0),
    quantity: Number(p?.quantity || 0),
  }));

  const totalRevenue = list.reduce(
    (sum, p) => sum + Number(p?.total || 0),
    0
  );
  const totalQuantity = list.reduce(
    (sum, p) => sum + Number(p?.quantity || 0),
    0
  );

  const top3 = list.slice(0, 3);

  if (loading && list.length === 0) {
    return <Skeleton />;
  }

  if (error) {
    return (
      <div className={styles.tabError}>
        <AlertCircle size={32} className={styles.tabErrorIcon} />
        <p>{error}</p>
        <button
          onClick={fetchTopProducts}
          type="button"
          className={styles.retryBtn}
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className={styles.tabEmpty}>
        <Award size={48} className={styles.tabEmptyIcon} />
        <h3>No product data</h3>
        <p>Complete a few sales to see your best-selling products here.</p>
      </div>
    );
  }

  return (
    <div className={styles.productsView}>
      {/* ---- Summary ---- */}
      <div className={styles.summaryRow}>
        <div className={styles.summaryTile}>
          <div
            className={`${styles.summaryTileIcon} ${styles.summaryTileIconAccent}`}
          >
            <Package size={16} />
          </div>
          <div className={styles.summaryTileBody}>
            <div className={styles.summaryTileLabel}>Products</div>
            <div className={styles.summaryTileValue}>{list.length}</div>
          </div>
        </div>

        <div className={styles.summaryTile}>
          <div
            className={`${styles.summaryTileIcon} ${styles.summaryTileIconOk}`}
          >
            <TrendingUp size={16} />
          </div>
          <div className={styles.summaryTileBody}>
            <div className={styles.summaryTileLabel}>Units sold</div>
            <div
              className={styles.summaryTileValue}
              title={totalQuantity.toLocaleString()}
            >
              {totalQuantity.toLocaleString()}
            </div>
          </div>
        </div>

        <div className={styles.summaryTile}>
          <div
            className={`${styles.summaryTileIcon} ${styles.summaryTileIconAccent}`}
          >
            <DollarSign size={16} />
          </div>
          <div className={styles.summaryTileBody}>
            <div className={styles.summaryTileLabel}>Total revenue</div>
            <div
              className={styles.summaryTileValue}
              title={formatCurrency(totalRevenue)}
            >
              {formatCompactCurrency(totalRevenue)}
            </div>
          </div>
        </div>
      </div>

      {/* ---- Top 3 podium ---- */}
      {top3.length > 0 && (
        <div className={styles.podiumRow}>
          {top3.map((p, i) => (
            <div
              key={p.productId || i}
              className={`${styles.podiumCard} ${
                i === 0 ? styles.podiumCardGold : ''
              }`}
            >
              <div className={styles.podiumRank}>
                <Award size={14} />
                <span>#{i + 1}</span>
              </div>
              <div className={styles.podiumName} title={p.name}>
                {p.name || 'Unknown'}
              </div>
              <div className={styles.podiumMeta}>
                <span>{Number(p.quantity || 0).toLocaleString()} units</span>
                <span
                  className={styles.podiumRevenue}
                  title={formatCurrency(Number(p.total || 0))}
                >
                  {formatCompactCurrency(Number(p.total || 0))}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- Chart ---- */}
      <div className={styles.chartCard}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>
            <TrendingUp size={14} />
            Revenue by product
          </h3>
          <span className={styles.cardHint}>Top {list.length}</span>
        </div>
        <div className={styles.chartBody}>
          <ResponsiveContainer
            width="100%"
            height={Math.max(240, list.length * 28)}
          >
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                horizontal={false}
              />
              <XAxis
                type="number"
                tickFormatter={formatCompactCurrency}
                tick={{ fill: 'var(--text-faint)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,106,43,0.06)' }}
                content={<ChartTooltip formatCurrency={formatCurrency} />}
              />
              <Bar dataKey="total" radius={[0, 6, 6, 0]} maxBarSize={22}>
                {chartData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      index === 0
                        ? 'var(--accent)'
                        : 'rgba(255, 106, 43, 0.55)'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ---- Table ---- */}
      <div className={styles.productsTableCard}>
        <div className={styles.productsTableHeader}>
          <span className={styles.colRank}>#</span>
          <span className={styles.colName}>Product</span>
          <span className={styles.colSku}>SKU</span>
          <span className={styles.colQty}>Qty</span>
          <span className={styles.colTotal}>Revenue</span>
        </div>
        <div className={styles.productsTableBody}>
          {list.map((p, index) => (
            <div
              key={p?.productId || index}
              className={styles.productsTableRow}
            >
              <span className={styles.colRank}>
                <span
                  className={`${styles.rankBadge} ${
                    index === 0 ? styles.rankBadgeTop : ''
                  }`}
                >
                  {index + 1}
                </span>
              </span>
              <span className={styles.colName}>
                <span className={styles.productNameText}>
                  {p?.name || 'Unknown'}
                </span>
              </span>
              <span className={styles.colSku}>
                <span className={styles.skuText}>{p?.sku || '—'}</span>
              </span>
              <span className={styles.colQty}>
                {Number(p?.quantity || 0).toLocaleString()}
              </span>
              <span
                className={styles.colTotal}
                title={formatCurrency(Number(p?.total || 0))}
              >
                {formatCurrency(Number(p?.total || 0))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TopProductsView;