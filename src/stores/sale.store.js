import { create } from 'zustand';
import { createSale as createSaleApi, getReceipt } from '../api/kxtill.api';
import { useAuthStore } from './auth.store';
import { useCartStore } from './cart.store';

export const useSaleStore = create((set, get) => ({
  currentSale: null,
  salesHistory: [],
  isLoading: false,
  error: null,
  receipt: null,

  processSale: async (paymentMethod, amountPaid) => {
    set({ isLoading: true, error: null });
    
    try {
      const { activeOrganization, activeBranch } = useAuthStore.getState();
      const { items, customer, notes, getTotal } = useCartStore.getState();
      
      if (!activeOrganization || !activeBranch) {
        throw new Error('No organization or branch selected');
      }
      
      if (items.length === 0) {
        throw new Error('Cart is empty');
      }

      const total = getTotal();
      
      // Prepare sale data
      const saleData = {
        items: items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
        })),
        total,
        paymentMethod,
        amountPaid,
        customer: customer || null,
        notes: notes || null,
      };

      const response = await createSaleApi(
        activeOrganization.id,
        activeBranch.id,
        saleData
      );

      const sale = response.data;
      set({ currentSale: sale, isLoading: false });

      // Clear cart after successful sale
      useCartStore.getState().clearCart();

      // Fetch receipt
      try {
        const receiptRes = await getReceipt(activeOrganization.id, sale.id);
        set({ receipt: receiptRes.data });
      } catch (receiptError) {
        console.error('Failed to fetch receipt:', receiptError);
      }

      return { success: true, sale };
      
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Sale failed', 
        isLoading: false 
      });
      return { success: false, error: error.response?.data?.message };
    }
  },

  clearSale: () => {
    set({ currentSale: null, receipt: null, error: null });
  },

  clearError: () => set({ error: null }),
}));