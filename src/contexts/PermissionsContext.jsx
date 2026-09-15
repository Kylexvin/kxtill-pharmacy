// src/contexts/PermissionsContext.jsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import { expandPermissions } from '../constants/permissions';

const PermissionsContext = createContext(null);

// ============================================================
// PERMISSION MATCHING
// ============================================================
function patternMatches(pattern, key) {
  if (!pattern || !key) return false;
  if (pattern === '*') return true;

  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -1);
    return key.startsWith(prefix);
  }

  return pattern === key;
}

function grantMatches(permissions, key) {
  if (!key || !Array.isArray(permissions)) return false;
  return permissions.some((p) => patternMatches(p, key));
}

// ============================================================
// LOCAL CACHE (per organization)
// ============================================================
const cacheKey = (orgId) => `permissions:${orgId}`;

function readCache(orgId) {
  if (!orgId) return null;
  try {
    const raw = localStorage.getItem(cacheKey(orgId));
    if (!raw || raw === 'undefined' || raw === 'null') return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.permissions)) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeCache(orgId, data) {
  if (!orgId) return;
  try {
    localStorage.setItem(cacheKey(orgId), JSON.stringify(data));
  } catch {
    // ignore
  }
}

function clearCache(orgId) {
  if (!orgId) return;
  try {
    localStorage.removeItem(cacheKey(orgId));
  } catch {
    // ignore
  }
}

// ============================================================
// PROVIDER
// ============================================================
export function PermissionsProvider({ children }) {
  const { activeOrganization, accessToken } = useAuth();
  const orgId = activeOrganization?.id || null;

  const initialCached = useMemo(() => readCache(orgId), [orgId]);

  const [permissions, setPermissions] = useState(
    initialCached?.permissions || []
  );
  const [hasAllBranches, setHasAllBranches] = useState(
    initialCached?.hasAllBranches || false
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchControllerRef = useRef(null);
  const isMountedRef = useRef(true);

  // -------- fetch --------
  const fetchPermissions = useCallback(async () => {
    if (!orgId || !accessToken) {
      setPermissions([]);
      setHasAllBranches(false);
      setError(null);
      return;
    }

    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const response = await axios.get('/auth/me/dashboard', {
        params: { organizationId: orgId },
        signal: controller.signal,
        timeout: 10000,
      });

      if (controller.signal.aborted || !isMountedRef.current) return;

      const raw = Array.isArray(response.data?.permissions)
        ? response.data.permissions
        : [];
      const membershipHasAll = response.data?.membership?.hasAllBranches || false;

      const next = expandPermissions(raw);

      setPermissions(next);
      setHasAllBranches(membershipHasAll);
      writeCache(orgId, {
        permissions: next,
        hasAllBranches: membershipHasAll,
        fetchedAt: Date.now(),
      });
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;

      const cached = readCache(orgId);
      if (cached) {
        setPermissions(cached.permissions || []);
        setHasAllBranches(cached.hasAllBranches || false);
      } else {
        setPermissions([]);
        setHasAllBranches(false);
      }

      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          'Failed to load permissions'
      );
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [orgId, accessToken]);

  // -------- lifecycle --------
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      fetchControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!orgId || !accessToken) {
      setPermissions([]);
      setHasAllBranches(false);
      setError(null);
      return;
    }

    const cached = readCache(orgId);
    if (cached) {
      setPermissions(cached.permissions || []);
      setHasAllBranches(cached.hasAllBranches || false);
    }

    fetchPermissions();
  }, [orgId, accessToken, fetchPermissions]);

  // -------- manual refresh --------
  const refresh = useCallback(async () => {
    if (!orgId) return;
    clearCache(orgId);
    await fetchPermissions();
  }, [orgId, fetchPermissions]);

  // -------- derived --------
  const isOwner = useMemo(() => permissions.includes('*'), [permissions]);

  const hasPermission = useCallback(
    (key) => grantMatches(permissions, key),
    [permissions]
  );

  const hasAnyPermission = useCallback(
    (keys) =>
      Array.isArray(keys) && keys.some((k) => grantMatches(permissions, k)),
    [permissions]
  );

  const hasAllPermissions = useCallback(
    (keys) =>
      Array.isArray(keys) && keys.every((k) => grantMatches(permissions, k)),
    [permissions]
  );

  const value = useMemo(
    () => ({
      permissions,
      hasAllBranches,
      isOwner,
      loading,
      error,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      can: hasPermission,
      canAny: hasAnyPermission,
      canAll: hasAllPermissions,
      refresh,
    }),
    [
      permissions,
      hasAllBranches,
      isOwner,
      loading,
      error,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      refresh,
    ]
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return ctx;
}

export default PermissionsContext;