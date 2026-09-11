// src/pages/Customers/CustomerDetail.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useSettings } from '../../contexts/SettingsContext';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  Building2,
  MapPin,
  FileText,
  Plus,
  Pencil,
  Archive,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Clock,
  ShoppingBag,
  DollarSign,
  Receipt,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  WifiOff,
  Tag,
} from 'lucide-react';
import styles from './CustomerDetail.module.css';
import CustomerModal from './components/CustomerModal';

const SALES_LIMIT = 10;

const CustomerDetail = () => {
  const { id: customerId } = useParams();
  const navigate = useNavigate();
  const { activeOrganization, isOffline: contextIsOffline } = useAuth();
  const { can } = usePermissions();
  const { formatCurrency, formatDateTime } = useSettings();

  const canCreate = can('customers.create');
  const canUpdate = can('customers.update');
  const canDelete = can('customers.delete');

  const orgId = activeOrganization?.id;

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(!contextIsOffline);
  const [copiedField, setCopiedField] = useState(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [sales, setSales] = useState([]);
  const [salesTotal, setSalesTotal] = useState(0);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesPage, setSalesPage] = useState(1);

  const isMountedRef = useRef(true);
  const customerControllerRef = useRef(null);
  const salesControllerRef = useRef(null);

  const totalSalesPages = Math.max(1, Math.ceil(salesTotal / SALES_LIMIT));
  const showOffline = !isOnline || contextIsOffline;

  const fetchCustomer = useCallback(async () => {
    if (!orgId || !customerId) {
      setLoading(false);
      return;
    }

    customerControllerRef.current?.abort();
    const controller = new AbortController();
    customerControllerRef.current = controller;

    setError(null);

    try {
      const response = await axios.get(
        `/organizations/${orgId}/kxtill/customers/${customerId}`,
        { signal: controller.signal, timeout: 10000 }
      );

      if (controller.signal.aborted || !isMountedRef.current) return;

      const c = response.data?.customer || response.data;
      setCustomer(c);
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      console.error('Failed to fetch customer:', err);
      if (isMountedRef.current) {
        setError(
          err.response?.data?.error ||
          err.response?.data?.message ||
          (err.response?.status === 404
            ? 'Customer not found'
            : 'Failed to load customer')
        );
      }
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [orgId, customerId]);

  const fetchSales = useCallback(async () => {
    if (!orgId || !customerId) return;

    salesControllerRef.current?.abort();
    const controller = new AbortController();
    salesControllerRef.current = controller;

    setSalesLoading(true);

    try {
      const response = await axios.get(
        `/organizations/${orgId}/kxtill/customers/${customerId}/sales`,
        {
          params: {
            limit: SALES_LIMIT,
            offset: (salesPage - 1) * SALES_LIMIT,
          },
          signal: controller.signal,
          timeout: 10000,
        }
      );

      if (controller.signal.aborted || !isMountedRef.current) return;

      const items = response.data?.items || [];
      setSales(items);
      setSalesTotal(response.data?.total ?? items.length);
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      console.error('Failed to fetch customer sales:', err);
      if (isMountedRef.current) {
        setSales([]);
        setSalesTotal(0);
      }
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setSalesLoading(false);
      }
    }
  }, [orgId, customerId, salesPage]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      customerControllerRef.current?.abort();
      salesControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setIsOnline(!contextIsOffline);
  }, [contextIsOffline]);

  useEffect(() => {
    if (orgId && customerId) fetchCustomer();
  }, [fetchCustomer, orgId, customerId]);

  useEffect(() => {
    if (orgId && customerId) fetchSales();
  }, [fetchSales, orgId, customerId]);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([fetchCustomer(), fetchSales()]);
      toast.success('Refreshed');
    } catch {
      toast.error('Failed to refresh');
    } finally {
      if (isMountedRef.current) setIsRefreshing(false);
    }
  };

  const handleCopy = (value, field) => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    toast.success('Copied');
    setTimeout(() => setCopiedField(null), 1500);
  };

  const handleSaleClick = (sale) => {
    navigate(`/sales?highlight=${sale.id}`);
  };

  const handleCreated = (newCustomer) => {
    setShowCreateModal(false);
    navigate(`/customers/${newCustomer.id}`);
  };

  const handleUpdated = (updated) => {
    setShowEditModal(false);
    setCustomer(updated);
    fetchCustomer();
  };

  const handleArchive = async () => {
    if (!orgId || !customerId || archiving) return;
    setArchiving(true);
    try {
      await axios.delete(
        `/organizations/${orgId}/kxtill/customers/${customerId}`
      );
      toast.success(`${customer.name} archived`);
      navigate('/customers');
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to archive customer';
      toast.error(message);
      setShowArchiveConfirm(false);
    } finally {
      if (isMountedRef.current) setArchiving(false);
    }
  };

  const getPaymentLabel = (method) => {
    const map = {
      CASH: 'Cash',
      MPESA: 'M-PESA',
      CARD: 'Card',
      BANK: 'Bank',
    };
    return map[method] || method || '—';
  };

  if (!orgId || !customerId) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <AlertCircle size={40} />
          <h3>Invalid customer</h3>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>
          <RefreshCw size={28} className={styles.spinning} />
          <p>Loading customer...</p>
        </div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <AlertCircle size={40} />
          <h3>Failed to load</h3>
          <p>{error || 'Customer not found'}</p>
          <button
            type="button"
            className={styles.backBtn}
            onClick={() => navigate('/customers')}
          >
            <ArrowLeft size={14} />
            Back to customers
          </button>
        </div>
      </div>
    );
  }

  const stats = customer.stats || {};
  const isKxTillCustomer = customer.createdByProduct === 'kxtill';

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button
            type="button"
            className={styles.backIconBtn}
            onClick={() => navigate('/customers')}
            title="Back to customers"
          >
            <ArrowLeft size={18} />
          </button>
          <div className={styles.headerTitleBlock}>
            <div className={styles.headerTitleRow}>
              <h1>{customer.name}</h1>
              {customer.customerType && (
                <span className={styles.typeBadge}>
                  {customer.customerType === 'BUSINESS' ? 'Business' : 'Individual'}
                </span>
              )}
              {!customer.isActive && (
                <span className={styles.inactiveBadge}>Inactive</span>
              )}
            </div>
            <div className={styles.headerMeta}>
              {customer.createdByProduct === 'kxtill' && (
                <span className={styles.sourceTag}>
                  <Tag size={11} />
                  Created in KxTill
                </span>
              )}
            </div>
          </div>
        </div>
        <div className={styles.headerRight}>
          {showOffline && (
            <span className={styles.offlineBadge}>
              <WifiOff size={14} />
              Offline
            </span>
          )}

          <button
            type="button"
            className={styles.refreshBtn}
            onClick={handleRefresh}
            disabled={isRefreshing || showOffline}
            title="Refresh"
          >
            <RefreshCw size={14} className={isRefreshing ? styles.spinning : ''} />
            {isRefreshing ? '...' : 'Refresh'}
          </button>

          {isKxTillCustomer && canUpdate && (
            <button
              type="button"
              className={styles.editBtn}
              onClick={() => setShowEditModal(true)}
              title="Edit customer"
            >
              <Pencil size={14} />
              Edit
            </button>
          )}

          {isKxTillCustomer && canDelete && (
            <button
              type="button"
              className={styles.archiveBtn}
              onClick={() => setShowArchiveConfirm(true)}
              title="Archive customer"
            >
              <Archive size={14} />
              Archive
            </button>
          )}

          {canCreate && (
            <button
              type="button"
              className={styles.addBtn}
              onClick={() => setShowCreateModal(true)}
              title="Add new customer"
            >
              <Plus size={16} />
              New
            </button>
          )}
        </div>
      </div>

      {/* Layout */}
      <div className={styles.layout}>
        {/* Left column — info */}
        <div className={styles.infoColumn}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <User size={15} />
              <span>Contact</span>
            </div>
            <div className={styles.cardBody}>
              {customer.phone ? (
                <div className={styles.infoRow}>
                  <div className={styles.infoIcon}>
                    <Phone size={14} />
                  </div>
                  <div className={styles.infoContent}>
                    <span className={styles.infoLabel}>Phone</span>
                    <span className={styles.infoValue}>{customer.phone}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.copyBtn}
                    onClick={() => handleCopy(customer.phone, 'phone')}
                    title="Copy"
                  >
                    {copiedField === 'phone' ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
              ) : null}

              {customer.email ? (
                <div className={styles.infoRow}>
                  <div className={styles.infoIcon}>
                    <Mail size={14} />
                  </div>
                  <div className={styles.infoContent}>
                    <span className={styles.infoLabel}>Email</span>
                    <span className={styles.infoValue}>{customer.email}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.copyBtn}
                    onClick={() => handleCopy(customer.email, 'email')}
                    title="Copy"
                  >
                    {copiedField === 'email' ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
              ) : null}

              {!customer.phone && !customer.email && (
                <div className={styles.mutedBlock}>
                  No contact information on file.
                </div>
              )}
            </div>
          </div>

          {(customer.customerType === 'BUSINESS' ||
            customer.companyName ||
            customer.taxNumber) && (
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <Building2 size={15} />
                <span>Business Details</span>
              </div>
              <div className={styles.cardBody}>
                {customer.companyName && (
                  <div className={styles.infoRow}>
                    <div className={styles.infoIcon}>
                      <Building2 size={14} />
                    </div>
                    <div className={styles.infoContent}>
                      <span className={styles.infoLabel}>Company</span>
                      <span className={styles.infoValue}>{customer.companyName}</span>
                    </div>
                  </div>
                )}
                {customer.taxNumber && (
                  <div className={styles.infoRow}>
                    <div className={styles.infoIcon}>
                      <FileText size={14} />
                    </div>
                    <div className={styles.infoContent}>
                      <span className={styles.infoLabel}>Tax Number</span>
                      <span className={styles.infoValue}>{customer.taxNumber}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {(customer.address || customer.city || customer.country) && (
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <MapPin size={15} />
                <span>Address</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.addressBlock}>
                  {customer.address && <div>{customer.address}</div>}
                  <div>
                    {[customer.city, customer.country].filter(Boolean).join(', ')}
                  </div>
                </div>
              </div>
            </div>
          )}

          {customer.notes && (
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <FileText size={15} />
                <span>Notes</span>
              </div>
              <div className={styles.cardBody}>
                <p className={styles.notesText}>{customer.notes}</p>
              </div>
            </div>
          )}

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <Clock size={15} />
              <span>Meta</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Created</span>
                <span className={styles.metaValue}>
                  {formatDateTime(customer.createdAt)}
                </span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Updated</span>
                <span className={styles.metaValue}>
                  {formatDateTime(customer.updatedAt)}
                </span>
              </div>
              {customer.source && (
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Source</span>
                  <span className={styles.metaValue}>
                    {customer.source.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </div>
              )}
              {customer.createdByProduct && (
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Created via</span>
                  <span className={styles.metaValue}>
                    {customer.createdByProduct}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column — stats + sales */}
        <div className={styles.mainColumn}>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles.statIconSales}`}>
                <ShoppingBag size={16} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Sales</span>
                <span className={styles.statValue}>{stats.salesCount ?? 0}</span>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles.statIconSpent}`}>
                <DollarSign size={16} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Total Spent</span>
                <span className={styles.statValue}>
                  {formatCurrency(stats.totalSpent ?? 0)}
                </span>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={`${styles.statIcon} ${styles.statIconRecent}`}>
                <Clock size={16} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Last Purchase</span>
                <span className={styles.statValueSmall}>
                  {stats.lastPurchaseAt
                    ? formatDateTime(stats.lastPurchaseAt)
                    : '—'}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <Receipt size={15} />
              <span>Purchase History</span>
              <span className={styles.cardHeaderCount}>
                {salesTotal} {salesTotal === 1 ? 'sale' : 'sales'}
              </span>
            </div>

            <div className={styles.salesBody}>
              {salesLoading ? (
                <div className={styles.salesLoadingState}>
                  <RefreshCw size={20} className={styles.spinning} />
                  <p>Loading sales...</p>
                </div>
              ) : sales.length === 0 ? (
                <div className={styles.salesEmptyState}>
                  <Receipt size={32} />
                  <p>No purchases yet</p>
                  <span>This customer hasn't bought anything.</span>
                </div>
              ) : (
                <>
                  <div className={styles.salesScroll}>
                    <table className={styles.salesTable}>
                      <thead>
                        <tr>
                          <th>Reference</th>
                          <th>Date</th>
                          <th>Items</th>
                          <th className={styles.numericCol}>Total</th>
                          <th>Payment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sales.map((sale) => {
                          const paymentMethod = sale.payments?.[0]?.method || '—';
                          const itemCount = sale.items?.length || 0;
                          return (
                            <tr
                              key={sale.id}
                              className={styles.saleRow}
                              onClick={() => handleSaleClick(sale)}
                            >
                              <td>
                                <span className={styles.saleRef}>
                                  {sale.reference || sale.id?.slice(-8).toUpperCase()}
                                </span>
                              </td>
                              <td className={styles.saleDate}>
                                {formatDateTime(sale.createdAt)}
                              </td>
                              <td className={styles.saleItemsCount}>
                                {itemCount}
                              </td>
                              <td className={styles.numericCol}>
                                <span className={styles.saleTotal}>
                                  {formatCurrency(sale.totalAmount)}
                                </span>
                              </td>
                              <td>
                                <span className={styles.paymentPill}>
                                  {getPaymentLabel(paymentMethod)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {totalSalesPages > 1 && (
                    <div className={styles.salesPagination}>
                      <button
                        type="button"
                        className={styles.pageBtn}
                        onClick={() => setSalesPage((p) => Math.max(p - 1, 1))}
                        disabled={salesPage === 1}
                      >
                        <ChevronLeft size={14} />
                        Previous
                      </button>
                      <span className={styles.pageInfo}>
                        Page {salesPage} of {totalSalesPages}
                      </span>
                      <button
                        type="button"
                        className={styles.pageBtn}
                        onClick={() =>
                          setSalesPage((p) => Math.min(p + 1, totalSalesPages))
                        }
                        disabled={salesPage === totalSalesPages}
                      >
                        Next
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <CustomerModal
          isOpen={true}
          onClose={() => setShowCreateModal(false)}
          mode="create"
          onCreated={handleCreated}
        />
      )}

      {showEditModal && (
        <CustomerModal
          isOpen={true}
          onClose={() => setShowEditModal(false)}
          mode="edit"
          customer={customer}
          onUpdated={handleUpdated}
        />
      )}

      {showArchiveConfirm && (
        <div
          className={styles.modalOverlay}
          onClick={() => !archiving && setShowArchiveConfirm(false)}
        >
          <div
            className={styles.confirmModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.confirmIcon}>
              <AlertTriangle size={28} />
            </div>
            <h3>Archive Customer</h3>
            <p>
              Are you sure you want to archive <strong>{customer.name}</strong>?
              They will no longer appear in the customer list, but their
              purchase history will be kept.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmCancelBtn}
                onClick={() => setShowArchiveConfirm(false)}
                disabled={archiving}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmArchiveBtn}
                onClick={handleArchive}
                disabled={archiving}
              >
                {archiving ? 'Archiving...' : 'Archive Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDetail;