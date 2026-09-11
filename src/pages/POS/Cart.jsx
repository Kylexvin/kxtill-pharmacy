// src/pages/POS/Cart.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Minus, Trash2, ShoppingCart,
  User, Users, CreditCard, X, Search, UserPlus, Phone, Loader
} from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import {
  searchLocalCustomers,
  upsertLocalCustomer,
} from '../../db/sqlite';
import styles from './POS.module.css';

const Cart = ({
  items,
  subtotal,
  taxAmount,
  total,
  currency,
  decimals,
  customer,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onCheckout,
  onCustomerSelect
}) => {
  const { activeOrganization } = useAuth();
  const { formatCurrency } = useSettings();

  const orgId = activeOrganization?.id;

  const fmt = (n) => Number(n).toFixed(decimals ?? 2);
  const formatPrice = (amount) => {
    try {
      return formatCurrency(amount);
    } catch {
      return `${fmt(amount)} ${currency}`;
    }
  };

  const handleIncrement = (item) => {
    const stock = Number(item.stock || 0);
    const newQty = item.quantity + 1;
    if (newQty > stock) {
      toast.error(`Not enough stock. Available: ${stock}`);
      return;
    }
    onUpdateQuantity(item.id, newQty);
  };

  const handleDecrement = (item) => {
    const newQty = item.quantity - 1;
    if (newQty <= 0) {
      onRemoveItem(item.id);
      return;
    }
    onUpdateQuantity(item.id, newQty);
  };

  // ---- Inline customer panel state ----
  const [panelOpen, setPanelOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Watch connectivity
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

  // Reset panel state whenever the customer prop changes
  // (cashier picked one, removed one, or POS cleared after a sale)
  useEffect(() => {
    setPanelOpen(false);
    setQuery('');
    setResults([]);
    setShowQuickAdd(false);
    setNewName('');
    setNewPhone('');
  }, [customer]);

  // Debounced search: local first, then server if online
  useEffect(() => {
    if (!panelOpen) return;
    if (!query.trim()) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        let localResults = [];
        try {
          localResults = await searchLocalCustomers(query);
        } catch {
          localResults = [];
        }

        const merged = localResults.map((c) => ({
          id: c.serverId || c.id,
          tempId: c.isSynced ? null : c.id,
          name: c.name,
          phone: c.phone,
        }));

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
                });
              }
            }
          } catch {
            // fall back to local-only silently
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
  }, [query, online, orgId, panelOpen]);

  const handleSelect = useCallback((c) => {
    onCustomerSelect({
      id: c.id,
      tempId: c.tempId,
      name: c.name,
      phone: c.phone,
    });
    setPanelOpen(false);
  }, [onCustomerSelect]);

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

      try {
        await upsertLocalCustomer(localCustomer);
      } catch {
        // DB not ready — proceed with in-memory temp id
      }

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
            try {
              await upsertLocalCustomer({
                ...localCustomer,
                serverId: created.id,
                isSynced: true,
                updatedAt: new Date().toISOString(),
              });
            } catch {}

            onCustomerSelect({
              id: created.id,
              tempId: null,
              name: created.name || localCustomer.name,
              phone: created.phone || localCustomer.phone,
            });

            toast.success('Customer added');
            setPanelOpen(false);
            return;
          }
        } catch {
          // fall through to offline path
        }
      }

      onCustomerSelect({
        id: tempId,
        tempId,
        name: localCustomer.name,
        phone: localCustomer.phone,
      });

      toast.success(online ? 'Customer added' : 'Customer saved offline');
      setPanelOpen(false);
    } catch (err) {
      console.error('Quick add failed:', err);
      toast.error('Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.cartPanel}>
      {/* Cart Header */}
      <div className={styles.cartHeader}>
        <div className={styles.cartTitle}>
          <ShoppingCart size={18} />
          <span>Cart</span>
          <span className={styles.cartCount}>{items.length}</span>
        </div>
        <div className={styles.cartActions}>
          {items.length > 0 && (
            <button className={styles.clearBtn} onClick={onClearCart} title="Clear cart">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Customer Section */}
      <div className={styles.customerSection}>
        {customer ? (
          <div className={styles.customerBadge}>
            <User size={14} />
            <span>{customer.name}</span>
            <button
              onClick={() => onCustomerSelect(null)}
              title="Remove customer"
              type="button"
            >
              <X size={14} />
            </button>
          </div>
        ) : !panelOpen ? (
          <button
            type="button"
            className={styles.addCustomerBtn}
            onClick={() => setPanelOpen(true)}
          >
            <Users size={14} />
            <span>Add Customer</span>
          </button>
        ) : (
          <div className={styles.customerInlinePanel}>
            <div className={styles.customerPanelHeader}>
              <span className={styles.customerPanelTitle}>
                <User size={13} />
                Add Customer
              </span>
              <button
                type="button"
                className={styles.customerPanelClose}
                onClick={() => setPanelOpen(false)}
                title="Cancel"
              >
                <X size={14} />
              </button>
            </div>

            <div className={styles.customerSearchRow}>
              <Search size={14} className={styles.customerSearchIcon} />
              <input
                type="text"
                placeholder="Search name or phone..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={styles.customerSearchInput}
                autoFocus
              />
              {searching && <Loader size={13} className={styles.spinning} />}
            </div>

            {results.length > 0 && (
              <div className={styles.customerResults}>
                {results.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={styles.customerResultItem}
                    onClick={() => handleSelect(c)}
                  >
                    <div className={styles.customerResultAvatar}>
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className={styles.customerResultInfo}>
                      <span className={styles.customerResultName}>{c.name}</span>
                      {c.phone && (
                        <span className={styles.customerResultPhone}>
                          <Phone size={11} /> {c.phone}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {query.trim() && !searching && results.length === 0 && (
              <div className={styles.customerNoResults}>No customer found</div>
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
                <UserPlus size={13} />
                Add new customer
              </button>
            ) : (
              <div className={styles.quickForm}>
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
                    {saving ? 'Saving...' : online ? 'Add' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cart Items */}
      <div className={styles.cartItems}>
        {items.length === 0 ? (
          <div className={styles.emptyCart}>
            <ShoppingCart size={48} />
            <p>Cart is empty</p>
            <span>Add products to start selling</span>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className={styles.cartItem}>
              <div className={styles.cartItemInfo}>
                <span className={styles.cartItemName}>{item.productName}</span>
                <span className={styles.cartItemUnit}>{item.unitName}</span>
                <span className={styles.cartItemPrice}>
                  {formatPrice(item.unitPrice)} × {item.quantity}
                </span>
                <span className={styles.cartItemStock}>
                  Stock: {item.stock || 0}
                </span>
              </div>
              <div className={styles.cartItemQty}>
                <button
                  className={styles.qtyBtn}
                  onClick={() => handleDecrement(item)}
                >
                  <Minus size={14} />
                </button>
                <span className={styles.qtyText}>{item.quantity}</span>
                <button
                  className={styles.qtyBtn}
                  onClick={() => handleIncrement(item)}
                >
                  <Plus size={14} />
                </button>
                <button
                  className={styles.removeBtn}
                  onClick={() => onRemoveItem(item.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Cart Footer */}
      <div className={styles.cartFooter}>
        <div className={styles.cartTotal}>
          <div className={styles.totalRow}>
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {taxAmount > 0 && (
            <div className={styles.totalRow}>
              <span>Tax</span>
              <span>{formatPrice(taxAmount)}</span>
            </div>
          )}
          <div className={`${styles.totalRow} ${styles.grandTotal}`}>
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>

        <div className={styles.cartButtons}>
          <button
            className={styles.checkoutBtn}
            onClick={onCheckout}
            disabled={items.length === 0}
          >
            <CreditCard size={16} />
            Pay {formatPrice(total)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cart;