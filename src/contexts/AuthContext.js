// src/contexts/AuthContext.jsx

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';

export const AuthContext = createContext(null);

// Helper for localStorage
function safeLocalStorageGet(key, defaultValue) {
  if (typeof window === 'undefined') return defaultValue;
  const stored = localStorage.getItem(key);
  if (!stored || stored === 'undefined' || stored === 'null') return defaultValue;
  
  if (typeof defaultValue === 'string') {
    return stored;
  }
  
  try {
    const parsed = JSON.parse(stored);
    return parsed !== null && parsed !== undefined ? parsed : defaultValue;
  } catch {
    return stored;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => safeLocalStorageGet('user', null));
  const [accessToken, setAccessToken] = useState(() => safeLocalStorageGet('accessToken', null));
  const [refreshToken, setRefreshToken] = useState(() => safeLocalStorageGet('refreshToken', null));
  const [organizations, setOrganizations] = useState(() => safeLocalStorageGet('organizations', []));
  const [branches, setBranches] = useState(() => safeLocalStorageGet('branches', []));
  const [settings, setSettings] = useState(() => safeLocalStorageGet('settings', null));
  const [activeOrganization, setActiveOrganizationState] = useState(() => 
    safeLocalStorageGet('activeOrganization', null)
  );
  const [activeBranch, setActiveBranchState] = useState(() => 
    safeLocalStorageGet('activeBranch', null)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState(null);
  const authInitialized = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (authInitialized.current) return;
    authInitialized.current = true;

    const storedUser = localStorage.getItem('user');
    const storedToken = localStorage.getItem('accessToken');
    const storedRefresh = localStorage.getItem('refreshToken');
    const storedOrgs = localStorage.getItem('organizations');
    const storedBranches = localStorage.getItem('branches');
    const storedSettings = localStorage.getItem('settings');
    const storedActive = localStorage.getItem('activeOrganization');
    const storedActiveBranch = localStorage.getItem('activeBranch');

    if (storedToken) setAccessToken(storedToken);
    if (storedRefresh) setRefreshToken(storedRefresh);
    if (storedUser) {
      try { setUser(JSON.parse(storedUser)); } catch {}
    }
    if (storedOrgs) {
      try { setOrganizations(JSON.parse(storedOrgs)); } catch {}
    }
    if (storedBranches) {
      try { setBranches(JSON.parse(storedBranches)); } catch {}
    }
    if (storedSettings) {
      try { setSettings(JSON.parse(storedSettings)); } catch {}
    }
    if (storedActive) {
      try { setActiveOrganizationState(JSON.parse(storedActive)); } catch {}
    }
    if (storedActiveBranch) {
      try { setActiveBranchState(JSON.parse(storedActiveBranch)); } catch {}
    }
  }, []);

  // Check pending sales from SQLite
  const checkPendingSales = async () => {
    try {
      const { getPendingSales } = await import('../db/sqlite');
      const pending = await getPendingSales();
      return pending;
    } catch (err) {
      console.error('Failed to check pending sales:', err);
      return [];
    }
  };

  // Clear offline data with pending sale check
  const clearOfflineData = async (force = false) => {
    try {
      const pending = await checkPendingSales();
      
      if (pending.length > 0 && !force) {
        const currentBranchId = activeBranch?.id;
        const pendingForCurrentBranch = pending.filter(s => s.branchId === currentBranchId);
        
        if (pendingForCurrentBranch.length > 0) {
          return {
            hasPendingSales: true,
            pendingCount: pendingForCurrentBranch.length,
            message: `You have ${pendingForCurrentBranch.length} pending sale(s) that haven't been synced. Switching will clear them.`
          };
        }
        
        if (pending.length > 0 && pendingForCurrentBranch.length === 0) {
          console.log('Pending sales exist but for different branch, safe to clear');
        }
      }
      
      localStorage.removeItem('kxtill_db');
      
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('initialSyncDone:')) {
          localStorage.removeItem(key);
        }
      });
      
      return { hasPendingSales: false };
    } catch (err) {
      console.error('Failed to clear offline data:', err);
      localStorage.removeItem('kxtill_db');
      return { hasPendingSales: false };
    }
  };

  // Login
  const login = async (email, password) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.post('/auth/login', { email, password });
      const { user, accessToken, refreshToken, organizations } = response.data;

      setUser(user);
      setAccessToken(accessToken);
      setRefreshToken(refreshToken);
      setOrganizations(organizations || []);

      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('organizations', JSON.stringify(organizations || []));

      if (organizations && organizations.length === 1) {
        await setActiveOrganization(organizations[0].id, true);
      }

      return { hasOrganizations: organizations && organizations.length > 0 };
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Logout
  const logout = async () => {
    try {
      const pending = await checkPendingSales();
      if (pending.length > 0) {
        console.warn(`Logging out with ${pending.length} pending sale(s)`);
      }
    } catch (err) {
      console.error('Failed to check pending sales on logout:', err);
    }
    
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    setOrganizations([]);
    setBranches([]);
    setSettings(null);
    setActiveOrganizationState(null);
    setActiveBranchState(null);
    setError(null);
    
    localStorage.removeItem('user');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('organizations');
    localStorage.removeItem('branches');
    localStorage.removeItem('settings');
    localStorage.removeItem('activeOrganization');
    localStorage.removeItem('activeBranch');
    localStorage.removeItem('kxtill_db');
    
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('initialSyncDone:')) {
        localStorage.removeItem(key);
      }
    });
  };

  // Fetch Settings
  const fetchSettings = async () => {
    if (!activeOrganization) return null;
    
    try {
      const response = await axios.get(
        `/organizations/${activeOrganization.id}/kxtill/settings`
      );
      const data = response.data.settings;
      setSettings(data);
      localStorage.setItem('settings', JSON.stringify(data));
      return data;
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      return null;
    }
  };

  // Set Active Organization
  const setActiveOrganization = async (orgId, isLogin = false) => {
    setIsLoading(true);
    setIsSwitching(true);
    setError(null);
    
    try {
      const org = organizations.find(o => o.id === orgId);
      if (!org) {
        throw new Error('Organization not found');
      }

      if (!isLogin) {
        const pendingResult = await clearOfflineData(false);
        if (pendingResult.hasPendingSales) {
          const confirmSwitch = window.confirm(
            `${pendingResult.message}\n\nAre you sure you want to switch? All unsynced sales will be lost.`
          );
          if (!confirmSwitch) {
            setIsSwitching(false);
            setIsLoading(false);
            return;
          }
          await clearOfflineData(true);
        }
      } else {
        await clearOfflineData(true);
      }

      setActiveOrganizationState(org);
      localStorage.setItem('activeOrganization', JSON.stringify(org));

      const response = await axios.get(`/organizations/${orgId}/branches/my`);
      const fetchedBranches = response.data.branches || [];
      
      setBranches(fetchedBranches);
      localStorage.setItem('branches', JSON.stringify(fetchedBranches));

      if (fetchedBranches.length > 0) {
        const active = fetchedBranches.find(b => b.isActive !== false) || fetchedBranches[0];
        setActiveBranchState(active);
        localStorage.setItem('activeBranch', JSON.stringify(active));
      } else {
        setActiveBranchState(null);
        localStorage.removeItem('activeBranch');
      }

      await fetchSettings();

      return fetchedBranches;
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to load organization';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
      setIsSwitching(false);
    }
  };

  // Set Active Branch
  const setActiveBranch = async (branch) => {
    if (!branch) {
      setActiveBranchState(null);
      localStorage.removeItem('activeBranch');
      return;
    }
    
    const hasAccess = branches.some(b => b.id === branch.id);
    if (!hasAccess) {
      console.warn('User does not have access to branch:', branch.id);
      return;
    }
    
    const pendingResult = await clearOfflineData(false);
    if (pendingResult.hasPendingSales) {
      const confirmSwitch = window.confirm(
        `${pendingResult.message}\n\nAre you sure you want to switch branches? All unsynced sales for the current branch will be lost.`
      );
      if (!confirmSwitch) {
        return;
      }
      await clearOfflineData(true);
    }
    
    setActiveBranchState(branch);
    localStorage.setItem('activeBranch', JSON.stringify(branch));
  };

  // Load Branches
  const loadBranches = async (orgId) => {
    try {
      const response = await axios.get(`/organizations/${orgId}/branches/my`);
      const fetchedBranches = response.data.branches || [];
      setBranches(fetchedBranches);
      localStorage.setItem('branches', JSON.stringify(fetchedBranches));
      return fetchedBranches;
    } catch (err) {
      console.error('Failed to load branches:', err);
      throw err;
    }
  };

  // Clear error
  const clearError = () => setError(null);

  const isAuthenticated = !!user && !!accessToken;

  const value = {
    user,
    accessToken,
    refreshToken,
    organizations,
    branches,
    settings,
    activeOrganization,
    activeBranch,
    isLoading,
    isSwitching,
    error,
    login,
    logout,
    setActiveOrganization,
    setActiveBranch,
    setBranches,
    loadBranches,
    fetchSettings,
    clearError,
    clearOfflineData,
    checkPendingSales,
    isAuthenticated,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}