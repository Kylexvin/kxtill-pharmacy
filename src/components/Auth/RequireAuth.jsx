// src/components/Auth/RequireAuth.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Session + organization guard.
 *
 *   No access token        → /login
 *   Token but no activeOrg → /select-org
 *
 * Branch is NOT enforced here. Pages that need a specific branch
 * wrap themselves with <RequireBranch />.
 *
 * Preserves the attempted URL so login can bounce back after success.
 */
const RequireAuth = ({ children }) => {
  const { accessToken, activeOrganization } = useAuth();
  const location = useLocation();

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!activeOrganization) {
    return <Navigate to="/select-org" replace />;
  }

  return children;
};

export default RequireAuth;