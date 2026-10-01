// src/constants/permissions.js
//
// SINGLE SOURCE OF TRUTH for permission keys used across KxTill.
// Mirrors the backend `permissions` table. Do NOT invent keys —
// if a new permission is needed, add it to the DB first, then here.
//
// Sourced from GET /api/v1/permissions
// ============================================================

// ---------------------------------------------------------------------------
// KxTill (product-scoped)
// ---------------------------------------------------------------------------
export const KXTILL = {
  SALES: {
    CREATE: 'kxtill.sales.create',
    VIEW:   'kxtill.sales.view',
    REFUND: 'kxtill.sales.refund',
    DELETE: 'kxtill.sales.delete', 
  },
  SHIFT: {
    FORCE_CLOSE:      'kxtill.shift.force_close',
    RESOLVE_HANDOVER: 'kxtill.shift.resolve_handover',
    RESOLVE_VARIANCE: 'kxtill.shift.resolve_variance',
    SETTINGS:         'kxtill.shift.settings',
  },
  INVENTORY: {
    VIEW:   'kxtill.inventory.view',
    CREATE: 'kxtill.inventory.create',
    UPDATE: 'kxtill.inventory.update',
    DELETE: 'kxtill.inventory.delete',
    GLOBAL_VIEW: 'kxtill.inventory.global.view',
    TRANSFERS: {
      CREATE:   'kxtill.inventory.transfers.create',
      APPROVE:  'kxtill.inventory.transfers.approve',
      COMPLETE: 'kxtill.inventory.transfers.complete',
    },
  },
  REPORTS: {
    VIEW:   'kxtill.reports.view',
    EXPORT: 'kxtill.reports.export',
  },
  SETTINGS: {
    VIEW:   'kxtill.settings.view',
    UPDATE: 'kxtill.settings.update',
  },
  CUSTOMERS: {
    VIEW:   'kxtill.customers.view',
    CREATE: 'kxtill.customers.create',
    UPDATE: 'kxtill.customers.update',
    DELETE: 'kxtill.customers.delete',
  },
};

// ---------------------------------------------------------------------------
// Platform (org-scoped)
// ---------------------------------------------------------------------------
export const PLATFORM = {
  BRANCHES: {
    VIEW:   'branches.view',
    MANAGE: 'branches.manage',
  },
  MEMBERS: {
    VIEW:   'members.view',
    MANAGE: 'members.manage',
  },
  CUSTOMERS: {
    VIEW:   'customers.view',
    CREATE: 'customers.create',
    UPDATE: 'customers.update',
    DELETE: 'customers.delete',
  },
  AUDIT: {
    VIEW:   'audit.logs.view',
    EXPORT: 'audit.logs.export',
  },
  SUBSCRIPTIONS: {
    VIEW:   'subscriptions.view',
    MANAGE: 'subscriptions.manage',
  },
  SUPPORT: {
    VIEW:   'support.tickets.view',
    CREATE: 'support.tickets.create',
  },
};

export const PERMISSIONS = {
  KXTILL,
  PLATFORM,
};

// ---------------------------------------------------------------------------
// Scope implication: platform > kxtill
// ---------------------------------------------------------------------------
// Per product rule: holding a platform permission implies the corresponding
// kxtill permission, because platform is the "bigger" scope.
//
// Example: user has `customers.view` (platform) →
//          they should also satisfy `kxtill.customers.view`.
//
// The mapping is by leaf name. If a platform permission has no kxtill
// counterpart, the entry is just omitted.
// ---------------------------------------------------------------------------
export const IMPLIED_PERMISSIONS = {
  // platform key              →  kxtill key it satisfies
  'customers.view':   'kxtill.customers.view',
  'customers.create': 'kxtill.customers.create',
  'customers.update': 'kxtill.customers.update',
  'customers.delete': 'kxtill.customers.delete',
  // branches, members, audit, subscriptions, support have no kxtill twin
};

/**
 * Expand a granted permission list to include implied permissions.
 * Use this before matching, so `can('kxtill.customers.view')` works
 * when the user only has `customers.view`.
 *
 * @param {string[]} granted
 * @returns {string[]} expanded list
 */
export function expandPermissions(granted) {
  if (!Array.isArray(granted) || granted.length === 0) return [];
  const expanded = new Set(granted);
  for (const key of granted) {
    const implied = IMPLIED_PERMISSIONS[key];
    if (implied) expanded.add(implied);
  }
  return Array.from(expanded);
}