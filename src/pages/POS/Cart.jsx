import React from 'react';
import {
  Plus, Minus, Trash2, ShoppingCart,
  User, Users, CreditCard, X
} from 'lucide-react';
import toast from 'react-hot-toast';
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
  const fmt = (n) => Number(n).toFixed(decimals ?? 2);

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
            <button onClick={() => onCustomerSelect(null)}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            className={styles.addCustomerBtn}
            onClick={() => toast('Customer search coming soon', { icon: 'ℹ️' })}
          >
            <Users size={14} />
            <span>Add Customer</span>
          </button>
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
                  {fmt(item.unitPrice)} {currency} × {item.quantity}
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
            <span>{fmt(subtotal)} {currency}</span>
          </div>
          {taxAmount > 0 && (
            <div className={styles.totalRow}>
              <span>Tax</span>
              <span>{fmt(taxAmount)} {currency}</span>
            </div>
          )}
          <div className={`${styles.totalRow} ${styles.grandTotal}`}>
            <span>Total</span>
            <span>{fmt(total)} {currency}</span>
          </div>
        </div>

        <div className={styles.cartButtons}>
          <button
            className={styles.checkoutBtn}
            onClick={onCheckout}
            disabled={items.length === 0}
          >
            <CreditCard size={16} />
            Pay {fmt(total)} {currency}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cart;