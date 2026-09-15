// src/pages/Account/Account.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  UserCircle, Settings, Shield, Lock, Mail, User as UserIcon,
  Loader2, Eye, EyeOff, Check, Trash2, Globe, Monitor,
  LogOut, RefreshCw, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Account.module.css';

const TABS = [
  { key: 'profile',     label: 'Profile',     icon: UserCircle },
  { key: 'preferences', label: 'Preferences', icon: Settings },
  { key: 'security',    label: 'Security',    icon: Shield },
];

// ============================================================
// PROFILE TAB
// ============================================================
const ProfileTab = () => {
  const { user, activeOrganization, refreshUser } = useAuth();

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFirstName(user?.firstName || '');
    setLastName(user?.lastName || '');
  }, [user]);

  const isDirty =
    firstName !== (user?.firstName || '') ||
    lastName !== (user?.lastName || '');

  const displayName = `${firstName} ${lastName}`.trim() || user?.name || 'User';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  const handleSave = async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      await axios.patch('/auth/me', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      await refreshUser();
      toast.success('Profile updated');
    } catch (err) {
      toast.error(
        err.response?.data?.error ||
          err.response?.data?.message ||
          'Failed to update profile'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setFirstName(user?.firstName || '');
    setLastName(user?.lastName || '');
  };

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>Profile</h2>
          <p className={styles.cardHint}>
            Your personal information. Only you can edit this.
          </p>
        </div>
      </div>

      <div className={styles.profileHead}>
        <div className={styles.avatarLarge}>
          {initials || <UserIcon size={28} />}
        </div>
        <div className={styles.profileHeadText}>
          <div className={styles.profileName}>{displayName}</div>
          <div className={styles.profileEmail}>{user?.email || '—'}</div>
        </div>
      </div>

      <div className={styles.formRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="firstName">First name</label>
          <input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={styles.input}
            placeholder="e.g. Jane"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="lastName">Last name</label>
          <input
            id="lastName"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={styles.input}
            placeholder="e.g. Doe"
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>Email address</label>
        <div className={styles.fieldReadonly}>
          <Mail size={14} />
          <span>{user?.email || '—'}</span>
          <span className={styles.lockedTag}>Read-only</span>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>Role</label>
        <div className={styles.fieldReadonly}>
          <Shield size={14} />
          <span>
            {activeOrganization?.role === 'OWNER' ? 'Owner' : 'Member'}
          </span>
          <span className={styles.lockedTag}>Set by organization</span>
        </div>
      </div>

      {isDirty && (
        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleDiscard}
            disabled={saving}
          >
            Discard
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 size={14} className={styles.spinning} /> : <Check size={14} />}
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      )}
    </section>
  );
};

// ============================================================
// PREFERENCES TAB
// ============================================================
const PreferencesTab = () => (
  <section className={styles.card}>
    <div className={styles.cardHeader}>
      <div>
        <h2 className={styles.cardTitle}>Preferences</h2>
        <p className={styles.cardHint}>
          Personal preferences and app defaults.
        </p>
      </div>
    </div>

    <div className={styles.emptyBlock}>
      <Settings size={28} />
      <h3>Coming soon</h3>
      <p>
        User-level preferences — default landing page, language, notification
        opt-ins — will live here. Theme is controlled from the top bar.
      </p>
    </div>
  </section>
);

