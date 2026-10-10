import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Login.module.css';

const KXTILL_LOGO = '/assets/logo3.png';
const KXBYTE_LOGO =
  'https://res.cloudinary.com/dkahrnjrn/image/upload/v1788695499/logo.png';

const DEFAULT_CLIENT_ID = 'kxtill-pharmacy';
const DEFAULT_REDIRECT_URI = `${window.location.origin}/kx/kxtill/oauth/callback`;

const AUTH_BASE_URL = 'https://auth.kxbyte.co.ke';

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isLoading, setAuthData } = useAuth();

  const [error, setError] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);

  const clientId = searchParams.get('client_id') || DEFAULT_CLIENT_ID;
  const redirectUri = searchParams.get('redirect_uri') || DEFAULT_REDIRECT_URI;
  const state = searchParams.get('state');

  // If OAuth sent an error back, surface it and auto-open the modal.
  useEffect(() => {
    const oauthError = searchParams.get('error');
    if (oauthError) {
      setError(
        oauthError === 'invalid_credentials'
          ? 'Invalid email or password'
          : 'Login failed'
      );
      setShowLoginModal(true);
    }
  }, [searchParams]);

  // Popup auth listener
  useEffect(() => {
    const handleAuthMessage = (event) => {
      if (event.data?.type === 'KXBYTE_LOGIN_SUCCESS') {
        const { data } = event.data;
        setAuthData(
          data.user,
          data.accessToken,
          data.refreshToken,
          data.organizations || []
        );
        if (window._kxbytePopup && !window._kxbytePopup.closed) {
          window._kxbytePopup.close();
        }
        if (data.organizations?.length > 1) navigate('/select-org');
        else if (data.organizations?.length === 1) navigate('/dashboard');
        else navigate('/create-org');
      }

      if (event.data?.type === 'KXBYTE_LOGIN_ERROR') {
        setError(event.data.error || 'Login failed');
        if (window._kxbytePopup && !window._kxbytePopup.closed) {
          window._kxbytePopup.close();
        }
      }
    };

    window.addEventListener('message', handleAuthMessage);
    return () => window.removeEventListener('message', handleAuthMessage);
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
    if (!popup) window.location.href = url;
    window._kxbytePopup = popup;
  };

  const handleKxbyteLogin = () => {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
    });
    if (state) params.append('state', state);
    openAuthPopup(`${AUTH_BASE_URL}/api/v1/auth/oauth/authorize?${params}`);
  };

  const handleSocialLogin = (provider) => {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
    });
    if (state) params.append('state', state);
    openAuthPopup(`${AUTH_BASE_URL}/api/v1/auth/${provider}?${params}`);
  };

  return (
    <div className={styles.page}>
      {/* ---------- HERO / LANDING CONTENT ---------- */}
      <main className={styles.hero}>
        <div className={styles.brand}>
          <img src={KXTILL_LOGO} alt="KXTill logo" className={styles.kxtillLogo} />
          <span className={styles.brandSub}>KxTill Pharmacy</span>
        </div>

        <h1 className={styles.heroTitle}>
          The point of sale built for Kenyan pharmacies
        </h1>

        <p className={styles.heroLead}>
          Sell faster, track stock in real time, and keep records even when the
          internet drops. KXTill runs on any device — no expensive hardware
          required.
        </p>

        <div className={styles.ctaRow}>
          <button
            type="button"
            className={styles.primaryCta}
            onClick={() => setShowLoginModal(true)}
          >
            Try KXTill Pharmacy
          </button>
          <button
            type="button"
            className={styles.secondaryCta}
            onClick={() => setShowLoginModal(true)}
          >
            Sign in
          </button>
        </div>

        <ul className={styles.features}>
          <li>
            <strong>Offline-first.</strong> Keep selling when the network is
            down — sales sync automatically when you're back online.
          </li>
          <li>
            <strong>Inventory that matches reality.</strong> Barcodes, batch
            tracking, low-stock alerts, per-branch stock levels.
          </li>
          <li>
            <strong>Payments your customers use.</strong> Cash, M-Pesa, card,
            and split payments in one sale.
          </li>
          <li>
            <strong>Reports that matter.</strong> Daily sales, profit, and
            stock movement — no spreadsheets.
          </li>
        </ul>
      </main>

      {/* ---------- LOGIN MODAL ---------- */}
      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          error={error}
          isLoading={isLoading}
          onKxbyteLogin={handleKxbyteLogin}
          onSocialLogin={handleSocialLogin}
        />
      )}
    </div>
  );
}

/* ============================================================
   LOGIN MODAL
   ============================================================ */
function LoginModal({
  onClose,
  error,
  isLoading,
  onKxbyteLogin,
  onSocialLogin,
}) {
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);

  // Focus trap + Esc + body scroll lock
  useEffect(() => {
    previouslyFocused.current = document.activeElement;

    const handleKey = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusables = dialogRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus first focusable in the dialog
    const t = setTimeout(() => {
      const first = dialogRef.current?.querySelector(
        'button, [href], input, select, textarea'
      );
      first?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
      previouslyFocused.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className={styles.modalBackdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.modalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kxtill-login-title"
      >
        <button
          type="button"
          className={styles.modalClose}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        <h2 id="kxtill-login-title" className={styles.modalTitle}>
          Sign in to KXTill
        </h2>
        <p className={styles.modalSubtitle}>
          Use your KXBYTE account to continue
        </p>

        {error && <div className={styles.error}>{error}</div>}

        <button
          type="button"
          className={styles.kxbyteBtn}
          onClick={onKxbyteLogin}
          disabled={isLoading}
        >
          <img
            src={KXBYTE_LOGO}
            alt=""
            aria-hidden="true"
            className={styles.btnLogo}
          />
          Continue with KXBYTE
        </button>

        <div className={styles.divider}>
          <span>or continue with</span>
        </div>

        <div className={styles.socialButtons}>
          <button
            type="button"
            className={styles.socialButton}
            onClick={() => onSocialLogin('google')}
            disabled={isLoading}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
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
            onClick={() => onSocialLogin('github')}
            disabled={isLoading}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.15 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.62.24 2.85.12 3.15.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Continue with GitHub
          </button>
        </div>

        <p className={styles.legal}>
          By continuing you agree to our terms and privacy policy.
        </p>
      </div>
    </div>
  );
}