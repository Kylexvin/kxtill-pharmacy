// src/contexts/SettingsContext.jsx
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

// ============================================================
// DEFAULTS
// ============================================================
const DEFAULT_SETTINGS = {
  shopName: 'My Shop',
  shopPhone: '',
  shopAddress: '',
  shopEmail: '',
  taxNumber: '',
  receiptHeader: 'Thank you for shopping with us!',
  receiptFooter: 'Thank you for shopping with us!',
  showTax: true,
  showCustomer: true,
  showCashier: true,
  currency: 'KES',
  timezone: 'Africa/Nairobi',
  decimalPlaces: 2,
  defaultPaymentMethod: 'CASH',
  lowStockAlerts: true,
  dailySalesReport: false,
  weeklySummary: true,
  refundNotifications: true,
  sessionTimeout: 30,
  requirePinForRefund: true,
  auditLogRetention: 90,
  allowBranchSwitch: true,
};

// Currency symbols for fallback rendering (unsupported Intl currencies)
const CURRENCY_SYMBOLS = {
  UGX: 'USh',
  KES: 'KSh',
  TZS: 'TSh',
  RWF: 'FRw',
  NGN: '₦',
  ZAR: 'R',
  USD: '$',
  EUR: '€',
  GBP: '£',
  GHS: 'GH₵',
  MZN: 'MT',
  ZMW: 'ZK',
  BWP: 'P',
  MWK: 'MK',
  SZL: 'E',
  LSL: 'L',
  NAD: 'N$',
};

const CACHE_KEY = 'app_settings';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const SettingsContext = createContext(null);

