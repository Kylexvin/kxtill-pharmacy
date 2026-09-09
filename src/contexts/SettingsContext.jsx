// src/contexts/SettingsContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

// Default settings fallback
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

// Currency symbols for proper display
const CURRENCY_SYMBOLS = {
  'UGX': 'USh',
  'KES': 'KSh',
  'TZS': 'TSh',
  'RWF': 'FRw',
  'NGN': '₦',
  'ZAR': 'R',
  'USD': '$',
  'EUR': '€',
  'GBP': '£',
  'GHS': 'GH₵',
  'MZN': 'MT',
  'ZMW': 'ZK',
  'BWP': 'P',
  'MWK': 'MK',
  'SZL': 'E',
  'LSL': 'L',
  'NAD': 'N$',
};

const SettingsContext = createContext(null);

export const SettingsProvider = ({ children }) => {
  const { activeOrganization, isOffline } = useAuth();
  
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  // Helper to get cached settings
  const getCachedSettings = useCallback(() => {
    try {
      const cached = localStorage.getItem('app_settings');
      if (cached) {
        const parsed = JSON.parse(cached);
        // Check if cache is still valid (e.g., not older than 5 minutes)
        if (parsed.timestamp && Date.now() - parsed.timestamp < 300000) {
          return parsed.data;
        }
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // Save settings to cache
  const cacheSettings = useCallback((data) => {
    try {
      localStorage.setItem('app_settings', JSON.stringify({
        data,
        timestamp: Date.now(),
      }));
    } catch (err) {
      console.warn('Failed to cache settings:', err);
    }
  }, []);

  // Fetch settings from API
  const fetchSettings = useCallback(async (force = false) => {
    if (!activeOrganization?.id) {
      setSettings(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }

    // Check cache first
    if (!force) {
      const cached = getCachedSettings();
      if (cached) {
        setSettings(cached);
        return cached;
      }
    }

    if (isOffline) {
      // If offline, return cached or default
      const cached = getCachedSettings();
      if (cached) {
        setSettings(cached);
        return cached;
      }
      setSettings(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(
        `/organizations/${activeOrganization.id}/kxtill/settings`
      );
      
      const fetchedSettings = response.data.settings || response.data || {};
      
      // Merge with defaults to ensure all fields exist
      const mergedSettings = {
        ...DEFAULT_SETTINGS,
        ...fetchedSettings,
      };

      setSettings(mergedSettings);
      cacheSettings(mergedSettings);
      setLastFetched(new Date().toISOString());
      setIsDirty(false);
      
      return mergedSettings;
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      setError(err.message || 'Failed to load settings');
      
      // Fallback to cached or default
      const cached = getCachedSettings();
      if (cached) {
        setSettings(cached);
        return cached;
      }
      setSettings(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    } finally {
      setLoading(false);
    }
  }, [activeOrganization, isOffline, getCachedSettings, cacheSettings]);

  // Update settings (save to API)
  const updateSettings = useCallback(async (newSettings) => {
    if (!activeOrganization?.id) {
      throw new Error('No active organization');
    }

    setLoading(true);
    setError(null);

    try {
      const response = await axios.put(
        `/organizations/${activeOrganization.id}/kxtill/settings`,
        newSettings
      );

      const updatedSettings = response.data.settings || response.data || newSettings;
      const mergedSettings = {
        ...DEFAULT_SETTINGS,
        ...updatedSettings,
      };

      setSettings(mergedSettings);
      cacheSettings(mergedSettings);
      setIsDirty(false);
      setLastFetched(new Date().toISOString());

      return mergedSettings;
    } catch (err) {
      console.error('Failed to update settings:', err);
      setError(err.message || 'Failed to update settings');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [activeOrganization, cacheSettings]);

  // Reset settings to default
  const resetSettings = useCallback(async () => {
    setSettings(DEFAULT_SETTINGS);
    setIsDirty(true);
    try {
      localStorage.removeItem('app_settings');
    } catch {
      // Ignore
    }
    return DEFAULT_SETTINGS;
  }, []);

  // Refresh settings
  const refreshSettings = useCallback(async () => {
    return await fetchSettings(true);
  }, [fetchSettings]);

  // Auto-fetch on organization change
  useEffect(() => {
    if (activeOrganization?.id) {
      fetchSettings();
    }
  }, [activeOrganization?.id, fetchSettings]);

  // Helper functions for common settings
  const getCurrency = useCallback(() => settings.currency || 'KES', [settings]);
  const getDecimalPlaces = useCallback(() => settings.decimalPlaces || 2, [settings]);
  const getShopName = useCallback(() => settings.shopName || 'My Shop', [settings]);
  const getTaxNumber = useCallback(() => settings.taxNumber || '', [settings]);
  const getReceiptHeader = useCallback(() => settings.receiptHeader || 'Thank you for shopping with us!', [settings]);
  const getReceiptFooter = useCallback(() => settings.receiptFooter || 'Thank you for shopping with us!', [settings]);
  const getDefaultPaymentMethod = useCallback(() => settings.defaultPaymentMethod || 'CASH', [settings]);

  // Format currency helper with proper symbol support
  const formatCurrency = useCallback((amount) => {
    const currency = settings.currency || 'KES';
    const decimals = settings.decimalPlaces ?? 2;
    const amountNum = Number(amount || 0);
    
    try {
      // Try using Intl.NumberFormat first (works for most currencies)
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(amountNum);
    } catch {
      // Fallback for unsupported currencies (like UGX)
      const symbol = CURRENCY_SYMBOLS[currency] || currency;
      const formatted = amountNum.toFixed(decimals);
      const parts = formatted.split('.');
      const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      const decimalPart = parts[1] || '00';
      return `${symbol} ${integerPart}.${decimalPart}`;
    }
  }, [settings]);

  // Format compact currency (K, M)
  const formatCompactCurrency = useCallback((amount) => {
    const amountNum = Number(amount || 0);
    if (amountNum >= 1000000) return `${(amountNum / 1000000).toFixed(1)}M`;
    if (amountNum >= 1000) return `${(amountNum / 1000).toFixed(1)}K`;
    return formatCurrency(amountNum);
  }, [formatCurrency]);

  // Format date helper with timezone support
  const formatDate = useCallback((date, options = {}) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';

    const dateFormat = options.format || 'DD/MM/YYYY';

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear());
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    const replacements = {
      DD: day,
      MM: month,
      YYYY: year,
      YY: year.slice(-2),
      HH: hours,
      mm: minutes,
    };

    let result = dateFormat;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(key, value);
    }
    return result;
  }, []);

  // Format time helper
  const formatTime = useCallback((date, options = {}) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';
    
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    return `${hours}:${minutes}`;
  }, []);

  // Format date and time together
  const formatDateTime = useCallback((date, options = {}) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';
    
    const dateStr = formatDate(d, options);
    const timeStr = formatTime(d, options);
    
    return `${dateStr} ${timeStr}`;
  }, [formatDate, formatTime]);

  // Check if a feature is enabled
  const isFeatureEnabled = useCallback((feature) => {
    switch(feature) {
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
  }, [settings]);

  const value = useMemo(() => ({
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
  }), [
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
  ]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export default SettingsContext;