// ============================================================
// SECURITY TAB
// ============================================================
const SecurityTab = () => {
  const { logoutAllDevices } = useAuth();

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submittingPassword, setSubmittingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const resetPasswordForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setPasswordError('');
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Please fill in all fields');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('New password must be different from current');
      return;
    }

    setSubmittingPassword(true);
    try {
      await axios.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      toast.success('Password changed successfully');
      resetPasswordForm();
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to change password';
      setPasswordError(msg);
    } finally {
      setSubmittingPassword(false);
    }
  };

  // Sessions
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState(null);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const response = await axios.get('/auth/sessions');
      setSessions(response.data?.sessions || []);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRevoke = async (sessionId) => {
    if (revokingId) return;
    setRevokingId(sessionId);
    try {
      await axios.delete(`/auth/sessions/${sessionId}`);
      toast.success('Session revoked');
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      toast.error(
        err.response?.data?.error ||
          err.response?.data?.message ||
          'Failed to revoke session'
      );
    } finally {
      setRevokingId(null);
    }
  };

  const handleLogoutAll = async () => {
    if (loggingOutAll) return;
    if (!window.confirm('Log out of all devices? You will need to sign in again.')) {
      return;
    }
    setLoggingOutAll(true);
    try {
      await logoutAllDevices();
      // logoutAllDevices in AuthContext clears state and redirects
    } catch (err) {
      toast.error('Failed to log out');
      setLoggingOutAll(false);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  };

  return (
    <>
      {/* Password section */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Change password</h2>
            <p className={styles.cardHint}>
              Update your password. You'll stay logged in on this device.
            </p>
          </div>
        </div>

        <form onSubmit={handleChangePassword}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="currentPassword">
              Current password
            </label>
            <div className={styles.passwordWrap}>
              <Lock size={14} className={styles.passwordIcon} />
              <input
                id="currentPassword"
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={styles.inputPassword}
                placeholder="Enter current password"
                autoComplete="current-password"
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowCurrent((v) => !v)}
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="newPassword">
              New password
            </label>
            <div className={styles.passwordWrap}>
              <Lock size={14} className={styles.passwordIcon} />
              <input
                id="newPassword"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={styles.inputPassword}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowNew((v) => !v)}
                tabIndex={-1}
              >
                {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="confirmPassword">
              Confirm new password
            </label>
            <div className={styles.passwordWrap}>
              <Lock size={14} className={styles.passwordIcon} />
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={styles.inputPassword}
                placeholder="Repeat new password"
                autoComplete="new-password"
              />
            </div>
          </div>

          {passwordError && (
            <div className={styles.errorBanner}>
              <AlertCircle size={14} />
              <span>{passwordError}</span>
            </div>
          )}

          <div className={styles.formActions}>
            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={submittingPassword}
            >
              {submittingPassword ? (
                <Loader2 size={14} className={styles.spinning} />
              ) : (
                <Lock size={14} />
              )}
              {submittingPassword ? 'Updating...' : 'Update password'}
            </button>
          </div>
        </form>
      </section>

      {/* Sessions section */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Active sessions</h2>
            <p className={styles.cardHint}>
              Devices currently signed in to your account.
            </p>
          </div>
          <button
            type="button"
            className={styles.iconRefreshBtn}
            onClick={fetchSessions}
            disabled={sessionsLoading}
            title="Refresh sessions"
          >
            <RefreshCw size={14} className={sessionsLoading ? styles.spinning : ''} />
          </button>
        </div>

        {sessionsLoading ? (
          <div className={styles.sessionsEmpty}>
            <Loader2 size={20} className={styles.spinning} />
            <span>Loading sessions...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className={styles.sessionsEmpty}>
            <Monitor size={24} />
            <span>No active sessions</span>
          </div>
        ) : (
          <div className={styles.sessionsList}>
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`${styles.sessionRow} ${
                  !s.isActive ? styles.sessionRowInactive : ''
                }`}
              >
                <div className={styles.sessionIcon}>
                  <Globe size={16} />
                </div>
                <div className={styles.sessionInfo}>
                  <div className={styles.sessionDevice}>
                    {s.userAgent ? shortUserAgent(s.userAgent) : 'Unknown device'}
                  </div>
                  <div className={styles.sessionMeta}>
                    <span>{s.ipAddress || '—'}</span>
                    <span>·</span>
                    <span>Last active {formatDate(s.createdAt)}</span>
                    {!s.isActive && (
                      <>
                        <span>·</span>
                        <span className={styles.sessionInactiveTag}>Revoked</span>
                      </>
                    )}
                  </div>
                </div>
                {s.isActive && (
                  <button
                    type="button"
                    className={styles.sessionRevokeBtn}
                    onClick={() => handleRevoke(s.id)}
                    disabled={revokingId === s.id}
                    title="Revoke this session"
                  >
                    {revokingId === s.id ? (
                      <Loader2 size={14} className={styles.spinning} />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className={styles.dangerZone}>
          <div className={styles.dangerText}>
            <LogOut size={14} />
            <div>
              <div className={styles.dangerTitle}>Log out everywhere</div>
              <div className={styles.dangerHint}>
                Ends all sessions, including this one.
              </div>
            </div>
          </div>
          <button
            type="button"
            className={styles.dangerBtn}
            onClick={handleLogoutAll}
            disabled={loggingOutAll}
          >
            {loggingOutAll ? (
              <Loader2 size={14} className={styles.spinning} />
            ) : (
              <LogOut size={14} />
            )}
            {loggingOutAll ? 'Logging out...' : 'Log out all'}
          </button>
        </div>
      </section>
    </>
  );
};

// Small helper to shorten "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ..." to something readable.
const shortUserAgent = (ua) => {
  if (!ua) return 'Unknown device';
  if (/edg/i.test(ua)) return 'Microsoft Edge';
  if (/chrome|crios/i.test(ua) && !/edg/i.test(ua)) return 'Chrome';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) return 'Safari';
  return ua.slice(0, 40);
};

// ============================================================
// MAIN PAGE
// ============================================================
const Account = () => {
  const { activeOrganization } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = searchParams.get('tab') || 'profile';
  const [tab, setTab] = useState(
    TABS.some((t) => t.key === initialTab) ? initialTab : 'profile'
  );

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'profile') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div>
            <h1 className={styles.title}>My Account</h1>
            <p className={styles.subtitle}>
              Manage your profile, preferences, and security
              {activeOrganization?.name && (
                <>
                  <span className={styles.sep}>•</span>
                  {activeOrganization.name}
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className={styles.tabs}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className={`${styles.tab} ${tab === key ? styles.tabActive : ''}`}
            onClick={() => setTab(key)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {tab === 'profile' && <ProfileTab />}
        {tab === 'preferences' && <PreferencesTab />}
        {tab === 'security' && <SecurityTab />}
      </div>
    </div>
  );
};

export default Account;