import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';

const AUTH_BASE_URL = 'https://kxbyte.onrender.com';

// postMessage target — restrict to our own origin, not '*'
const FRONTEND_ORIGIN =
  typeof window !== 'undefined' ? window.location.origin : '*';

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuthData } = useAuth();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const code = searchParams.get('code');
    const error = searchParams.get('error');

    const sendToOpener = (payload) => {
      if (!window.opener) return false;
      try {
        window.opener.postMessage(payload, FRONTEND_ORIGIN);
        return true;
      } catch (err) {
        console.warn('postMessage failed:', err);
        return false;
      }
    };

    const closeSoon = () => {
      setTimeout(() => window.close(), 100);
    };

    if (error) {
      if (!sendToOpener({ type: 'KXBYTE_LOGIN_ERROR', error })) {
        navigate(`/login?error=${encodeURIComponent(error)}`);
      } else {
        closeSoon();
      }
      return;
    }

    if (!code) {
      const msg = 'No authorization code provided';
      if (!sendToOpener({ type: 'KXBYTE_LOGIN_ERROR', error: msg })) {
        navigate('/login');
      } else {
        closeSoon();
      }
      return;
    }

axios.post(
  `${AUTH_BASE_URL}/api/v1/auth/oauth/token`,
  { code, client_id: 'kxtill' }
) 
      .then((response) => {
        const { access_token, refresh_token, user, organizations } =
          response.data || {};

        if (!access_token) {
          const msg = 'Token exchange failed';
          if (!sendToOpener({ type: 'KXBYTE_LOGIN_ERROR', error: msg })) {
            navigate(`/login?error=${encodeURIComponent(msg)}`);
          } else {
            closeSoon();
          }
          return;
        }

        setAuthData(user, access_token, refresh_token, organizations || []);

        if (window.opener) {
          const delivered = sendToOpener({
            type: 'KXBYTE_LOGIN_SUCCESS',
            data: {
              accessToken: access_token,
              refreshToken: refresh_token,
              user,
              organizations: organizations || [],
            },
          });

          if (delivered) {
            closeSoon();
          } else {
            // Opener didn't accept the message — fall back to full navigation
            navigate(
              organizations?.length > 0 ? '/select-org' : '/dashboard'
            );
          }
        } else {
          navigate(organizations?.length > 0 ? '/select-org' : '/dashboard');
        }
      })
      .catch((err) => {
        const raw =
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message;
        const errorMsg =
          typeof raw === 'string' && raw.trim() ? raw : 'Token exchange failed';

        if (!sendToOpener({ type: 'KXBYTE_LOGIN_ERROR', error: errorMsg })) {
          navigate(`/login?error=${encodeURIComponent(errorMsg)}`);
        } else {
          closeSoon();
        }
      });
  }, [searchParams, navigate, setAuthData]);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#0e0f13',
        color: '#eceef2',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, Inter, Segoe UI, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            margin: '0 auto 16px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #d9a84e, #ff6a2b)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: '700',
            color: '#17181e',
          }}
        >
          K
        </div>
        <p
          style={{
            margin: '0 0 4px',
            fontSize: '16px',
            fontWeight: '500',
          }}
        >
          Completing authorization...
        </p>
        <p style={{ fontSize: '13px', color: '#62636e', margin: 0 }}>
          Please wait while we redirect you back.
        </p>
      </div>
    </div>
  );
}