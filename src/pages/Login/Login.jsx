import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Login.module.css';

const KXTILL_LOGO = '/assets/logo3.png';
const KXBYTE_LOGO = 'https://res.cloudinary.com/dkahrnjrn/image/upload/v1788695499/logo.png';

const DEFAULT_CLIENT_ID = 'kxtill';
const DEFAULT_REDIRECT_URI = `${window.location.origin}/kx/kxtill/oauth/callback`;

const AUTH_BASE_URL = 'https://kxbyte.onrender.com';

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isLoading, setAuthData } = useAuth();
  const [error, setError] = useState('');

  const clientId = searchParams.get('client_id') || DEFAULT_CLIENT_ID;
  const redirectUri = searchParams.get('redirect_uri') || DEFAULT_REDIRECT_URI;
  const state = searchParams.get('state');

  useEffect(() => {
    const oauthError = searchParams.get('error');
    if (oauthError) {
      setError(oauthError === 'invalid_credentials'
        ? 'Invalid email or password'
        : 'Login failed');
    }
  }, [searchParams]);

  // Listen for auth messages from popup
  useEffect(() => {
    const handleAuthMessage = (event) => {
      console.log('Login page received message:', event.data, 'from:', event.origin);
      
      // Only handle our auth messages
      if (event.data?.type === 'KXBYTE_LOGIN_SUCCESS') {
        const { data } = event.data;
        console.log('Login success! Data:', data);
        
        // Set auth data
        setAuthData(data.user, data.accessToken, data.refreshToken, data.organizations || []);
        
        // Close popup if still open
        if (window._kxbytePopup && !window._kxbytePopup.closed) {
          window._kxbytePopup.close();
        }
        
        // Navigate based on organizations
        if (data.organizations?.length > 1) {
          navigate('/select-org');
        } else if (data.organizations?.length === 1) {
          navigate('/dashboard');
        } else {
          navigate('/create-org');
        }
      }

      if (event.data?.type === 'KXBYTE_LOGIN_ERROR') {
        console.log('Login error:', event.data.error);
        setError(event.data.error || 'Login failed');
        if (window._kxbytePopup && !window._kxbytePopup.closed) {
          window._kxbytePopup.close();
        }
      }
    };

    window.addEventListener('message', handleAuthMessage);
    
    return () => {
      window.removeEventListener('message', handleAuthMessage);
    };
  }, [navigate, setAuthData]);

  const openAuthPopup = (url) => {
    const width = 480;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      url,
      'KXBYTE Login',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,scrollbars=yes`
    );

    if (!popup) {
      // Popup blocked - fallback to full redirect
      window.location.href = url;
    }

    window._kxbytePopup = popup;
  };

  const handleKxbyteLogin = () => {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
    });
    if (state) params.append('state', state);

    const url = `${AUTH_BASE_URL}/api/v1/auth/oauth/authorize?${params}`;
    openAuthPopup(url);
  };

  const handleSocialLogin = (provider) => {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
    });
    if (state) params.append('state', state);

    const url = `${AUTH_BASE_URL}/api/v1/auth/${provider}?${params}`;
    openAuthPopup(url);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.formContainer}>
          {/* KXTill Logo - the product */}
          <div className={styles.productBrand}>
            <img src={KXTILL_LOGO} alt="KXTill" className={styles.kxtillLogo} />
            <span className={styles.productSub}>KxTill</span>
          </div>

          <h2>Sign in to continue</h2>
          <p className={styles.subtitle}>
            Use your KXBYTE account to access KXTill
          </p>

          {error && <div className={styles.error}>{error}</div>}

          <button
            type="button"
            className={styles.kxbyteBtn}
            onClick={handleKxbyteLogin}
            disabled={isLoading}
          >
            <img src={KXBYTE_LOGO} alt="KXBYTE" className={styles.btnLogo} />
            Continue with KXBYTE
          </button>

          <div className={styles.divider}>
            <span>or continue with</span>
          </div>

          <div className={styles.socialButtons}>
            <button
              type="button"
              className={styles.socialButton}
              onClick={() => handleSocialLogin('google')}
              disabled={isLoading}
            >
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
              </svg>
              Continue with Google
            </button>

            <button
              type="button"
              className={styles.socialButton}
              onClick={() => handleSocialLogin('github')}
              disabled={isLoading}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.15 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.62.24 2.85.12 3.15.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Continue with GitHub
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}