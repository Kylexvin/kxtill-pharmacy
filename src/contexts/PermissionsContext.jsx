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

const PermissionsContext = createContext(null);

// ============================================================
// PERMISSION MATCHING
// ============================================================
//
// Supported patterns from the backend:
//   "*"                            — full wildcard (owner)
//   "kxtill.*"                     — anything under kxtill
//   "kxtill.inventory.*"           — anything under kxtill.inventory
//   "kxtill.inventory.transfers.*" — anything under transfers
//   "kxtill.inventory.view"        — exact match
//
// If the backend ever returns a grouped permission, the frontend
// already handles it without changes.
// ============================================================

function patternMatches(pattern, key) {
  if (!pattern || !key) return false;
  if (pattern === '*') return true;

  // Prefix wildcard: "kxtill.inventory.*"
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -1); // keep trailing dot
    return key.startsWith(prefix);
  }

  // Exact match
  return pattern === key;
}

function grantMatches(permissions, key) {
  if (!key || !Array.isArray(permissions)) return false;
  return permissions.some((p) => patternMatches(p, key));
}

// ============================================================
// LOCAL CACHE (per organization)
// ============================================================
//
// Prevents the "flash of no permissions" on page reload:
// - On mount, hydrate synchronously from cache.
// - Then refetch in the background to pick up any changes.
//
// Keyed by organizationId because permissions are org-scoped.
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
    // ignore — quota, private mode, etc.
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

  // Hydrate from cache synchronously so first render is instant.
  const initialPermissions = useMemo(() => {
    const cached = readCache(orgId);
    return cached?.permissions || [];
  }, []); // intentionally only once — subsequent org changes handled below

  const [permissions, setPermissions] = useState(initialPermissions);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchControllerRef = useRef(null);
  const isMountedRef = useRef(true);

  // -------- fetch --------
  const fetchPermissions = useCallback(async () => {
    if (!orgId || !accessToken) {
      setPermissions([]);
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

      const next = Array.isArray(response.data?.permissions)
        ? response.data.permissions
        : [];

      setPermissions(next);
      writeCache(orgId, {
        permissions: next,
        fetchedAt: Date.now(),
      });
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;

      // Fall back to cache if we have one; otherwise empty list.
      const cached = readCache(orgId);
      if (cached) {
        setPermissions(cached.permissions || []);
      } else {
        setPermissions([]);
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

  // -------- refetch triggers --------
  // Whenever the active org or auth token changes:
  // 1. Instantly hydrate from cache (no flash).
  // 2. Kick off a background fetch to reconcile.
  // 3. If we've logged out (no token), clear state.
  useEffect(() => {
    if (!orgId || !accessToken) {
      setPermissions([]);
      setError(null);
      return;
    }

    const cached = readCache(orgId);
    if (cached) {
      setPermissions(cached.permissions || []);
    }

    fetchPermissions();
  }, [orgId, accessToken, fetchPermissions]);

  // -------- manual refresh --------
  const refresh = useCallback(async () => {
    if (!orgId) return;
    // Clear cache so the fresh fetch always writes new data.
    clearCache(orgId);
    await fetchPermissions();
  }, [orgId, fetchPermissions]);

  // -------- derived API --------
  const isOwner = useMemo(
    () => permissions.includes('*'),
    [permissions]
  );

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
      isOwner,
      loading,
      error,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      // Short aliases
      can: hasPermission,
      canAny: hasAnyPermission,
      canAll: hasAllPermissions,
      // Manual refresh — for edge cases where you know roles changed
      refresh,
    }),
    [
      permissions,
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

// ============================================================
// HOOK
// ============================================================

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return ctx;
}

export default PermissionsContext;