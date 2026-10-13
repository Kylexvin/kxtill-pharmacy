import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import styles from "./Login.module.css";

// ---- Avatar assets (co-located, bundled by webpack) ----
import avatar1 from "./assets/image3.jpg";
import avatar2 from "./assets/image.jpg";
import avatar3 from "./assets/image2.jpg";

// ---- Local assets (public/assets/) ----
const KXTILL_LOGO = "/assets/logo3.png";
const KXBYTE_LOGO = "/assets/darklogo.png";
const PALM_BG = "/assets/palmbg.jpg";

const DEFAULT_CLIENT_ID = "kxtill-pharmacy";
const DEFAULT_REDIRECT_URI = `${window.location.origin}/kx/kxtill/oauth/callback`;

const AUTH_BASE_URL =
  process.env.REACT_APP_AUTH_BASE_URL || "https://auth.kxbyte.co.ke";
  // process.env.REACT_APP_AUTH_BASE_URL || "http://localhost:5000";

// ---- Slides use the imported avatar variables ----
const SLIDES = [
  {
    name: "Dr. Amina Yusuf",
    role: "Community Pharmacy · Mombasa",
    avatar: avatar1,
  },
  {
    name: "Peter Njoroge",
    role: "Chemist · Thika",
    avatar: avatar2,
  },
  {
    name: "Grace Achieng",
    role: "Dispensary · Kisumu",
    avatar: avatar3,
  },
];

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isLoading, setAuthData } = useAuth();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [slide, setSlide] = useState(0);

  const clientId = searchParams.get("client_id") || DEFAULT_CLIENT_ID;
  const redirectUri =
    searchParams.get("redirect_uri") || DEFAULT_REDIRECT_URI;
  const state = searchParams.get("state");

  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) {
      setError(
        oauthError === "invalid_credentials"
          ? "Invalid email or password"
          : "Login failed"
      );
    }
  }, [searchParams]);

  // ---- Popup postMessage handler (KXBYTE OAuth + register) ----
  useEffect(() => {
    const handleAuthMessage = (event) => {
      if (event.data?.type === "KXBYTE_LOGIN_SUCCESS") {
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

        if (data.organizations?.length > 1) {
          navigate("/select-org");
        } else if (data.organizations?.length === 1) {
          navigate("/dashboard");
        } else {
          navigate("/create-org");
        }
      }

      if (event.data?.type === "KXBYTE_LOGIN_ERROR") {
        setError(event.data.error || "Login failed");
        if (window._kxbytePopup && !window._kxbytePopup.closed) {
          window._kxbytePopup.close();
        }
      }
    };

    window.addEventListener("message", handleAuthMessage);
    return () => window.removeEventListener("message", handleAuthMessage);
  }, [navigate, setAuthData]);

  const openAuthPopup = (url) => {
    const width = 480;
    const height = 640;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      url,
      "KXBYTE Login",
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,scrollbars=yes`
    );

    if (!popup) {
      window.location.href = url;
      return;
    }

    window._kxbytePopup = popup;
  };

  // ---- KXBYTE OAuth ----
  const buildAuthorizeUrl = () => {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
    });
    if (state) params.append("state", state);
    return `${AUTH_BASE_URL}/api/v1/auth/oauth/authorize?${params}`;
  };

  const handleKxbyteLogin = () => openAuthPopup(buildAuthorizeUrl());

  // ---- Register & Forgot password popups ----
  const buildRegisterUrl = () => {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
    });
    if (state) params.append("state", state);
    return `${AUTH_BASE_URL}/api/v1/auth/register?${params}`;
  };

  const buildForgotPasswordUrl = () => {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
    });
    if (state) params.append("state", state);
    return `${AUTH_BASE_URL}/api/v1/auth/forgot-password?${params}`;
  };

  const handleRegister = () => openAuthPopup(buildRegisterUrl());
  const handleForgotPassword = () => openAuthPopup(buildForgotPasswordUrl());

  const handleSocialLogin = (provider) => {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
    });
    if (state) params.append("state", state);
    const url = `${AUTH_BASE_URL}/api/v1/auth/${provider}?${params}`;
    openAuthPopup(url);
  };

  // ---- Email/password form → JSON POST ----
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
      });
      if (state) params.append("state", state);

      const res = await fetch(
        `${AUTH_BASE_URL}/api/v1/auth/login?${params}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        if (data?.code === "INVALID_CREDENTIALS") {
          setError("Email or password is incorrect");
        } else if (data?.code === "EMAIL_NOT_VERIFIED") {
          setError("Email not verified. Please check your inbox.");
        } else {
          setError(data?.message || "Login failed");
        }
        return;
      }

      setAuthData(
        data.user,
        data.accessToken,
        data.refreshToken,
        data.organizations || []
      );

      if (data.organizations?.length > 1) {
        navigate("/select-org");
      } else if (data.organizations?.length === 1) {
        navigate("/dashboard");
      } else {
        navigate("/create-org");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const prevSlide = () =>
    setSlide((s) => (s - 1 + SLIDES.length) % SLIDES.length);
  const nextSlide = () => setSlide((s) => (s + 1) % SLIDES.length);

  const current = SLIDES[slide];

  const heroStyle = {
    backgroundImage: `linear-gradient(180deg, rgba(31, 26, 22, 0.35), rgba(31, 26, 22, 0.85)), url("${PALM_BG}")`,
  };

  const busy = submitting || isLoading;

  return (
    <div className={styles.page}>
      <div className={styles.glowAmber} />
      <div className={styles.glowMoss} />

      <div
        className={styles.bgPhoto}
        style={{ backgroundImage: `url("${PALM_BG}")` }}
      />

      <div className={styles.card}>
        {/* ============ HERO ============ */}
        <div className={styles.hero} style={heroStyle}>
          <div className={styles.heroInner}>
            <div className={styles.heroTop}>
              <div className={styles.heroBrand}>
                <img src={KXTILL_LOGO} alt="" className={styles.heroLogo} />
                <span className={styles.heroWordmark}>KxTill Pharmacy</span>
              </div>

              <div className={styles.heroNav}>
                <a
                  href="https://suite.kxbyte.co.ke/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.heroLink}
                >
                  Visit Suite
                </a>
                <a
                  href="https://kxbyte.co.ke/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.heroPill}
                >
                  Visit KXBYTE
                </a>
              </div>
            </div>

            <div>
              <p className={styles.heroTag}>Pharmacy operations, simplified.</p>
              <p className={styles.heroSub}>
                Dispensing and inventory at your fingertips.
              </p>
            </div>

            <div className={styles.heroBottom}>
              <div className={styles.author}>
                <img
                  src={current.avatar}
                  alt=""
                  className={styles.authorAvatar}
                />
                <div>
                  <div className={styles.authorName}>{current.name}</div>
                  <div className={styles.authorRole}>{current.role}</div>
                </div>
              </div>

              <div className={styles.arrows}>
                <button
                  type="button"
                  className={styles.arrowBtn}
                  onClick={prevSlide}
                  aria-label="Previous"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={styles.arrowBtn}
                  onClick={nextSlide}
                  aria-label="Next"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ============ FORM ============ */}
        <div className={styles.formSide}>
          <div className={styles.formHead}>
            <div className={styles.formBrand}>
              <img
                src={KXBYTE_LOGO}
                alt="KXBYTE"
                className={styles.formBrandLogo}
              />
              <span className={styles.formBrandName}>KXBYTE</span>
            </div>

            <button type="button" className={styles.langBtn}>
              <span aria-hidden="true">🇰🇪</span>
              EN
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>

          <div className={styles.formBody}>
            <h1 className={styles.title}>Hi There!!</h1>
            <p className={styles.subtitle}>Welcome to KxTill Pharmacy</p>

            {error && <div className={styles.error}>{error}</div>}

            <form className={styles.form} onSubmit={handleFormSubmit}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Email</span>
                <input
                  type="email"
                  className={styles.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Password</span>
                <input
                  type="password"
                  className={styles.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>

              <button
                type="button"
                className={styles.forgot}
                onClick={handleForgotPassword}
              >
                Forgot password?
              </button>

              <div className={styles.divider}>or</div>

              <div className={styles.socialRow}>
                <button
                  type="button"
                  className={styles.googleBtn}
                  onClick={() => handleSocialLogin("google")}
                  disabled={busy}
                >
                  Google
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                    <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                    <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                    <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
                  </svg>
                </button>

                <button
                  type="button"
                  className={styles.githubBtn}
                  onClick={() => handleSocialLogin("github")}
                  disabled={busy}
                >
                  GitHub
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.15 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.62.24 2.85.12 3.15.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                </button>
              </div>

              <button
                type="submit"
                className={styles.kxbyteBtn}
                disabled={busy}
                onClick={(e) => {
                  if (!email && !password) {
                    e.preventDefault();
                    handleKxbyteLogin();
                  }
                }}
              >
                <img src={KXBYTE_LOGO} alt="" className={styles.btnLogo} />
                {submitting ? "Signing in…" : "Login with KXBYTE"}
              </button>
            </form>

            <p className={styles.signup}>
              Don&apos;t have an account?{" "}
              <button type="button" onClick={handleRegister}>
                Sign up
              </button>
            </p>

            <div className={styles.socials}>
              <button type="button" className={styles.socialIcon} data-tip="Coming soon" aria-label="Facebook (coming soon)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M13.5 22v-8h2.7l.5-3.2h-3.2V8.8c0-.9.4-1.7 1.8-1.7h1.5V4.3S15.4 4 14.1 4C11.5 4 9.8 5.6 9.8 8.4v2.4H7v3.2h2.8v8h3.7z" />
                </svg>
              </button>
              <button type="button" className={styles.socialIcon} data-tip="Coming soon" aria-label="X (coming soon)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2H21.5l-7.1 8.12L22.75 22h-6.54l-5.12-6.69L5.2 22H1.94l7.6-8.68L1.5 2h6.7l4.63 6.12L18.244 2zm-1.14 18h1.8L7.1 3.9H5.17L17.104 20z" />
                </svg>
              </button>
              <button type="button" className={styles.socialIcon} data-tip="Coming soon" aria-label="LinkedIn (coming soon)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M6.94 8.5H3.56V20h3.38V8.5zM5.25 3a2 2 0 100 4 2 2 0 000-4zM20.44 13.2c0-3.1-1.65-4.9-4.3-4.9-1.4 0-2.4.7-2.9 1.5V8.5H9.9V20h3.4v-6.1c0-1.6.7-2.5 1.9-2.5s1.8.9 1.8 2.5V20h3.4v-6.8z" />
                </svg>
              </button>
              <button type="button" className={styles.socialIcon} data-tip="Coming soon" aria-label="Instagram (coming soon)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>

          <p className={styles.footerNote}>
            By signing in you agree to KxTill Pharmacy&apos;s{" "}
            <a href="https://kxbyte.co.ke/terms-of-service" target="_blank" rel="noopener noreferrer">terms</a>{" "}
            and{" "}
            <a href="https://kxbyte.co.ke/privacy-policy" target="_blank" rel="noopener noreferrer">privacy policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}