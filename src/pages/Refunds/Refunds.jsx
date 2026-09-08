// src/pages/Refunds/Refunds.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Filter, Calendar, Eye, ChevronLeft, ChevronRight,
  Undo2, DollarSign, User, FileText, Clock, AlertCircle,
  CheckCircle, XCircle, RefreshCw, Plus
} from 'lucide-react';
import axios from 'axios';
import styles from './Refunds.module.css';

const Refunds = () => {
  const navigate = useNavigate();
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState('week');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({
    totalRefunds: 0,
    totalAmount: 0,
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    avgProcessingTime: 0
  });

  useEffect(() => {
    fetchRefunds();
  }, [dateRange, statusFilter, currentPage]);

  const fetchRefunds = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/refunds', {
        params: {
          page: currentPage,
          limit: 20,
          dateRange,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          search: searchTerm
        }
      });
      setRefunds(response.data.refunds || []);
      setTotalPages(response.data.totalPages || 1);
      setStats({
        totalRefunds: response.data.stats?.totalRefunds || 0,
        totalAmount: response.data.stats?.totalAmount || 0,
        pendingCount: response.data.stats?.pendingCount || 0,
        approvedCount: response.data.stats?.approvedCount || 0,
        rejectedCount: response.data.stats?.rejectedCount || 0,
        avgProcessingTime: response.data.stats?.avgProcessingTime || 0
      });
    } catch (error) {
      console.error('Error fetching refunds:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    fetchRefunds();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      'pending': { 
        label: 'Pending', 
        className: styles.statusPending,
        icon: Clock
      },
      'approved': { 
        label: 'Approved', 
        className: styles.statusApproved,
        icon: CheckCircle
      },
      'rejected': { 
        label: 'Rejected', 
        className: styles.statusRejected,
        icon: XCircle
      },
      'processing': { 
        label: 'Processing', 
        className: styles.statusProcessing,
        icon: RefreshCw
      },
      'completed': { 
        label: 'Completed', 
        className: styles.statusCompleted,
        icon: CheckCircle
      }
    };
    return statusMap[status] || statusMap['pending'];
  };

  const getRefundMethod = (method) => {
    const methodMap = {
      'cash': 'Cash Refund',
      'card': 'Card Refund',
      'mobile': 'Mobile Money',
      'bank': 'Bank Transfer',
      'store_credit': 'Store Credit'
    };
    return methodMap[method] || method;
  };

  const handleProcessRefund = async (refundId, action) => {
    try {
      await axios.put(`/refunds/${refundId}/process`, { action });
      fetchRefunds();
    } catch (error) {
      console.error('Error processing refund:', error);
    }
  };

  return (
    <div className={styles.refundsPage}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            <Undo2 size={28} className={styles.titleIcon} />
            Refunds
          </h1>
          <p className={styles.subtitle}>Manage refund requests and track refund status</p>
        </div>
        <button className={styles.newRefundBtn} onClick={() => navigate('/refunds/new')}>
          <Plus size={16} />
          New Refund
        </button>
      </div>

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: '#e3f2fd' }}>
            <FileText size={20} color="#1565c0" />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Refunds</span>
            <span className={styles.statValue}>{stats.totalRefunds}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: '#e8f5e9' }}>
            <DollarSign size={20} color="#2e7d32" />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Amount</span>
            <span className={styles.statValue}>{formatCurrency(stats.totalAmount)}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: '#fff3e0' }}>
            <Clock size={20} color="#e65100" />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Pending</span>
            <span className={styles.statValue}>{stats.pendingCount}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: '#f3e5f5' }}>
            <CheckCircle size={20} color="#6a1b9a" />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Approved</span>
            <span className={styles.statValue}>{stats.approvedCount}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: '#fce4ec' }}>
            <XCircle size={20} color="#c62828" />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Rejected</span>
            <span className={styles.statValue}>{stats.rejectedCount}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: '#e0f7fa' }}>
            <Clock size={20} color="#00838f" />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Avg. Processing Time</span>
            <span className={styles.statValue}>{stats.avgProcessingTime}h</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filtersBar}>
        <div className={styles.searchWrapper}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search by refund #, customer, or original invoice..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filterGroup}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="approved">Approved</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="custom">Custom Range</option>
          </select>

          <button className={styles.filterBtn}>
            <Filter size={16} />
            More Filters
          </button>
        </div>
      </div>

      {/* Refunds Table */}
      <div className={styles.tableContainer}>
        {loading ? (
          <div className={styles.loadingState}>
            <RefreshCw size={32} className={styles.spinning} />
            <p>Loading refunds...</p>
          </div>
        ) : refunds.length === 0 ? (
          <div className={styles.emptyState}>
            <Undo2 size={48} />
            <h3>No refunds found</h3>
            <p>No refund requests match your filters</p>
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Refund #</th>
                  <th>Original Invoice</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((refund) => {
                  const status = getStatusBadge(refund.status);
                  const StatusIcon = status.icon;
                  
                  return (
                    <tr key={refund.id} className={styles.tableRow}>
                      <td className={styles.refundNumber}>
                        #{refund.refundNumber || refund.id.slice(0, 8)}
                      </td>
                      <td>
                        <span className={styles.invoiceLink}>
                          #{refund.originalInvoice}
                        </span>
                      </td>
                      <td>
                        <div className={styles.customerCell}>
                          <User size={14} className={styles.customerIcon} />
                          <span>{refund.customer?.name || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className={styles.amountCell}>
                        <span className={styles.amount}>
                          {formatCurrency(refund.amount)}
                        </span>
                      </td>
                      <td>
                        <span className={styles.methodBadge}>
                          {getRefundMethod(refund.method)}
                        </span>
                      </td>
                      <td>
                        <span className={styles.reasonText}>
                          {refund.reason?.length > 30 
                            ? `${refund.reason.slice(0, 30)}...` 
                            : refund.reason || 'N/A'}
                        </span>
                      </td>
                      <td>
                        <span className={`${styles.statusBadge} ${status.className}`}>
                          <StatusIcon size={12} />
                          {status.label}
                        </span>
                      </td>
                      <td className={styles.dateCell}>
                        {formatDate(refund.createdAt)}
                      </td>
                      <td>
                        <div className={styles.actionButtons}>
                          <button
                            className={styles.viewBtn}
                            onClick={() => navigate(`/refunds/${refund.id}`)}
                            title="View Details"
                          >
                            <Eye size={16} />
                          </button>
                          
                          {refund.status === 'pending' && (
                            <>
                              <button
                                className={`${styles.actionBtn} ${styles.approveBtn}`}
                                onClick={() => handleProcessRefund(refund.id, 'approve')}
                                title="Approve Refund"
                              >
                                <CheckCircle size={16} />
                              </button>
                              <button
                                className={`${styles.actionBtn} ${styles.rejectBtn}`}
                                onClick={() => handleProcessRefund(refund.id, 'reject')}
                                title="Reject Refund"
                              >
                                <XCircle size={16} />
                              </button>
                            </>
                          )}
                          
                          {refund.status === 'approved' && (
                            <button
                              className={`${styles.actionBtn} ${styles.processBtn}`}
                              onClick={() => handleProcessRefund(refund.id, 'process')}
                              title="Process Refund"
                            >
                              <RefreshCw size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  className={styles.pageBtn}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <span className={styles.pageInfo}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className={styles.pageBtn}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Quick Stats Footer */}
      <div className={styles.footerStats}>
        <div className={styles.footerStat}>
          <AlertCircle size={16} />
          <span>Refunds processed in last 24h: <strong>{
            refunds.filter(r => {
              const date = new Date(r.createdAt);
              const now = new Date();
              return date > new Date(now - 24 * 60 * 60 * 1000);
            }).length
          }</strong></span>
        </div>
        <div className={styles.footerStat}>
          <CheckCircle size={16} />
          <span>Approval rate: <strong>{
            stats.totalRefunds > 0 
              ? Math.round((stats.approvedCount / stats.totalRefunds) * 100)
              : 0
          }%</strong></span>
        </div>
      </div>
    </div>
  );
};

export default Refunds;