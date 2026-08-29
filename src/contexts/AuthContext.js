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
  const [activeOrganization, setActiveOrganizationState] = useState(() => 
    safeLocalStorageGet('activeOrganization', null)
  );
  const [activeBranch, setActiveBranchState] = useState(() => 
    safeLocalStorageGet('activeBranch', null)
  );
  const [isLoading, setIsLoading] = useState(false);
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
    if (storedActive) {
      try { setActiveOrganizationState(JSON.parse(storedActive)); } catch {}
    }
    if (storedActiveBranch) {
      try { setActiveBranchState(JSON.parse(storedActiveBranch)); } catch {}
    }
  }, []);

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

      // Auto-select if only one organization
      if (organizations && organizations.length === 1) {
        await setActiveOrganization(organizations[0].id);
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
  const logout = () => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    setOrganizations([]);
    setBranches([]);
    setActiveOrganizationState(null);
    setActiveBranchState(null);
    setError(null);
    
    localStorage.removeItem('user');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('organizations');
    localStorage.removeItem('branches');
    localStorage.removeItem('activeOrganization');
    localStorage.removeItem('activeBranch');
  };

  // Set Active Organization
  const setActiveOrganization = async (orgId) => {
    setIsLoading(true);
    setError(null);
    try {
      const org = organizations.find(o => o.id === orgId);
      if (!org) {
        throw new Error('Organization not found');
      }

      setActiveOrganizationState(org);
      localStorage.setItem('activeOrganization', JSON.stringify(org));

      // Load branches for this organization
      const response = await axios.get(`/organizations/${orgId}/branches/my`);
      const fetchedBranches = response.data.branches || [];
      
      setBranches(fetchedBranches);
      localStorage.setItem('branches', JSON.stringify(fetchedBranches));

      // Auto-select first active branch
      if (fetchedBranches.length > 0) {
        const active = fetchedBranches.find(b => b.isActive !== false) || fetchedBranches[0];
        setActiveBranchState(active);
        localStorage.setItem('activeBranch', JSON.stringify(active));
      } else {
        setActiveBranchState(null);
        localStorage.removeItem('activeBranch');
      }

      return fetchedBranches;
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to load organization';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Set Active Branch
  const setActiveBranch = (branch) => {
    setActiveBranchState(branch);
    if (branch) {
      localStorage.setItem('activeBranch', JSON.stringify(branch));
    } else {
      localStorage.removeItem('activeBranch');
    }
  };

  // Load Branches - can be called from anywhere
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
    activeOrganization,
    activeBranch,
    isLoading,
    error,
    login,
    logout,
    setActiveOrganization,
    setActiveBranch,
    setBranches,
    loadBranches,
    clearError,
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