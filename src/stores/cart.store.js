import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],
      customer: null,
      notes: '',

      addItem: (product, quantity = 1) => {
        const { items } = get();
        const existingItem = items.find(item => item.productId === product.id);
        
        if (existingItem) {
          // Update quantity if item exists
          set({
            items: items.map(item =>
              item.productId === product.id
                ? { ...item, quantity: item.quantity + quantity }
                : item
            )
          });
        } else {
          // Add new item
          set({
            items: [
              ...items,
              {
                productId: product.id,
                name: product.name,
                price: product.price,
                quantity: quantity,
                total: product.price * quantity,
                product: product,
              }
            ]
          });
        }
      },

      removeItem: (productId) => {
        set({
          items: get().items.filter(item => item.productId !== productId)
        });
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        
        set({
          items: get().items.map(item =>
            item.productId === productId
              ? { 
                  ...item, 
                  quantity: quantity,
                  total: item.price * quantity 
                }
              : item
          )
        });
      },

      clearCart: () => {
        set({ items: [], customer: null, notes: '' });
      },

      setCustomer: (customer) => set({ customer }),
      setNotes: (notes) => set({ notes }),

      getTotal: () => {
        return get().items.reduce((sum, item) => sum + item.total, 0);
      },

      getItemCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },

      getCartSummary: () => {
        const items = get().items;
        const total = get().getTotal();
        const count = get().getItemCount();
        return { items, total, count };
      },
    }),
    {
      name: 'cart-storage',
    }
  )
);