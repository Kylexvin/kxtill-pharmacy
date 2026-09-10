// src/pages/Account/Account.jsx
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserCircle, Settings, Shield, Lock, Mail, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Account.module.css';

const TABS = [
  { key: 'profile',     label: 'Profile',     icon: UserCircle },
  { key: 'preferences', label: 'Preferences', icon: Settings },
  { key: 'security',    label: 'Security',    icon: Shield },
];

const Account = () => {
  const { user, activeOrganization } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = searchParams.get('tab') || 'profile';
  const [tab, setTab] = useState(
    TABS.some((t) => t.key === initialTab) ? initialTab : 'profile'
  );

  // Keep URL in sync with tab
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'profile') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName || ''}`.trim()
    : user?.name || 'User';

  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.avatar}>
            {initials || <UserIcon size={22} />}
          </div>
          <div>
            <h1 className={styles.title}>My Account</h1>
            <p className={styles.subtitle}>
              Manage your profile and preferences
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
        {tab === 'profile' && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Profile</h2>
            <p className={styles.cardHint}>
              Your personal information. Only you can edit these.
            </p>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Full name</label>
              <div className={styles.fieldValue}>
                <UserIcon size={14} />
                {displayName}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Email address</label>
              <div className={styles.fieldValue}>
                <Mail size={14} />
                {user?.email || '—'}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Role</label>
              <div className={styles.fieldValue}>
                <Shield size={14} />
                {activeOrganization?.role === 'OWNER' ? 'Owner' : 'Member'}
              </div>
            </div>

            <div className={styles.notice}>
              Editable profile fields coming soon.
            </div>
          </section>
        )}

        {tab === 'preferences' && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Preferences</h2>
            <p className={styles.cardHint}>
              Personal preferences. Theme currently lives in the top bar.
            </p>

            <div className={styles.notice}>
              Preferences coming soon — language, timezone, notification
              settings, and default landing page.
            </div>
          </section>
        )}

        {tab === 'security' && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Security</h2>
            <p className={styles.cardHint}>
              Password and session management.
            </p>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Password</label>
              <div className={styles.fieldValue}>
                <Lock size={14} />
                Last changed: unknown
              </div>
            </div>

            <div className={styles.notice}>
              Change password and active sessions coming soon.
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default Account;