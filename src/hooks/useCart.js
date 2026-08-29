import { useCartStore } from '../stores/cart.store';

export const useCart = () => {
  const {
    items,
    customer,
    notes,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    setCustomer,
    setNotes,
    getTotal,
    getItemCount,
    getCartSummary,
  } = useCartStore();

  return {
    items,
    customer,
    notes,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    setCustomer,
    setNotes,
    getTotal,
    getItemCount,
    getCartSummary,
  };
};