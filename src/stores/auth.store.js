import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { login as loginApi, logout as logoutApi } from '../api/auth.api';
import { getOrganizations } from '../api/org.api';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      organizations: [],
      activeOrganization: null,
      activeBranch: null,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const res = await loginApi(email, password);
          const { user, accessToken, refreshToken } = res.data;
          
          // Store tokens
          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('refreshToken', refreshToken);
          
          set({ 
            user, 
            accessToken, 
            refreshToken,
            isLoading: false 
          });

          // Fetch organizations
          try {
            const orgsRes = await getOrganizations();
            const organizations = orgsRes.data.organizations || [];
            set({ organizations });
            
            // Auto-select first active organization
            if (organizations.length > 0) {
              const activeOrg = organizations.find(org => org.status === 'active') || organizations[0];
              set({ activeOrganization: activeOrg });
            }
          } catch (orgError) {
            console.error('Failed to fetch organizations:', orgError);
          }

          return { success: true };
        } catch (error) {
          set({ 
            error: error.response?.data?.message || 'Login failed', 
            isLoading: false 
          });
          return { success: false, error: error.response?.data?.message };
        }
      },

      logout: async () => {
        const { refreshToken } = get();
        try {
          if (refreshToken) {
            await logoutApi(refreshToken);
          }
        } catch (error) {
          console.error('Logout error:', error);
        }
        
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          organizations: [],
          activeOrganization: null,
          activeBranch: null,
          error: null,
        });
      },

      setActiveOrganization: (organization) => {
        set({ 
          activeOrganization: organization, 
          activeBranch: null // Reset branch when org changes
        });
      },

      setActiveBranch: (branch) => {
        set({ activeBranch: branch });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        activeOrganization: state.activeOrganization,
        activeBranch: state.activeBranch,
      }),
    }
  )
);