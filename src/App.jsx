// src/App.jsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import { Toaster } from './components/Common/Toast';
import { AuthProvider } from './contexts/AuthContext';
import { PermissionsProvider } from './contexts/PermissionsContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ThemeProvider } from './contexts/ThemeContext';
import RequireAuth from './components/Auth/RequireAuth';
import RequirePermission from './components/Auth/RequirePermission';
import Layout from './components/Layout/Layout';
import Login from './pages/Login/Login';
import OAuthCallback from './pages/OAuthCallback/OAuthCallback';
import SelectOrg from './pages/SelectOrg/SelectOrg';
import SelectBranch from './pages/SelectBranch/SelectBranch';
import POS from './pages/POS/POS';
import Dashboard from './pages/Dashboard/Dashboard';
import Inventory from './pages/Inventory/Inventory';
import GlobalInventory from './pages/Inventory/GlobalInventory';
import Reports from './pages/Reports/Reports';
import Settings from './pages/Settings/Settings';
import Sales from './pages/Sales/Sales';
import Refunds from './pages/Refunds/Refunds';
import Transfers from './pages/Transfers/Transfers';
import Customers from './pages/Customers/Customers';
import CustomerDetail from './pages/Customers/CustomerDetail';
import KxTillStaff from './pages/KxTillStaff/KxTillStaff';
import Branches from './pages/Branches/Branches';
import Account from './pages/Account/Account';
import { KXTILL, PLATFORM } from './constants/permissions';
import { initDb } from './db/sqlite';
import './App.css';
import './styles/globals.css';

// ============================================================
// AXIOS CONFIG
// ============================================================
axios.defaults.baseURL =
  process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1';
axios.defaults.headers.common['Content-Type'] = 'application/json';
axios.defaults.withCredentials = true;

// ============================================================
// SESSION CACHE PURGE
// ============================================================
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

function clearAuthStorage() {
  try {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('organizations');
    localStorage.removeItem('activeOrganization');
    localStorage.removeItem('activeBranch');
  } catch {
    // ignore
  }
  purgeSessionCaches();
  delete axios.defaults.headers.common['Authorization'];
}

// ============================================================
// REQUEST INTERCEPTOR — attach bearer token
// ============================================================
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ============================================================
// RESPONSE INTERCEPTOR — single-flight refresh on 401
// ============================================================
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token);
    }
  });
  failedQueue = [];
};

