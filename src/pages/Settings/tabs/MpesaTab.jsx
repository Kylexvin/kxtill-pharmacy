// Products/kxtill/src/pages/Settings/tabs/MpesaTab.jsx
//
// M-Pesa (Daraja) configuration tab.
// Each tenant enters their own Safaricom credentials. Credentials are sent
// to the backend, encrypted at rest, and never returned in plaintext.

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  CreditCard,
  Key,
  Hash,
  Save,
  RefreshCw,
  AlertCircle,
  Check,
  Trash2,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { usePermissions } from '../../../contexts/PermissionsContext';
import styles from './MpesaTab.module.css';

const ENVIRONMENTS = [
  { value: 'SANDBOX',    label: 'Sandbox (testing)' },
  { value: 'PRODUCTION', label: 'Production (live)' },
];

const emptyForm = {
  environment: 'SANDBOX',
  consumerKey: '',
  consumerSecret: '',
  passkey: '',
  shortcode: '',
};

const MpesaTab = () => {
  const { activeOrganization } = useAuth();
  const { isOwner } = usePermissions();
  const orgId = activeOrganization?.id;

  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState([]);

  const readonly = !isOwner;

  // ─── load existing config ───
  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await axios.get(
        `/organizations/${orgId}/payments/mpesa`
      );
      const c = res.data?.config || null;
      setConfig(c);
      if (c) {
        setForm({
          environment: c.environment || 'SANDBOX',
          consumerKey: '',
          consumerSecret: '',
          passkey: '',
          shortcode: c.shortcode || '',
        });
      }
    } catch (err) {
      // 404 is fine — not configured yet
      if (err.response?.status !== 404) {
        toast.error('Failed to load M-Pesa settings');
      }
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  // ─── save ───
  const handleSave = async () => {
    if (readonly) return;
    setErrors([]);
    setTestResult(null);

    // Basic client-side check
    const fieldErrors = [];
    if (!form.consumerKey.trim()) fieldErrors.push('Consumer Key is required');
    if (!form.consumerSecret.trim()) fieldErrors.push('Consumer Secret is required');
    if (!form.passkey.trim()) fieldErrors.push('Passkey is required');
    if (!/^\d{5,7}$/.test(form.shortcode.trim())) {
      fieldErrors.push('Shortcode must be 5–7 digits');
    }
    if (fieldErrors.length > 0) {
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      const res = await axios.post(
        `/organizations/${orgId}/payments/mpesa`,
        {
          environment: form.environment,
          consumerKey: form.consumerKey.trim(),
          consumerSecret: form.consumerSecret.trim(),
          passkey: form.passkey.trim(),
          shortcode: form.shortcode.trim(),
        }
      );
      setConfig(res.data.config);
      // Clear the secret fields — never re-display them
      setForm((f) => ({
        ...f,
        consumerKey: '',
        consumerSecret: '',
        passkey: '',
        shortcode: res.data.config.shortcode,
        environment: res.data.config.environment,
      }));
      toast.success('M-Pesa credentials saved');
    } catch (err) {
      const errs = err.response?.data?.errors;
      if (Array.isArray(errs) && errs.length > 0) {
        setErrors(errs);
      } else {
        toast.error(
          err.response?.data?.error || 'Failed to save credentials'
        );
      }
    } finally {
      setSaving(false);
    }
  };

  // ─── test ───
  const handleTest = async () => {
    if (readonly) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post(
        `/organizations/${orgId}/payments/mpesa/test`
      );
      if (res.data?.ok) {
        setTestResult({ ok: true, message: 'Credentials are valid' });
        toast.success('Daraja accepted the credentials');
      } else {
        setTestResult({
          ok: false,
          message: res.data?.reason || 'Credentials were rejected',
        });
      }
      // Reload masked config to refresh lastTestedAt
      load();
    } catch (err) {
      const reason =
        err.response?.data?.reason ||
        err.response?.data?.error ||
        'Test failed';
      setTestResult({ ok: false, message: reason });
      toast.error(reason);
    } finally {
      setTesting(false);
    }
  };

  // ─── delete ───
  const handleDelete = async () => {
    if (readonly) return;
    if (
      !window.confirm(
        'Remove M-Pesa configuration? Customers will no longer be able to pay via M-Pesa until you re-enter credentials.'
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await axios.delete(`/organizations/${orgId}/payments/mpesa`);
      setConfig(null);
      setForm(emptyForm);
      setTestResult(null);
      toast.success('M-Pesa configuration removed');
    } catch (err) {
      toast.error(
        err.response?.data?.error || 'Failed to remove configuration'
      );
    } finally {
      setDeleting(false);
    }
  };

  const callbackUrl = config?.callbackToken
    ? `${window.location.origin.replace(':3000', ':5000')}/api/v1/payments/mpesa/callback/${config.callbackToken}`
    : null;

  if (loading) {
    return (
      <div className={styles.loading}>
        <Loader2 size={20} className={styles.spin} />
        <span>Loading M-Pesa settings…</span>
      </div>
    );
  }

  const isConfigured = !!config;

  return (
    <div className={styles.panels}>
      {/* ── Status card ── */}
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <div className={styles.sectionIcon}>
            <CreditCard size={16} />
          </div>
          <div className={styles.sectionHeaderText}>
            <h2 className={styles.sectionTitle}>M-Pesa (Daraja)</h2>
            <p className={styles.sectionDesc}>
              Let customers pay via M-Pesa STK Push. Funds go directly to
              your own M-Pesa account — KXBYTE never holds your money.
            </p>
          </div>
          <div className={styles.sectionHeaderActions}>
            <StatusPill
              isConfigured={isConfigured}
              lastTestResult={config?.lastTestResult}
            />
          </div>
        </header>
      </section>

      {/* ── Setup guide ── */}
      {!isConfigured && (
        <section className={styles.section}>
          <div className={styles.guide}>
            <h3 className={styles.guideTitle}>How to get your credentials</h3>
            <ol className={styles.guideList}>
              <li>
                Go to the{' '}
                <a
                  href="https://developer.safaricom.co.ke/"
                  target="_blank"
                  rel="noreferrer"
                  className={styles.guideLink}
                >
                  Safaricom Developer Portal{' '}
                  <ExternalLink size={11} />
                </a>{' '}
                and create an account.
              </li>
              <li>
                Create a new app and enable <strong>Lipa Na M-Pesa Online
                (STK Push)</strong>.
              </li>
              <li>
                Copy the <strong>Consumer Key</strong>,{' '}
                <strong>Consumer Secret</strong>, and <strong>Passkey</strong>{' '}
                from your app.
              </li>
              <li>
                Note your <strong>Shortcode</strong> — for sandbox use{' '}
                <code>174379</code>.
              </li>
              <li>Paste them below and click Save.</li>
            </ol>
          </div>
        </section>
      )}

      {/* ── Credentials form ── */}
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <div className={styles.sectionIcon}>
            <Key size={16} />
          </div>
          <div className={styles.sectionHeaderText}>
            <h2 className={styles.sectionTitle}>Credentials</h2>
            <p className={styles.sectionDesc}>
              {isConfigured
                ? 'Re-enter credentials to update them. Secrets are never displayed once saved.'
                : 'Paste your Daraja credentials below.'}
            </p>
          </div>
        </header>

        {errors.length > 0 && (
          <div className={styles.errorBox}>
            <AlertCircle size={14} />
            <div>
              {errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          </div>
        )}

        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Environment</label>
            <select
              className={styles.select}
              value={form.environment}
              onChange={(e) =>
                setForm((f) => ({ ...f, environment: e.target.value }))
              }
              disabled={readonly || saving}
            >
              {ENVIRONMENTS.map((env) => (
                <option key={env.value} value={env.value}>
                  {env.label}
                </option>
              ))}
            </select>
            <p className={styles.hint}>
              Use Sandbox to test. Switch to Production when you're ready for
              live payments.
            </p>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Consumer Key</label>
            <input
              type="password"
              className={styles.input}
              value={form.consumerKey}
              onChange={(e) =>
                setForm((f) => ({ ...f, consumerKey: e.target.value }))
              }
              placeholder={isConfigured ? '•••••••• (saved)' : 'Paste your consumer key'}
              disabled={readonly || saving}
              autoComplete="off"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Consumer Secret</label>
            <input
              type="password"
              className={styles.input}
              value={form.consumerSecret}
              onChange={(e) =>
                setForm((f) => ({ ...f, consumerSecret: e.target.value }))
              }
              placeholder={isConfigured ? '•••••••• (saved)' : 'Paste your consumer secret'}
              disabled={readonly || saving}
              autoComplete="off"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Passkey (Lipa Na M-Pesa Online)</label>
            <input
              type="password"
              className={styles.input}
              value={form.passkey}
              onChange={(e) =>
                setForm((f) => ({ ...f, passkey: e.target.value }))
              }
              placeholder={isConfigured ? '•••••••• (saved)' : 'Paste your passkey'}
              disabled={readonly || saving}
              autoComplete="off"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              <Hash size={11} /> Shortcode
            </label>
            <input
              type="text"
              className={styles.input}
              value={form.shortcode}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  shortcode: e.target.value.replace(/\D/g, ''),
                }))
              }
              placeholder="e.g. 174379"
              disabled={readonly || saving}
              maxLength={7}
            />
            <p className={styles.hint}>
              Your Paybill or Till number. Sandbox: <code>174379</code>.
            </p>
          </div>
        </div>

        {/* Callback URL — informational, when configured */}
        {isConfigured && callbackUrl && (
          <div className={styles.callbackBox}>
            <div className={styles.callbackLabel}>
              Callback URL (for Safaricom portal, if required)
            </div>
            <code className={styles.callbackUrl}>{callbackUrl}</code>
          </div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleSave}
            disabled={readonly || saving}
          >
            {saving ? (
              <Loader2 size={14} className={styles.spin} />
            ) : (
              <Save size={14} />
            )}
            <span>{saving ? 'Saving…' : 'Save Credentials'}</span>
          </button>

          {isConfigured && (
            <>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleTest}
                disabled={readonly || testing}
              >
                {testing ? (
                  <Loader2 size={14} className={styles.spin} />
                ) : (
                  <RefreshCw size={14} />
                )}
                <span>{testing ? 'Testing…' : 'Test Connection'}</span>
              </button>

              <button
                type="button"
                className={styles.dangerBtn}
                onClick={handleDelete}
                disabled={readonly || deleting}
              >
                {deleting ? (
                  <Loader2 size={14} className={styles.spin} />
                ) : (
                  <Trash2 size={14} />
                )}
                <span>Remove</span>
              </button>
            </>
          )}
        </div>

        {/* Test result banner */}
        {testResult && (
          <div
            className={
              testResult.ok ? styles.successBox : styles.errorBox
            }
          >
            {testResult.ok ? <Check size={14} /> : <AlertCircle size={14} />}
            <span>{testResult.message}</span>
          </div>
        )}

        {/* Last tested info */}
        {config?.lastTestedAt && (
          <p className={styles.lastTested}>
            Last tested: {new Date(config.lastTestedAt).toLocaleString()} ·{' '}
            <strong>{config.lastTestResult}</strong>
          </p>
        )}
      </section>

      {readonly && (
        <div className={styles.readonlyBanner}>
          <AlertCircle size={14} />
          <span>
            Only the organization owner can configure M-Pesa.
          </span>
        </div>
      )}
    </div>
  );
};

// ─── Status pill ───
const StatusPill = ({ isConfigured, lastTestResult }) => {
  if (!isConfigured) {
    return (
      <span className={`${styles.pill} ${styles.pillNeutral}`}>
        Not configured
      </span>
    );
  }
  if (lastTestResult === 'OK') {
    return (
      <span className={`${styles.pill} ${styles.pillSuccess}`}>
        <Check size={11} /> Connected
      </span>
    );
  }
  if (lastTestResult === 'FAILED') {
    return (
      <span className={`${styles.pill} ${styles.pillDanger}`}>
        <AlertCircle size={11} /> Test failed
      </span>
    );
  }
  return (
    <span className={`${styles.pill} ${styles.pillWarning}`}>
      Configured — untested
    </span>
  );
};

export default MpesaTab;