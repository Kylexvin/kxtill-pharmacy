// src/pages/Customers/Customers.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useSettings } from '../../contexts/SettingsContext';
import { KXTILL } from '../../constants/permissions';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  Users,
  Search,
  Plus,
  Eye,
  Pencil,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  AlertCircle,
  Phone,
  Mail,
  WifiOff,
} from 'lucide-react';
import styles from './Customers.module.css';
import CustomerModal from './components/CustomerModal';

const LIMIT = 20;

const Customers = () => {
  const navigate = useNavigate();
  const { activeOrganization, isOffline: contextIsOffline } = useAuth();
  const { can } = usePermissions();
  const { formatCurrency } = useSettings();

  const canView = can(KXTILL.CUSTOMERS.VIEW);
  const canCreate = can(KXTILL.CUSTOMERS.CREATE);
  const canUpdate = can(KXTILL.CUSTOMERS.UPDATE);

  const orgId = activeOrganization?.id;

  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(!contextIsOffline);

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);

  const isMountedRef = useRef(true);
  const fetchControllerRef = useRef(null);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, sourceFilter]);

  const fetchCustomers = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return { ok: false };
    }

    if (!hasLoadedOnceRef.current) setLoading(true);
    setError(null);

    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    try {
      const params = {
        limit: LIMIT,
        offset: (currentPage - 1) * LIMIT,
      };

      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (typeFilter !== 'all') params.customerType = typeFilter.toUpperCase();
      if (sourceFilter !== 'all') params.source = sourceFilter.toUpperCase();

      const isCurrentlyOnline = !contextIsOffline && navigator.onLine;

      if (!isCurrentlyOnline) {
        if (isMountedRef.current) {
          setCustomers([]);
          setTotal(0);
          hasLoadedOnceRef.current = true;
          setLoading(false);
        }
        return { ok: true, offline: true };
      }

      const response = await axios.get(
        `/organizations/${orgId}/kxtill/customers`,
        { params, signal: controller.signal, timeout: 10000 }
      );

      if (controller.signal.aborted || !isMountedRef.current) {
        return { ok: false };
      }

      const items = response.data?.items || [];
      setCustomers(items);
      setTotal(response.data?.total ?? items.length);
      hasLoadedOnceRef.current = true;
      return { ok: true };
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        return { ok: false };
      }
      console.error('Failed to fetch customers:', err);
      if (isMountedRef.current) {
        const message =
          err.response?.data?.error ||
          err.response?.data?.message ||
          'Failed to load customers';
        setError(message);
        setCustomers([]);
        setTotal(0);
      }
      return { ok: false };
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [
    orgId,
    currentPage,
    searchTerm,
    typeFilter,
    sourceFilter,
    contextIsOffline,
  ]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      fetchControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setIsOnline(!contextIsOffline);
  }, [contextIsOffline]);

  useEffect(() => {
    if (orgId) fetchCustomers();
  }, [fetchCustomers, orgId]);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const result = await fetchCustomers();
    if (isMountedRef.current) {
      setIsRefreshing(false);
      if (result?.ok) toast.success('Refreshed');
    }
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearchTerm('');
    setTypeFilter('all');
    setSourceFilter('all');
    setCurrentPage(1);
  };

  const getActiveFilterCount = () => {
    let n = 0;
    if (searchTerm.trim()) n++;
    if (typeFilter !== 'all') n++;
    if (sourceFilter !== 'all') n++;
    return n;
  };

  const handleViewCustomer = (customer) => {
    navigate(`/customers/${customer.id}`);
  };

  const handleEditCustomer = (customer) => {
    setEditingCustomer(customer);
  };

  const handleCreated = () => {
    setShowCreateModal(false);
    if (currentPage === 1) fetchCustomers();
    else setCurrentPage(1);
  };

  const handleUpdated = () => {
    setEditingCustomer(null);
    fetchCustomers();
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const showSkeleton = loading && !hasLoadedOnceRef.current;
  const showOffline = !isOnline || contextIsOffline;

  if (!orgId) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <AlertCircle size={40} />
          <h3>No organization selected</h3>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <AlertCircle size={40} />
          <h3>No permission</h3>
          <p>You don't have access to view customers.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerTitle}>
            <Users size={20} />
            <h1>Customers</h1>
          </div>
          <span className={styles.headerSubtitle}>
            {total} {total === 1 ? 'customer' : 'customers'}
          </span>
        </div>
        <div className={styles.headerRight}>
          {showOffline && (
            <span className={styles.offlineBadge}>
              <WifiOff size={14} />
              Offline
            </span>
          )}
          {canCreate && (
            <button
              type="button"
              className={styles.addCustomerBtn}
              onClick={() => setShowCreateModal(true)}
            >
              <Plus size={16} />
              Add Customer
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filtersBar}>
        <div className={styles.filterGroup}>
          <div className={styles.searchWrapper}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search by name, phone, or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={styles.searchInput}
            />
            {searchInput && (
              <button
                type="button"
                className={styles.clearSearchBtn}
                onClick={() => setSearchInput('')}
                title="Clear"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="all">All Types</option>
            <option value="individual">Individual</option>
            <option value="business">Business</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="all">All Sources</option>
            <option value="walk_in">Walk-in</option>
            <option value="referral">Referral</option>
            <option value="facebook">Facebook</option>
            <option value="website">Website</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="other">Other</option>
          </select>

          <button
            type="button"
            className={styles.refreshBtn}
            onClick={handleRefresh}
            disabled={isRefreshing || showOffline}
            title="Refresh"
          >
            <RefreshCw
              size={14}
              className={isRefreshing ? styles.spinning : ''}
            />
            {isRefreshing ? '...' : 'Refresh'}
          </button>

          {getActiveFilterCount() > 0 && (
            <button
              type="button"
              className={styles.clearFiltersBtn}
              onClick={clearFilters}
            >
              <X size={14} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableContainer}>
        {showSkeleton ? (
          <div className={styles.loadingState}>
            <RefreshCw size={28} className={styles.spinning} />
            <p>Loading customers...</p>
          </div>
        ) : error ? (
          <div className={styles.errorState}>
            <AlertCircle size={28} />
            <h3>Failed to load</h3>
            <p>{error}</p>
            <button type="button" onClick={fetchCustomers}>
              Retry
            </button>
          </div>
        ) : showOffline ? (
          <div className={styles.emptyState}>
            <WifiOff size={40} />
            <h3>You're Offline</h3>
            <p>
              Customer list isn't cached locally yet. Connect to the internet
              to browse.
            </p>
          </div>
        ) : customers.length === 0 ? (
          <div className={styles.emptyState}>
            <Users size={40} />
            <h3>
              {getActiveFilterCount() > 0 ? 'No matches' : 'No customers yet'}
            </h3>
            <p>
              {getActiveFilterCount() > 0
                ? 'Try adjusting your filters.'
                : 'Add your first customer to get started.'}
            </p>
            {getActiveFilterCount() > 0 ? (
              <button
                type="button"
                className={styles.clearFiltersBtnLarge}
                onClick={clearFilters}
              >
                Clear Filters
              </button>
            ) : canCreate ? (
              <button
                type="button"
                className={styles.addCustomerBtnLarge}
                onClick={() => setShowCreateModal(true)}
              >
                <Plus size={16} />
                Add Customer
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className={styles.tableHeader}>
              <span className={styles.tableInfo}>
                Showing {customers.length} of {total}
              </span>
            </div>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th className={styles.numericCol}>Sales</th>
                    <th className={styles.numericCol}>Total Spent</th>
                    <th className={styles.actionsCol}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr
                      key={customer.id}
                      className={styles.tableRow}
                      onClick={() => handleViewCustomer(customer)}
                    >
                      <td>
                        <div className={styles.nameCell}>
                          <div className={styles.nameAvatar}>
                            {customer.name?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div className={styles.nameInfo}>
                            <span className={styles.nameText}>
                              {customer.name}
                            </span>
                            {customer.customerType && (
                              <span className={styles.typeBadge}>
                                {customer.customerType}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {customer.phone ? (
                          <span className={styles.contactLine}>
                            <Phone size={12} />
                            {customer.phone}
                          </span>
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </td>
                      <td>
                        {customer.email ? (
                          <span className={styles.contactLine}>
                            <Mail size={12} />
                            {customer.email}
                          </span>
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </td>
                      <td className={styles.numericCol}>
                        <span className={styles.salesCount}>
                          {customer.salesCount ?? 0}
                        </span>
                      </td>
                      <td className={styles.numericCol}>
                        <span className={styles.spentAmount}>
                          {formatCurrency(customer.totalSpent ?? 0)}
                        </span>
                      </td>
                      <td
                        className={styles.actionsCol}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => handleViewCustomer(customer)}
                            title="View customer"
                          >
                            <Eye size={14} />
                          </button>
                          {canUpdate &&
                            customer.createdByProduct === 'kxtill' && (
                              <button
                                type="button"
                                className={styles.iconBtn}
                                onClick={() => handleEditCustomer(customer)}
                                title="Edit customer"
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <span className={styles.pageInfo}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() =>
                    setCurrentPage((p) => Math.min(p + 1, totalPages))
                  }
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

      {showCreateModal && (
        <CustomerModal
          isOpen={true}
          onClose={() => setShowCreateModal(false)}
          mode="create"
          onCreated={handleCreated}
        />
      )}

      {editingCustomer && (
        <CustomerModal
          isOpen={true}
          onClose={() => setEditingCustomer(null)}
          mode="edit"
          customer={editingCustomer}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
};

export default Customers;