const AUTH_ENDPOINTS = ['/auth/refresh', '/auth/login', '/auth/register'];

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url || '';

    // Auth endpoints themselves must never trigger a refresh loop
    if (AUTH_ENDPOINTS.some((ep) => url.includes(ep))) {
      clearAuthStorage();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return axios(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const response = await axios.post('/auth/refresh', { refreshToken });
        const { accessToken } = response.data;

        localStorage.setItem('accessToken', accessToken);
        axios.defaults.headers.common['Authorization'] =
          `Bearer ${accessToken}`;

        processQueue(null, accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return axios(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAuthStorage();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ============================================================
// DB LOADING SCREEN
// ============================================================
const DbLoadingScreen = () => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      background: 'var(--bg-app, #0f0f12)',
      color: 'var(--text-muted, #8b8d98)',
      fontFamily: 'inherit',
      zIndex: 9999,
    }}
  >
    <div
      style={{
        width: '40px',
        height: '40px',
        border: '3px solid var(--border, #2a2a2e)',
        borderTopColor: 'var(--accent, #ff6b2b)',
        borderRadius: '50%',
        animation: 'appDbSpin 0.8s linear infinite',
      }}
    />
    <div style={{ fontSize: '14px', fontWeight: 500 }}>
      Loading local database…
    </div>
    <div
      style={{
        fontSize: '12px',
        color: 'var(--text-faint, #5a5c66)',
        marginTop: '-8px',
      }}
    >
      This only takes a moment
    </div>
    <style>{`@keyframes appDbSpin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

// ============================================================
// APP
// ============================================================
function App() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    const initDatabase = async () => {
      try {
        await initDb();
        console.log('SQLite database initialized');
        setDbReady(true);
      } catch (error) {
        console.error('Failed to initialize SQLite database:', error);
        setTimeout(initDatabase, 2000);
      }
    };
    initDatabase();
  }, []);

  if (!dbReady) return <DbLoadingScreen />;

  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <PermissionsProvider>
            <SettingsProvider>
              <Toaster />
              <Routes>
                {/* ==================== PUBLIC ==================== */}
                <Route path="/login" element={<Login />} />
                <Route path="/oauth/login" element={<Login />} />
                <Route path="/oauth/callback" element={<OAuthCallback />} />
                <Route
                  path="/kx/kxtill/oauth/callback"
                  element={<OAuthCallback />}
                />
                <Route path="/select-org" element={<SelectOrg />} />
                <Route path="/select-branch" element={<SelectBranch />} />

                {/* ==================== PROTECTED ==================== */}
                <Route
                  path="/"
                  element={
                    <RequireAuth>
                      <Layout />
                    </RequireAuth>
                  }
                >
                  <Route index element={<Navigate to="/pos" replace />} />

                  {/* ---------- POS ---------- */}
                  <Route
                    path="pos"
                    element={
                      <RequirePermission permission={KXTILL.SALES.CREATE}>
                        <POS />
                      </RequirePermission>
                    }
                  />

                  {/* ---------- Dashboard ---------- */}
                  <Route
                    path="dashboard"
                    element={
                      <RequirePermission
                        anyOf={[
                          KXTILL.SALES.VIEW,
                          KXTILL.SALES.CREATE,
                          KXTILL.INVENTORY.VIEW,
                          KXTILL.REPORTS.VIEW,
                          PLATFORM.BRANCHES.VIEW,
                        ]}
                      >
                        <Dashboard />
                      </RequirePermission>
                    }
                  />

                  {/* ---------- Sales ---------- */}
                  <Route
                    path="sales"
                    element={
                      <RequirePermission permission={KXTILL.SALES.VIEW}>
                        <Sales />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="refunds"
                    element={
                      <RequirePermission permission={KXTILL.SALES.REFUND}>
                        <Refunds />
                      </RequirePermission>
                    }
                  />

                  {/* ---------- Customers ---------- */}
                  <Route
                    path="customers"
                    element={
                      <RequirePermission permission={PLATFORM.CUSTOMERS.VIEW}>
                        <Customers />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="customers/:id"
                    element={
                      <RequirePermission permission={PLATFORM.CUSTOMERS.VIEW}>
                        <CustomerDetail />
                      </RequirePermission>
                    }
                  />

                  {/* ---------- Inventory ---------- */}
                  <Route
                    path="inventory"
                    element={
                      <RequirePermission permission={KXTILL.INVENTORY.VIEW}>
                        <Inventory />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="global-inventory"
                    element={
                      <RequirePermission permission={KXTILL.INVENTORY.GLOBAL_VIEW}>
                        <GlobalInventory />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="transfers"
                    element={
                      <RequirePermission
                        anyOf={[
                          KXTILL.INVENTORY.TRANSFERS.CREATE,
                          KXTILL.INVENTORY.TRANSFERS.APPROVE,
                          KXTILL.INVENTORY.TRANSFERS.COMPLETE,
                        ]}
                      >
                        <Transfers />
                      </RequirePermission>
                    }
                  />

                  {/* ---------- KxTill Staff — owner only ---------- */}
                  <Route
                    path="kxtill/staff"
                    element={
                      <RequirePermission ownerOnly>
                        <KxTillStaff />
                      </RequirePermission>
                    }
                  />

                  {/* ---------- Platform ---------- */}
                  <Route
                    path="branches"
                    element={
                      <RequirePermission
                        anyOf={[
                          PLATFORM.BRANCHES.VIEW,
                          PLATFORM.BRANCHES.MANAGE,
                        ]}
                      >
                        <Branches />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="reports"
                    element={
                      <RequirePermission permission={KXTILL.REPORTS.VIEW}>
                        <Reports />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="settings"
                    element={
                      <RequirePermission permission={KXTILL.SETTINGS.VIEW}>
                        <Settings />
                      </RequirePermission>
                    }
                  />
                  <Route path="account" element={<Account />} />
                </Route>

                {/* ==================== CATCH-ALL ==================== */}
                <Route path="*" element={<Navigate to="/pos" replace />} />
              </Routes>
            </SettingsProvider>
          </PermissionsProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;