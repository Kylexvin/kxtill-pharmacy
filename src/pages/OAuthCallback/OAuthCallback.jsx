// src/pages/OAuthCallback/OAuthCallback.jsx

import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function OAuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuthData } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');
    const userParam = params.get('user');
    const orgsParam = params.get('organizations');
    const error = params.get('error');

    if (error) {
      navigate('/login?error=social_failed');
      return;
    }

    if (!accessToken || !refreshToken || !userParam) {
      navigate('/login?error=invalid_callback');
      return;
    }

    try {
      const user = JSON.parse(decodeURIComponent(userParam));
      const organizations = orgsParam ? JSON.parse(decodeURIComponent(orgsParam)) : [];

      // Let AuthContext handle everything
      setAuthData(user, accessToken, refreshToken, organizations);

      // Frontend decides where to go
      if (organizations.length === 0) {
        navigate('/select-org');
      } else if (organizations.length === 1) {
        navigate('/select-org'); // SelectOrg will auto-select
      } else {
        navigate('/select-org');
      }
    } catch (error) {
      console.error('OAuth callback error:', error);
      navigate('/login?error=callback_failed');
    }
  }, [location, navigate, setAuthData]);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontSize: '16px',
      color: 'var(--text-muted)',
      background: 'var(--bg-app)'
    }}>
      Completing login...
    </div>
  );
}