import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';

const AUTH_BASE_URL = process.env.REACT_APP_AUTH_BASE_URL || 'http://localhost:5000';

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

    if (error) {
      if (window.opener) {
        window.opener.postMessage({ 
          type: 'KXBYTE_LOGIN_ERROR', 
          error: error 
        }, '*');
        window.close();
      } else {
        navigate(`/login?error=${error}`);
      }
      return;
    }

    if (!code) {
      if (window.opener) {
        window.opener.postMessage({ 
          type: 'KXBYTE_LOGIN_ERROR', 
          error: 'No authorization code provided' 
        }, '*');
        window.close();
      } else {
        navigate('/login');
      }
      return;
    }

    axios
      .post(`${AUTH_BASE_URL}/api/v1/auth/oauth/token`, { 
        code, 
        client_id: 'kxtill' 
      }, { withCredentials: true })
      .then((response) => {
        const { access_token, refresh_token, user, organizations } = response.data;
        
        if (access_token) {
          // Set auth data in popup
          setAuthData(user, access_token, refresh_token, organizations || []);
          
          // If in popup, send success message to parent and close
          if (window.opener) {
            const messageData = {
              type: 'KXBYTE_LOGIN_SUCCESS', 
              data: {
                accessToken: access_token,
                refreshToken: refresh_token,
                user: user,
                organizations: organizations || []
              }
            };
            
            // Send to parent with '*'
            window.opener.postMessage(messageData, '*');
            
            // Small delay to ensure message is sent before closing
            setTimeout(() => {
              window.close();
            }, 100);
          } else {
            // If not in popup, navigate normally
            navigate(organizations?.length > 0 ? '/select-org' : '/dashboard');
          }
        } else {
          if (window.opener) {
            window.opener.postMessage({ 
              type: 'KXBYTE_LOGIN_ERROR', 
              error: 'Token exchange failed' 
            }, '*');
            setTimeout(() => {
              window.close();
            }, 100);
          } else {
            navigate('/login?error=token_exchange_failed');
          }
        }
      })
      .catch((err) => {
        const errorMsg = err.response?.data?.error || 'Token exchange failed';
        if (window.opener) {
          window.opener.postMessage({ 
            type: 'KXBYTE_LOGIN_ERROR', 
            error: errorMsg 
          }, '*');
          setTimeout(() => {
            window.close();
          }, 100);
        } else {
          navigate(`/login?error=${errorMsg}`);
        }
      });
  }, [searchParams, navigate, setAuthData]);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      background: '#0e0f13',
      color: '#eceef2',
      fontFamily: '-apple-system, BlinkMacSystemFont, Inter, Segoe UI, sans-serif'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ 
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
          color: '#17181e'
        }}>
          K
        </div>
        <p style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: '500' }}>Completing authorization...</p>
        <p style={{ fontSize: '13px', color: '#62636e', margin: 0 }}>Please wait while we redirect you back.</p>
      </div>
    </div>
  );
}