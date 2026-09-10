// src/components/Common/Toast.jsx
import React from 'react';
import toast, { Toaster as HotToaster } from 'react-hot-toast';

// ============================================================
// TOASTER WRAPPER
// ============================================================
// Mount once in App.jsx:  <Toaster />
//
// All toast behavior lives here:
//   - Duration per variant (success/error/loading)
//   - Colors (theme-aware via CSS variables)
//   - Position, spacing, container offsets
//   - Border, radius, shadow
//
// Call sites stay simple:
//   toast.success('Saved');
//   toast.error('Failed');
//
// Per-toast override (rare):
//   toast.success('Saved', { duration: 600 });
//   toast.error('Failed', { duration: 5000 });
// ============================================================

export const Toaster = (props) => {
  return (
    <HotToaster
      position="top-right"
      gutter={6}
      containerStyle={{
        top: 70,       // below the TopBar
        right: 16,
      }}
      toastOptions={{
        // ---- default for any toast type ----
        duration: 1000,
        style: {
          background: 'var(--bg-raised)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '9px 13px',
          fontSize: '13px',
          fontWeight: 500,
          maxWidth: '340px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
        },

        // ---- success ----
        success: {
          duration: 1000,
          style: {
            background: 'var(--bg-raised)',
            color: 'var(--text-primary)',
            border: '1px solid rgba(52, 199, 89, 0.35)',
            borderLeft: '3px solid #34c759',
          },
          iconTheme: {
            primary: '#34c759',
            secondary: 'var(--bg-raised)',
          },
        },

        // ---- error (still longer — users need to read what went wrong) ----
        error: {
          duration: 2500,
          style: {
            background: 'var(--bg-raised)',
            color: 'var(--text-primary)',
            border: '1px solid rgba(239, 83, 80, 0.35)',
            borderLeft: '3px solid #ef5350',
          },
          iconTheme: {
            primary: '#ef5350',
            secondary: 'var(--bg-raised)',
          },
        },

        // ---- loading (stays until explicitly replaced) ----
        loading: {
          duration: 10000,
          style: {
            background: 'var(--bg-raised)',
            color: 'var(--text-primary)',
            border: '1px solid rgba(255, 106, 43, 0.35)',
            borderLeft: '3px solid var(--accent)',
          },
          iconTheme: {
            primary: 'var(--accent)',
            secondary: 'var(--bg-raised)',
          },
        },

        // ---- blank / custom ----
        blank: {
          duration: 1000,
          style: {
            background: 'var(--bg-raised)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          },
        },

        // ---- caller overrides win ----
        ...props?.toastOptions,
      }}
      {...props}
    />
  );
};

// ============================================================
// TOAST HELPERS
// ============================================================

export const showToast = {
  success: (message, options = {}) => toast.success(message, options),
  error:   (message, options = {}) => toast.error(message, options),
  loading: (message, options = {}) => toast.loading(message, options),
  dismiss: (toastId) => toast.dismiss(toastId),
  custom:  (message, options = {}) => toast(message, options),
};

export default toast;