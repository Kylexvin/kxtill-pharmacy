// src/App.jsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import { Toaster } from './components/Common/Toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PermissionsProvider } from './contexts/PermissionsContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ThemeProvider } from './contexts/ThemeContext';
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
import { initDb } from './db/sqlite';
import './App.css';
import './styles/globals.css';

axios.defaults.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1';
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
    // ignore
  }
}

// Request queue for concurrent requests during refresh
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

// Request interceptor - attach token
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

// Response interceptor - handle token refresh
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      originalRequest.url === '/auth/refresh' ||
      originalRequest.url?.endsWith('/auth/refresh') ||
      originalRequest.url === '/auth/login' ||
      originalRequest.url === '/auth/register'
    ) {
      localStorage.clear();
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
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post('/auth/refresh', { refreshToken });
        const { accessToken } = response.data;

        localStorage.setItem('accessToken', accessToken);
        axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

        processQueue(null, accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return axios(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        localStorage.removeItem('organizations');
        localStorage.removeItem('activeOrganization');
        localStorage.removeItem('activeBranch');

        purgeSessionCaches();

        delete axios.defaults.headers.common['Authorization'];
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
// PROTECTED ROUTE
// ============================================================

const ProtectedRoute = ({ children }) => {
  const { accessToken } = useAuth();
  if (!accessToken) {
    return <Navigate to="/login" />;
  }
  return children;
};

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
    <div
      style={{
        fontSize: '14px',
        fontWeight: 500,
        letterSpacing: '0.01em',
      }}
    >
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

    <style>
      {`
        @keyframes appDbSpin {
          to { transform: rotate(360deg); }
        }
      `}
    </style>
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

  if (!dbReady) {
    return <DbLoadingScreen />;
  }

  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <PermissionsProvider>
            <SettingsProvider>
              <Toaster />
              <Routes>
                {/* Public Routes */}
                <Route path="/kx/kxtill/oauth/callback" element={<OAuthCallback />} />
                <Route path="/login" element={<Login />} />
                <Route path="/oauth/login" element={<Login />} />
                <Route path="/oauth/callback" element={<OAuthCallback />} />
                <Route path="/select-org" element={<SelectOrg />} />
                <Route path="/select-branch" element={<SelectBranch />} />

                {/* Protected Routes with Layout */}
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <Layout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="/pos" />} />

                  {/* Core */}
                  <Route path="pos" element={<POS />} />
                  <Route path="dashboard" element={<Dashboard />} />

                  {/* Sales */}
                  <Route path="sales" element={<Sales />} />
                  <Route path="refunds" element={<Refunds />} />

                  {/* Customers */}
                  <Route path="customers" element={<Customers />} />
                  <Route path="customers/:id" element={<CustomerDetail />} />

                  {/* Inventory */}
                  <Route path="inventory" element={<Inventory />} />
                  <Route path="global-inventory" element={<GlobalInventory />} />
                  <Route path="transfers" element={<Transfers />} />

                  {/* Staff & Permissions */}
                 
                  <Route path="kxtill/staff" element={<KxTillStaff />} />

                  {/* Platform */}
                  <Route path="branches" element={<Branches />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="account" element={<Account />} />
                </Route>

                {/* Catch all - redirect to POS */}
                <Route path="*" element={<Navigate to="/pos" />} />
              </Routes>
            </SettingsProvider>
          </PermissionsProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;