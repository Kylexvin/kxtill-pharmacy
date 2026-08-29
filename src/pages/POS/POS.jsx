import React, { useState } from 'react';
import styles from './POS.module.css';

const POS = () => {
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'Electronics', 'Clothing', 'Food', 'Beverages', 'Accessories'];
  const products = Array(24).fill(null);

  return (
    <div className={styles.pos}>
      {/* Left Panel - Products Grid */}
      <div className={styles.productsPanel}>
        {/* Categories */}
        <div className={styles.categories}>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`${styles.categoryBtn} ${selectedCategory === cat ? styles.active : ''}`}
              onClick={() => setSelectedCategory(cat)}
            />
          ))}
        </div>

        {/* Products Grid */}
        <div className={styles.productsGrid}>
          {products.map((_, i) => (
            <div key={i} className={styles.productCard}>
              <div className={styles.productImage} />
              <div className={styles.productInfo}>
                <div className={styles.productName} />
                <div className={styles.productPrice} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel - Cart */}
      <div className={styles.cartPanel}>
        {/* Cart Header */}
        <div className={styles.cartHeader}>
          <div className={styles.cartTitle} />
          <div className={styles.cartActions}>
            <button className={styles.clearBtn} />
          </div>
        </div>

        {/* Cart Items */}
        <div className={styles.cartItems}>
          {Array(5).fill(null).map((_, i) => (
            <div key={i} className={styles.cartItem}>
              <div className={styles.cartItemInfo}>
                <div className={styles.cartItemName} />
                <div className={styles.cartItemPrice} />
              </div>
              <div className={styles.cartItemQty}>
                <button className={styles.qtyBtn} />
                <span className={styles.qtyText} />
                <button className={styles.qtyBtn} />
              </div>
            </div>
          ))}
        </div>

        {/* Cart Footer */}
        <div className={styles.cartFooter}>
          <div className={styles.cartTotal}>
            <div className={styles.totalLabel} />
            <div className={styles.totalAmount} />
          </div>
          <div className={styles.cartButtons}>
            <button className={styles.holdBtn} />
            <button className={styles.checkoutBtn} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default POS;