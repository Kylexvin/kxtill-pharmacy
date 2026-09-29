// src/pages/SsoCallback.jsx  (KxTill — new file)
import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';

export default function SsoCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuthData } = useAuth();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const code = searchParams.get('code');
    if (!code) {
      navigate('/login?error=no_code');
      return;
    }

    axios
      .post('/auth/sso/exchange', { code }, { skipAuth: true })
      .then(({ data }) => {
        const { user, accessToken, refreshToken, organizations } = data;
        setAuthData(user, accessToken, refreshToken, organizations || []);
        navigate(organizations?.length ? '/select-org' : '/dashboard');
      })
      .catch((err) => {
        const msg = err?.response?.data?.error || 'SSO exchange failed';
        navigate(`/login?error=${encodeURIComponent(msg)}`);
      });
  }, [searchParams, navigate, setAuthData]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <p>Signing you in…</p>
    </div>
  );
}