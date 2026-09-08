// src/pages/Dashboard/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import {
  TrendingUp, TrendingDown, ShoppingBag, DollarSign, Users,
  Package, Clock, Calendar, RefreshCw, Eye, Printer,
  ChevronRight, Award, Zap, BarChart3, PieChart,
  Building2, CreditCard, Phone, Banknote
} from 'lucide-react';
import axios from 'axios';
import styles from './Dashboard.module.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const { activeOrganization, activeBranch, branches, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    today: { totalSales: 0, totalRevenue: 0, averageOrder: 0, topSeller: '' },
    recentTransactions: [],
    paymentMethods: [],
    branchBreakdown: [],
    totalSales: 0,
    totalTransactions: 0
  });
  const [period, setPeriod] = useState('today');
  const [isOwner, setIsOwner] = useState(false);

  const orgId = activeOrganization?.id;
  const branchId = activeBranch?.id;
  const currency = activeOrganization?.currency || 'KES';

  useEffect(() => {
    // Check if user is owner (has view all branches permission)
    const userRoles = user?.roles || [];
    const permissions = userRoles.flatMap(r => r.permissions || []);
    setIsOwner(permissions.includes('kxtill.reports.view') || 
               user?.isOwner || false);
  }, [user]);

  useEffect(() => {
    if (orgId) {
      fetchDashboardData();
    }
  }, [orgId, branchId, period]);

  const fetchDashboardData = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      // Fetch today's sales
      const todayRes = await axios.get(
        `/organizations/${orgId}/kxtill/dashboard/today-sales`
      );

      // Fetch payment methods (30 days)
      const paymentRes = await axios.get(
        `/organizations/${orgId}/kxtill/dashboard/payment-methods`,
        { params: { period: '30d' } }
      );

      // Fetch recent sales
      const recentRes = await axios.get(
        `/organizations/${orgId}/kxtill/dashboard/recent-sales`,
        { params: { limit: 5 } }
      );

      let branchData = { data: [], totalSales: 0, totalTransactions: 0 };

      // Fetch branch breakdown if owner
      if (isOwner) {
        const branchRes = await axios.get(
          `/organizations/${orgId}/kxtill/dashboard/branch-breakdown`,
          { params: { period: '30d' } }
        );
        branchData = branchRes.data;
      }

      setStats({
        today: todayRes.data.today || { totalSales: 0, totalRevenue: 0, averageOrder: 0 },
        recentTransactions: todayRes.data.recentTransactions || recentRes.data || [],
        paymentMethods: paymentRes.data.paymentMethods || [],
        branchBreakdown: branchData.data || [],
        totalSales: branchData.totalSales || 0,
        totalTransactions: branchData.totalTransactions || 0
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'KES',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatTime = (dateString) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getPaymentIcon = (method) => {
    const icons = {
      'CASH': <Banknote size={16} />,
      'MPESA': <Phone size={16} />,
      'CARD': <CreditCard size={16} />,
      'BANK': <Building2 size={16} />
    };
    return icons[method] || <Banknote size={16} />;
  };

  const getStatusBadge = (status) => {
    const map = {
      'COMPLETED': { label: 'Completed', className: styles.statusCompleted },
      'PENDING': { label: 'Pending', className: styles.statusPending },
      'REFUNDED': { label: 'Refunded', className: styles.statusRefunded },
      'VOIDED': { label: 'Voided', className: styles.statusVoided }
    };
    const match = map[status] || map['PENDING'];
    return match;
  };

  const handleViewSale = (saleId) => {
    navigate(`/sales/${saleId}`);
  };

  if (!orgId) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.emptyState}>
          <Building2 size={48} />
          <p>Select an organization to view dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>
            {activeBranch?.name || 'All Branches'} • {formatDate(new Date())}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.refreshBtn} 
            onClick={fetchDashboardData}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? styles.spinning : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Today's Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconSales}`}>
            <ShoppingBag size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Today's Sales</span>
            <span className={styles.statValue}>{stats.today.totalSales || 0}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconRevenue}`}>
            <DollarSign size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Revenue</span>
            <span className={styles.statValue}>{formatCurrency(stats.today.totalRevenue)}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconAvg}`}>
            <BarChart3 size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Avg. Order</span>
            <span className={styles.statValue}>{formatCurrency(stats.today.averageOrder)}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconTop}`}>
            <Award size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Top Seller</span>
            <span className={styles.statValue}>{stats.today.topSeller || '—'}</span>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className={styles.twoColumn}>
        {/* Left Column - Recent Transactions */}
        <div className={styles.column}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>
                <Clock size={18} />
                <span>Recent Transactions</span>
              </div>
              <button 
                className={styles.viewAllBtn}
                onClick={() => navigate('/sales')}
              >
                View All <ChevronRight size={14} />
              </button>
            </div>

            {loading ? (
              <div className={styles.loadingState}>
                <RefreshCw size={24} className={styles.spinning} />
                <p>Loading transactions...</p>
              </div>
            ) : stats.recentTransactions.length === 0 ? (
              <div className={styles.emptyTransactions}>
                <p>No transactions today</p>
                <button 
                  className={styles.goToPosBtn}
                  onClick={() => navigate('/pos')}
                >
                  Start Selling
                </button>
              </div>
            ) : (
              <div className={styles.transactionsList}>
                {stats.recentTransactions.slice(0, 5).map((tx) => {
                  const status = getStatusBadge(tx.status || 'COMPLETED');
                  return (
                    <div 
                      key={tx.id} 
                      className={styles.transactionItem}
                      onClick={() => handleViewSale(tx.id)}
                    >
                      <div className={styles.txLeft}>
                        <span className={styles.txInvoice}>
                          #{tx.invoice || tx.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className={styles.txCustomer}>
                          {tx.customer || 'Walk-in'}
                        </span>
                        <span className={styles.txItems}>
                          {tx.items || 0} items
                        </span>
                      </div>
                      <div className={styles.txRight}>
                        <span className={styles.txAmount}>
                          {formatCurrency(tx.amount || tx.total)}
                        </span>
                        <span className={styles.txTime}>
                          {formatTime(tx.time || tx.createdAt)}
                        </span>
                        <span className={`${styles.statusBadge} ${status.className}`}>
                          {status.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payment Methods */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>
                <CreditCard size={18} />
                <span>Payment Methods</span>
              </div>
            </div>

            {stats.paymentMethods.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No payment data available</p>
              </div>
            ) : (
              <div className={styles.paymentMethods}>
                {stats.paymentMethods.map((pm, index) => {
                  const percentage = stats.paymentMethods.reduce((sum, p) => sum + p.value, 0) > 0
                    ? Math.round((pm.value / stats.paymentMethods.reduce((sum, p) => sum + p.value, 0)) * 100)
                    : 0;
                  return (
                    <div key={index} className={styles.paymentMethod}>
                      <div className={styles.pmHeader}>
                        <span className={styles.pmName}>
                          {getPaymentIcon(pm.name)} {pm.name}
                        </span>
                        <span className={styles.pmAmount}>{formatCurrency(pm.amount)}</span>
                      </div>
                      <div className={styles.pmBar}>
                        <div 
                          className={styles.pmBarFill} 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className={styles.pmPercentage}>{percentage}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Branch Breakdown (Owner only) */}
        <div className={styles.column}>
          {isOwner && stats.branchBreakdown.length > 0 && (
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>
                  <Building2 size={18} />
                  <span>Branch Performance</span>
                </div>
                <span className={styles.periodBadge}>30 days</span>
              </div>

              <div className={styles.branchList}>
                {stats.branchBreakdown.map((branch, index) => (
                  <div key={index} className={styles.branchItem}>
                    <div className={styles.branchInfo}>
                      <span className={styles.branchName}>{branch.name}</span>
                      <span className={styles.branchCode}>{branch.code}</span>
                    </div>
                    <div className={styles.branchStats}>
                      <span className={styles.branchSales}>
                        {formatCurrency(branch.sales)}
                      </span>
                      <span className={styles.branchCount}>
                        {branch.transactions} tx
                      </span>
                      <span className={styles.branchPercentage}>
                        {branch.percentage}%
                      </span>
                    </div>
                    <div className={styles.branchBar}>
                      <div 
                        className={styles.branchBarFill} 
                        style={{ width: `${branch.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.branchTotals}>
                <div className={styles.branchTotal}>
                  <span>Total Revenue</span>
                  <span className={styles.totalAmount}>
                    {formatCurrency(stats.totalSales)}
                  </span>
                </div>
                <div className={styles.branchTotal}>
                  <span>Total Transactions</span>
                  <span className={styles.totalCount}>
                    {stats.totalTransactions}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>
                <Zap size={18} />
                <span>Quick Actions</span>
              </div>
            </div>
            <div className={styles.quickActions}>
              <button 
                className={styles.quickActionBtn}
                onClick={() => navigate('/pos')}
              >
                <ShoppingBag size={18} />
                <span>New Sale</span>
              </button>
              <button 
                className={styles.quickActionBtn}
                onClick={() => navigate('/sales')}
              >
                <Clock size={18} />
                <span>View Sales</span>
              </button>
              <button 
                className={styles.quickActionBtn}
                onClick={() => navigate('/reports')}
              >
                <BarChart3 size={18} />
                <span>Reports</span>
              </button>
              <button 
                className={styles.quickActionBtn}
                onClick={() => navigate('/inventory')}
              >
                <Package size={18} />
                <span>Inventory</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;