// ============================================================
// PROVIDER
// ============================================================
export const SettingsProvider = ({ children }) => {
  const { activeOrganization, isOffline } = useAuth();

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  // Refs for race-condition safety
  const isMountedRef = useRef(true);
  const fetchControllerRef = useRef(null);

  // ----------------------------------------------------------
  // CACHE HELPERS (per-org scoped, so switching orgs doesn't leak)
  // ----------------------------------------------------------
  const cacheKeyFor = useCallback(
    (orgId) => (orgId ? `${CACHE_KEY}:${orgId}` : CACHE_KEY),
    []
  );

  const getCachedSettings = useCallback(
    (orgId) => {
      try {
        const key = cacheKeyFor(orgId);
        const cached = localStorage.getItem(key);
        if (!cached) return null;

        const parsed = JSON.parse(cached);
        if (
          parsed?.timestamp &&
          Date.now() - parsed.timestamp < CACHE_TTL_MS &&
          parsed?.data
        ) {
          return parsed.data;
        }
        return null;
      } catch {
        return null;
      }
    },
    [cacheKeyFor]
  );

  const cacheSettings = useCallback(
    (orgId, data) => {
      if (!orgId || !data) return;
      try {
        localStorage.setItem(
          cacheKeyFor(orgId),
          JSON.stringify({ data, timestamp: Date.now() })
        );
      } catch (err) {
        console.warn('Failed to cache settings:', err);
      }
    },
    [cacheKeyFor]
  );

  // ----------------------------------------------------------
  // FETCH
  // ----------------------------------------------------------
  const fetchSettings = useCallback(
    async (force = false) => {
      if (!activeOrganization?.id) {
        setSettings(DEFAULT_SETTINGS);
        return DEFAULT_SETTINGS;
      }

      const orgId = activeOrganization.id;

      // Cache-first
      if (!force) {
        const cached = getCachedSettings(orgId);
        if (cached) {
          setSettings(cached);
          return cached;
        }
      }

      // Offline: return cache or defaults
      if (isOffline) {
        const cached = getCachedSettings(orgId);
        const fallback = cached || DEFAULT_SETTINGS;
        setSettings(fallback);
        return fallback;
      }

      // Abort any in-flight fetch
      fetchControllerRef.current?.abort();
      const controller = new AbortController();
      fetchControllerRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const response = await axios.get(
          `/organizations/${orgId}/kxtill/settings`,
          { signal: controller.signal, timeout: 10000 }
        );

        if (controller.signal.aborted || !isMountedRef.current) {
          return settings;
        }

        const fetched = response.data?.settings ?? response.data ?? {};
        const merged = { ...DEFAULT_SETTINGS, ...fetched };

        setSettings(merged);
        cacheSettings(orgId, merged);
        setLastFetched(new Date().toISOString());
        setIsDirty(false);

        return merged;
      } catch (err) {
        if (err.name === 'CanceledError' || err.name === 'AbortError') {
          return settings;
        }

        console.error('Failed to fetch settings:', err);
        if (isMountedRef.current) {
          setError(
            err.response?.data?.error ||
              err.response?.data?.message ||
              err.message ||
              'Failed to load settings'
          );
        }

        const cached = getCachedSettings(orgId);
        const fallback = cached || DEFAULT_SETTINGS;
        setSettings(fallback);
        return fallback;
      } finally {
        if (isMountedRef.current && !controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [
      activeOrganization?.id,
      isOffline,
      getCachedSettings,
      cacheSettings,
      settings,
    ]
  );

  // ----------------------------------------------------------
  // UPDATE (PATCH — fixed from PUT)
  // ----------------------------------------------------------
  const updateSettings = useCallback(
    async (partial) => {
      if (!activeOrganization?.id) {
        throw new Error('No active organization');
      }

      const orgId = activeOrganization.id;

      // Optimistic: apply immediately, rollback on failure
      const previous = settings;
      const optimistic = { ...settings, ...partial };
      setSettings(optimistic);
      setIsDirty(true);
      setLoading(true);
      setError(null);

      try {
        const response = await axios.patch(
          `/organizations/${orgId}/kxtill/settings`,
          partial,
          { timeout: 15000 }
        );

        const updated = response.data?.settings ?? response.data ?? partial;
        const merged = { ...DEFAULT_SETTINGS, ...optimistic, ...updated };

        if (!isMountedRef.current) return merged;

        setSettings(merged);
        cacheSettings(orgId, merged);
        setIsDirty(false);
        setLastFetched(new Date().toISOString());

        return merged;
      } catch (err) {
        // Rollback on failure
        if (isMountedRef.current) {
          setSettings(previous);
          setError(
            err.response?.data?.error ||
              err.response?.data?.message ||
              err.message ||
              'Failed to update settings'
          );
        }
        throw err;
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    },
    [activeOrganization?.id, settings, cacheSettings]
  );

  // ----------------------------------------------------------
  // RESET (local only — caller must still save to persist)
  // ----------------------------------------------------------
  const resetSettings = useCallback(async () => {
    setSettings(DEFAULT_SETTINGS);
    setIsDirty(true);
    return DEFAULT_SETTINGS;
  }, []);

  // ----------------------------------------------------------
  // REFRESH (force fetch)
  // ----------------------------------------------------------
  const refreshSettings = useCallback(
    () => fetchSettings(true),
    [fetchSettings]
  );

  // ----------------------------------------------------------
  // LIFECYCLE
  // ----------------------------------------------------------
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      fetchControllerRef.current?.abort();
    };
  }, []);

  // Auto-fetch on org change (and on offline → online transition)
  useEffect(() => {
    if (activeOrganization?.id) {
      fetchSettings();
    } else {
      setSettings(DEFAULT_SETTINGS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrganization?.id, isOffline]);

  // ----------------------------------------------------------
  // DERIVED GETTERS
  // ----------------------------------------------------------
  const getCurrency = useCallback(
    () => settings.currency || 'KES',
    [settings.currency]
  );
  const getDecimalPlaces = useCallback(
    () => settings.decimalPlaces ?? 2,
    [settings.decimalPlaces]
  );
  const getShopName = useCallback(
    () => settings.shopName || 'My Shop',
    [settings.shopName]
  );
  const getTaxNumber = useCallback(
    () => settings.taxNumber || '',
    [settings.taxNumber]
  );
  const getReceiptHeader = useCallback(
    () => settings.receiptHeader || DEFAULT_SETTINGS.receiptHeader,
    [settings.receiptHeader]
  );
  const getReceiptFooter = useCallback(
    () => settings.receiptFooter || DEFAULT_SETTINGS.receiptFooter,
    [settings.receiptFooter]
  );
  const getDefaultPaymentMethod = useCallback(
    () => settings.defaultPaymentMethod || 'CASH',
    [settings.defaultPaymentMethod]
  );

  // ----------------------------------------------------------
  // FORMATTERS
  // ----------------------------------------------------------
  const formatCurrency = useCallback(
    (amount) => {
      const currency = settings.currency || 'KES';
      const decimals = settings.decimalPlaces ?? 2;
      const n = Number(amount || 0);

      try {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency,
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(n);
      } catch {
        // Fallback for currencies Intl doesn't know (e.g. UGX historically)
        const symbol = CURRENCY_SYMBOLS[currency] || currency;
        const fixed = n.toFixed(decimals);
        const [intPart, decPart = ''] = fixed.split('.');
        const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return `${symbol} ${withCommas}${
          decimals > 0 ? '.' + decPart.padEnd(decimals, '0') : ''
        }`;
      }
    },
    [settings.currency, settings.decimalPlaces]
  );

  const formatCompactCurrency = useCallback(
    (amount) => {
      const n = Number(amount || 0);
      if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
      return formatCurrency(n);
    },
    [formatCurrency]
  );

  const formatDate = useCallback((date, options = {}) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';

    const pattern = options.format || 'DD/MM/YYYY';

    const replacements = {
      DD: String(d.getDate()).padStart(2, '0'),
      MM: String(d.getMonth() + 1).padStart(2, '0'),
      YYYY: String(d.getFullYear()),
      YY: String(d.getFullYear()).slice(-2),
      HH: String(d.getHours()).padStart(2, '0'),
      mm: String(d.getMinutes()).padStart(2, '0'),
    };

    let result = pattern;
    for (const [k, v] of Object.entries(replacements)) {
      result = result.replace(new RegExp(k, 'g'), v);
    }
    return result;
  }, []);

  const formatTime = useCallback((date) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';
    return `${String(d.getHours()).padStart(2, '0')}:${String(
      d.getMinutes()
    ).padStart(2, '0')}`;
  }, []);

  const formatDateTime = useCallback(
    (date, options = {}) => {
      if (!date) return 'N/A';
      const d = new Date(date);
      if (isNaN(d.getTime())) return 'N/A';
      return `${formatDate(d, options)} ${formatTime(d)}`;
    },
    [formatDate, formatTime]
  );

  // ----------------------------------------------------------
  // FEATURE FLAGS
  // ----------------------------------------------------------
  const isFeatureEnabled = useCallback(
    (feature) => {
      switch (feature) {
        case 'lowStockAlerts':
          return settings.lowStockAlerts !== false;
        case 'dailySalesReport':
          return settings.dailySalesReport === true;
        case 'weeklySummary':
          return settings.weeklySummary !== false;
        case 'refundNotifications':
          return settings.refundNotifications !== false;
        case 'requirePinForRefund':
          return settings.requirePinForRefund !== false;
        case 'allowBranchSwitch':
          return settings.allowBranchSwitch !== false;
        default:
          return true;
      }
    },
    [settings]
  );

  // ----------------------------------------------------------
  // CONTEXT VALUE
  // ----------------------------------------------------------
  const value = useMemo(
    () => ({
      settings,
      loading,
      error,
      lastFetched,
      isDirty,
      fetchSettings,
      updateSettings,
      resetSettings,
      refreshSettings,
      getCurrency,
      getDecimalPlaces,
      getShopName,
      getTaxNumber,
      getReceiptHeader,
      getReceiptFooter,
      getDefaultPaymentMethod,
      formatCurrency,
      formatCompactCurrency,
      formatDate,
      formatTime,
      formatDateTime,
      isFeatureEnabled,
    }),
    [
      settings,
      loading,
      error,
      lastFetched,
      isDirty,
      fetchSettings,
      updateSettings,
      resetSettings,
      refreshSettings,
      getCurrency,
      getDecimalPlaces,
      getShopName,
      getTaxNumber,
      getReceiptHeader,
      getReceiptFooter,
      getDefaultPaymentMethod,
      formatCurrency,
      formatCompactCurrency,
      formatDate,
      formatTime,
      formatDateTime,
      isFeatureEnabled,
    ]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

// ============================================================
// HOOK
// ============================================================
export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export default SettingsContext;