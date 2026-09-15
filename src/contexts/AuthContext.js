// src/contexts/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';

export const AuthContext = createContext(null);

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

// Purge per-org caches (permissions, sync flags) on logout / session failure.
// Call this ONLY from real "logged out" moments — never from branch/org switches.
function purgeSessionCaches() {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (
        key.startsWith('initialSyncDone:') ||
        key.startsWith('permissions:')
      ) {
        localStorage.removeItem(key);
      }
    });
  } catch {
    // ignore — private mode, quota
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
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState(null);
  const [isOffline, setIsOffline] = useState(false);
  const authInitialized = useRef(false);

  // Set axios header when token changes
  useEffect(() => {
    if (accessToken) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [accessToken]);

  // Check pending sales from SQLite
  const checkPendingSales = useCallback(async () => {
    try {
      const { getPendingSales } = await import('../db/sqlite');
      const pending = await getPendingSales();
      return pending;
    } catch (err) {
      console.error('Failed to check pending sales:', err);
      return [];
    }
  }, []);

  // Check pending sales AND unsaved cart items, then fully reset the offline db.
  // Note: this does NOT purge permissions — that's a separate concern handled on logout.
  const clearOfflineData = useCallback(async (force = false) => {
    try {
      const { getActiveCart, resetDb } = await import('../db/sqlite');

      const pending = await checkPendingSales();
      const currentBranchId = activeBranch?.id;
      const pendingForCurrentBranch = pending.filter(s => s.branchId === currentBranchId);

      let hasCartItems = false;
      if (currentBranchId) {
        const cart = await getActiveCart(currentBranchId);
        try {
          hasCartItems = !!cart && JSON.parse(cart.items || '[]').length > 0;
        } catch {
          hasCartItems = false;
        }
      }

      if (!force && (pendingForCurrentBranch.length > 0 || hasCartItems)) {
        const message = pendingForCurrentBranch.length > 0
          ? `You have ${pendingForCurrentBranch.length} pending sale(s) that haven't been synced. Switching will clear them.`
          : `You have items in your cart. Switching will clear them.`;

        return {
          hasPendingSales: true,
          pendingCount: pendingForCurrentBranch.length,
          message,
        };
      }

      await resetDb();

      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('initialSyncDone:')) {
          localStorage.removeItem(key);
        }
      });

      return { hasPendingSales: false };
    } catch (err) {
      console.error('Failed to clear offline data:', err);
      try {
        const { resetDb } = await import('../db/sqlite');
        await resetDb();
      } catch (resetErr) {
        console.error('Failed to reset db after clearOfflineData error:', resetErr);
      }
      return { hasPendingSales: false };
    }
  }, [activeBranch, checkPendingSales]);

  // Load Branches
  const loadBranches = useCallback(async (orgId) => {
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
  }, []);

  // Set Active Organization
  const setActiveOrganization = useCallback(async (orgId, isLogin = false) => {
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

      return fetchedBranches;
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to load organization';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
      setIsSwitching(false);
    }
  }, [organizations, clearOfflineData]);

  // Set Active Branch
  const setActiveBranch = useCallback(async (branch) => {
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
  }, [branches, clearOfflineData]);

  // Login
  const login = useCallback(async (email, password) => {
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

      axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

      if (organizations && organizations.length === 1) {
        await setActiveOrganization(organizations[0].id, true);
      }

      setIsOffline(false);
      return { hasOrganizations: organizations && organizations.length > 0 };
    } catch (err) {
      const message = err.response?.data?.error || err.response?.data?.message || 'Login failed';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, [setActiveOrganization]);

  // Logout handler
  const handleLogout = useCallback(async () => {
    try {
      if (refreshToken) {
        await axios.post('/auth/logout', { refreshToken });
      }
    } catch (err) {
      // Ignore errors on logout
    } finally {
      setUser(null);
      setAccessToken(null);
      setRefreshToken(null);
      setOrganizations([]);
      setBranches([]);
      setActiveOrganizationState(null);
      setActiveBranchState(null);
      setError(null);
      setIsOffline(false);

      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('organizations');
      localStorage.removeItem('branches');
      localStorage.removeItem('activeOrganization');
      localStorage.removeItem('activeBranch');

      try {
        const { resetDb } = await import('../db/sqlite');
        await resetDb();
      } catch (err) {
        console.error('Failed to reset db on logout:', err);
        localStorage.removeItem('kxtill_db');
      }

      // Purge per-org caches (permissions + sync flags) — real logout only
      purgeSessionCaches();

      delete axios.defaults.headers.common['Authorization'];
    }
  }, [refreshToken]);

  // ============================================================
  // SET AUTH DATA (for OAuth callback)
  // ============================================================

  const setAuthData = useCallback((user, accessToken, refreshToken, organizations) => {
    setUser(user);
    setAccessToken(accessToken);
    setRefreshToken(refreshToken);
    setOrganizations(organizations || []);

    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('organizations', JSON.stringify(organizations || []));

    axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    setIsOffline(false);
  }, []);

  //##### Refresh the current user's profile from the server.
  //##### Used after profile updates on the Account page.
  const refreshUser = useCallback(async () => {
    try {
      const response = await axios.get('/auth/me');
      const freshUser = response.data;
      setUser(freshUser);
      localStorage.setItem('user', JSON.stringify(freshUser));
      return freshUser;
    } catch (err) {
      console.error('Failed to refresh user:', err);
      throw err;
    }
  }, []);

  //##### Log out of all devices (server-side session revocation), then
  //##### clear local state via handleLogout.
  const logoutAllDevices = useCallback(async () => {
    try {
      await axios.post('/auth/logout-all');
    } catch (err) {
      // Ignore — local state should be cleared regardless
    } finally {
      await handleLogout();
    }
  }, [handleLogout]);

  // Validate session with proper network error handling
  useEffect(() => {
    if (authInitialized.current) return;
    authInitialized.current = true;

    const validateSession = async () => {
      const token = localStorage.getItem('accessToken');
      const refresh = localStorage.getItem('refreshToken');

      if (!token || !refresh) {
        return;
      }

      try {
        await axios.get('/auth/me', { timeout: 5000 });
        setIsOffline(false);
      } catch (error) {
        // No response at all = network/offline issue, not an auth problem.
        // Don't touch the session — just retry silently later.
        if (!error.response) {
          console.warn('Session check failed — offline, keeping session as-is');
          setIsOffline(true);
          return;
        }

        // Got a response, so the server is reachable and said the token
        // is invalid/expired (401/403) — this is a real auth failure,
        // safe to attempt refresh.
        if (error.response?.status === 401 || error.response?.status === 403) {
          try {
            const response = await axios.post('/auth/refresh', { refreshToken: refresh });
            const { accessToken: newToken } = response.data;
            localStorage.setItem('accessToken', newToken);
            setAccessToken(newToken);
            axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
            setIsOffline(false);
          } catch (refreshError) {
            // Same distinction on the refresh call itself
            if (!refreshError.response) {
              console.warn('Token refresh failed — offline, keeping session as-is');
              setIsOffline(true);
              return;
            }
            // Refresh endpoint reachable and explicitly rejected the refresh
            // token — this is a genuine expired/invalid session
            handleLogout();
          }
        } else {
          // Other HTTP errors (500, etc.) - don't logout
          console.warn('Session validation error:', error.message);
          setIsOffline(true);
        }
      }
    };

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

    if (storedToken) {
      validateSession();
    }
  }, [handleLogout]);

  // Clear error
  const clearError = useCallback(() => setError(null), []);

  const isAuthenticated = !!user && !!accessToken;

  const value = useMemo(() => ({
    user,
    accessToken,
    refreshToken,
    organizations,
    branches,
    activeOrganization,
    activeBranch,
    isLoading,
    isSwitching,
    error,
    //##### new
    refreshUser,
    //##### new
    logoutAllDevices,
    isOffline,
    setIsOffline,
    login,
    logout: handleLogout,
    setActiveOrganization,
    setActiveBranch,
    setBranches,
    loadBranches,
    clearError,
    clearOfflineData,
    checkPendingSales,
    isAuthenticated,
    setAuthData,
  }), [
    user, accessToken, refreshToken, organizations, branches,
    activeOrganization, activeBranch, isLoading, isSwitching, error, isOffline,
    //##### new
    refreshUser,
    //##### new
    logoutAllDevices,
    login, handleLogout, setActiveOrganization, setActiveBranch,
    loadBranches, clearError, clearOfflineData,
    checkPendingSales, isAuthenticated, setAuthData,
  ]);

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