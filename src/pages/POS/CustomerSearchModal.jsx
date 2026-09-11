// src/pages/POS/CustomerSearchModal.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, UserPlus, User, Phone, Loader } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import {
  searchLocalCustomers,
  upsertLocalCustomer,
} from '../../db/sqlite';
import styles from './CustomerSearchModal.module.css';

const CustomerSearchModal = ({ isOpen, onClose, onSelect }) => {
  const { activeOrganization } = useAuth();
  const orgId = activeOrganization?.id;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  // quick-add form
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Track connectivity so the modal reflects it live
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Reset state whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setShowQuickAdd(false);
      setNewName('');
      setNewPhone('');
    }
  }, [isOpen]);

  // Debounced search: local first, then server (if online), merge + dedupe
  useEffect(() => {
    if (!isOpen) return;
    if (!query.trim()) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        // 1. Local always
        const localResults = await searchLocalCustomers(query);

        // Shape local rows into the same shape as server rows
        const merged = localResults.map((c) => ({
          // If synced, use serverId as the "real" id; else use the temp id
          id: c.serverId || c.id,
          tempId: c.isSynced ? null : c.id,
          name: c.name,
          phone: c.phone,
          isLocalOnly: !c.isSynced,
        }));

        // 2. Server if online
        if (online && orgId) {
          try {
            const res = await axios.get(
              `/organizations/${orgId}/customers`,
              { params: { search: query, limit: 20 }, timeout: 8000 }
            );
            const serverList = res.data.items || res.data.customers || [];
            const seen = new Set(merged.map((m) => m.id));
            for (const c of serverList) {
              if (!seen.has(c.id)) {
                merged.push({
                  id: c.id,
                  tempId: null,
                  name: c.name,
                  phone: c.phone,
                  isLocalOnly: false,
                });
              }
            }
          } catch (err) {
            // Fall back to local-only silently — don't toast
          }
        }

        if (!cancelled) setResults(merged);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, online, orgId, isOpen]);

  const handleSelect = useCallback((customer) => {
    onSelect({
      id: customer.id,
      tempId: customer.tempId,
      name: customer.name,
      phone: customer.phone,
    });
    onClose();
  }, [onSelect, onClose]);

  const handleQuickAdd = async () => {
    if (!newName.trim()) {
      toast.error('Name is required');
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const tempId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const localCustomer = {
        id: tempId,
        serverId: null,
        name: newName.trim(),
        phone: newPhone.trim() || null,
        email: null,
        isSynced: false,
        createdAt: now,
        updatedAt: now,
      };

      // Always save locally first — the sale can reference it immediately
      await upsertLocalCustomer(localCustomer);

      // If online, try to create on server right away so we get the real id
      if (online && orgId) {
        try {
          const res = await axios.post(
            `/organizations/${orgId}/customers`,
            {
              name: localCustomer.name,
              customerType: 'INDIVIDUAL',
              phone: localCustomer.phone || undefined,
            },
            { timeout: 8000 }
          );
          const created = res.data?.customer || res.data;

          if (created?.id) {
            await upsertLocalCustomer({
              ...localCustomer,
              serverId: created.id,
              isSynced: true,
              updatedAt: new Date().toISOString(),
            });

            onSelect({
              id: created.id,
              tempId: null,
              name: created.name || localCustomer.name,
              phone: created.phone || localCustomer.phone,
            });

            toast.success('Customer added');
            onClose();
            return;
          }
        } catch (err) {
          // Server rejected — keep the local copy, sync engine will retry
        }
      }

      // Offline path (or server failed) — attach with temp id
      onSelect({
        id: tempId,
        tempId,
        name: localCustomer.name,
        phone: localCustomer.phone,
      });

      toast.success(online ? 'Customer added' : 'Customer saved offline');
      onClose();
    } catch (err) {
      console.error('Quick add customer failed:', err);
      toast.error('Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <User size={18} />
            <span>Add Customer</span>
            {!online && <span className={styles.offlineTag}>Offline</span>}
          </div>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.searchRow}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={styles.searchInput}
              autoFocus
            />
            {searching && <Loader size={14} className={styles.spinner} />}
          </div>

          {results.length > 0 && (
            <div className={styles.results}>
              {results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={styles.resultItem}
                  onClick={() => handleSelect(c)}
                >
                  <div className={styles.resultAvatar}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.resultInfo}>
                    <span className={styles.resultName}>{c.name}</span>
                    {c.phone && (
                      <span className={styles.resultPhone}>
                        <Phone size={12} /> {c.phone}
                      </span>
                    )}
                  </div>
                  {c.isLocalOnly && (
                    <span className={styles.pendingBadge}>Unsynced</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {query.trim() && !searching && results.length === 0 && (
            <div className={styles.empty}>
              <p>No customer found</p>
            </div>
          )}

          {!showQuickAdd ? (
            <button
              type="button"
              className={styles.newCustomerBtn}
              onClick={() => {
                setNewName(query.trim());
                setShowQuickAdd(true);
              }}
            >
              <UserPlus size={15} />
              Add new customer
            </button>
          ) : (
            <div className={styles.quickForm}>
              <div className={styles.quickFormTitle}>
                <UserPlus size={14} />
                New customer
              </div>
              <input
                type="text"
                placeholder="Name *"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className={styles.formInput}
                autoFocus
              />
              <input
                type="tel"
                placeholder="Phone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className={styles.formInput}
              />
              <div className={styles.quickFormActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => {
                    setShowQuickAdd(false);
                    setNewName('');
                    setNewPhone('');
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.saveBtn}
                  onClick={handleQuickAdd}
                  disabled={saving || !newName.trim()}
                >
                  {saving ? 'Saving...' : online ? 'Add Customer' : 'Save Offline'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerSearchModal;