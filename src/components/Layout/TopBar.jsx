// src/components/Layout/TopBar.jsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../contexts/SettingsContext';
import axios from 'axios';
import {
  Bell, User, Settings, HelpCircle, LogOut,
  Menu, Moon, Sun, Building2, Check, ChevronRight,
  Wifi, WifiOff, RefreshCw, CheckCircle, XCircle, UserCircle,
  CreditCard,
} from 'lucide-react';
import styles from './TopBar.module.css';
import {
  sync,
  setOnlineStatus,
  getOnlineStatus,
} from '../../sync/engine';
import { getPendingSales } from '../../db/sqlite';
import usePolling from '../../hooks/usePolling';
import { useNotifications } from '../../hooks/useNotifications';

// ============================================================
// CONSTANTS
// ============================================================
const HEARTBEAT_URL = '/auth/me';
const HEARTBEAT_ONLINE_MS = 60000;
const HEARTBEAT_OFFLINE_MS = 15000;
const HEARTBEAT_TIMEOUT_MS = 5000;

const OFFLINE_CONFIRM_THRESHOLD = 2;

const SYNC_INTERVAL_POS_MS = 60 * 1000;
const SYNC_INTERVAL_IDLE_MS = 5 * 60 * 1000;

const SYNC_SUCCESS_LINGER_MS = 2500;
const SYNC_ERROR_LINGER_MS = 4000;

// ============================================================
// TOPBAR
// ============================================================
const TopBar = ({ isMobile, onToggleSidebar }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    user,
    logout,
    activeOrganization,
    activeBranch,
    organizations,
    branches,
    setActiveOrganization,
    setActiveBranch,
    setIsOffline: setContextIsOffline,
  } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const { settings } = useSettings();

  const {
    items: notifications,
    unreadCount,
    refresh: refreshNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotifications({
    productKey: 'kxtill',
    organizationId: activeOrganization?.id,
  });

  const allowBranchSwitch = settings?.allowBranchSwitch !== false;

  // ---------- UI state ----------
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);

  // ---------- connectivity state ----------
  const [connectionState, setConnectionState] = useState(
    getOnlineStatus() ? 'online' : 'offline'
  );

  // ---------- sync state ----------
  const [syncState, setSyncState] = useState('idle');

  const [pendingCount, setPendingCount] = useState(0);

  // ---------- refs ----------
  const userMenuRef = useRef(null);
  const notifMenuRef = useRef(null);

  const connectionRef = useRef(connectionState);
  const syncStateRef = useRef('idle');
  const activeBranchRef = useRef(activeBranch);
  const switchingBranchRef = useRef(false);

  const heartbeatInFlightRef = useRef(false);
  const failStreakRef = useRef(0);
  const syncLingerTimerRef = useRef(null);

  const isPos = location.pathname === '/pos';

  // ---------- mirror effects ----------
  useEffect(() => { connectionRef.current = connectionState; }, [connectionState]);
  useEffect(() => { syncStateRef.current = syncState; }, [syncState]);
  useEffect(() => { activeBranchRef.current = activeBranch; }, [activeBranch]);

  // ---------- click-outside ----------
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        userMenuOpen &&
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target)
      ) {
        setUserMenuOpen(false);
        setOrgDropdownOpen(false);
        setBranchDropdownOpen(false);
      }
      if (
        notifOpen &&
        notifMenuRef.current &&
        !notifMenuRef.current.contains(event.target)
      ) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen, notifOpen]);

  // ---------- escape ----------
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setUserMenuOpen(false);
        setNotifOpen(false);
        setOrgDropdownOpen(false);
        setBranchDropdownOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ---------- pending sales ----------
  const checkPendingSales = useCallback(async () => {
    try {
      const pending = await getPendingSales();
      setPendingCount(pending.length);
    } catch (err) {
      console.error('Failed to get pending sales:', err);
    }
  }, []);

  useEffect(() => {
    checkPendingSales();
  }, [connectionState, syncState, checkPendingSales]);

  // ============================================================
  // ENGINE EVENT BRIDGE
  // ============================================================
  useEffect(() => {
    const clearLinger = () => {
      if (syncLingerTimerRef.current) {
        clearTimeout(syncLingerTimerRef.current);
        syncLingerTimerRef.current = null;
      }
    };

    const onSyncStart = () => {
      clearLinger();
      setSyncState('syncing');
    };

    const onSyncComplete = (e) => {
      const detail = e?.detail;
      const failed =
        detail?.success === false ||
        (Array.isArray(detail?.errors) && detail.errors.length > 0);

      if (failed) {
        setSyncState('error');
        syncLingerTimerRef.current = setTimeout(() => {
          if (syncStateRef.current !== 'syncing') setSyncState('idle');
        }, SYNC_ERROR_LINGER_MS);
      } else {
        setSyncState('success');
        syncLingerTimerRef.current = setTimeout(() => {
          if (syncStateRef.current !== 'syncing') setSyncState('idle');
        }, SYNC_SUCCESS_LINGER_MS);
      }

      checkPendingSales();
    };

    window.addEventListener('kxtill:sync-start', onSyncStart);
    window.addEventListener('kxtill:sync-complete', onSyncComplete);
    return () => {
      clearLinger();
      window.removeEventListener('kxtill:sync-start', onSyncStart);
      window.removeEventListener('kxtill:sync-complete', onSyncComplete);
    };
  }, [checkPendingSales]);

  // ============================================================
  // HEARTBEAT
  // ============================================================
  const runHeartbeat = useCallback(async () => {
    if (heartbeatInFlightRef.current) return;
    heartbeatInFlightRef.current = true;

    try {
      await axios.get(HEARTBEAT_URL, { timeout: HEARTBEAT_TIMEOUT_MS });

      failStreakRef.current = 0;
      if (connectionRef.current !== 'online') {
        setConnectionState('online');
        setOnlineStatus(true);
        setContextIsOffline(false);
      }
    } catch (err) {
      if (err.response) {
        failStreakRef.current = 0;
        if (connectionRef.current !== 'online') {
          setConnectionState('online');
          setOnlineStatus(true);
          setContextIsOffline(false);
        }
        return;
      }

      failStreakRef.current += 1;
      if (
        connectionRef.current !== 'offline' &&
        failStreakRef.current >= OFFLINE_CONFIRM_THRESHOLD
      ) {
        setConnectionState('offline');
        setOnlineStatus(false);
        setContextIsOffline(true);
      }
    } finally {
      heartbeatInFlightRef.current = false;
    }
  }, [setContextIsOffline]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId;

    const tick = async () => {
      if (cancelled) return;
      await runHeartbeat();
      if (cancelled) return;
      const interval =
        connectionRef.current === 'online'
          ? HEARTBEAT_ONLINE_MS
          : HEARTBEAT_OFFLINE_MS;
      timeoutId = setTimeout(tick, interval);
    };

    tick();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [runHeartbeat]);

  // ---------- browser online/offline events ----------
  useEffect(() => {
    const handleBrowserOnline = () => {
      failStreakRef.current = 0;
      setConnectionState('online');
      setOnlineStatus(true);
      setContextIsOffline(false);
      runHeartbeat();
    };

    const handleBrowserOffline = () => {
      failStreakRef.current = OFFLINE_CONFIRM_THRESHOLD;
      setConnectionState('offline');
      setOnlineStatus(false);
      setContextIsOffline(true);
    };

    window.addEventListener('online', handleBrowserOnline);
    window.addEventListener('offline', handleBrowserOffline);
    return () => {
      window.removeEventListener('online', handleBrowserOnline);
      window.removeEventListener('offline', handleBrowserOffline);
    };
  }, [runHeartbeat, setContextIsOffline]);

  // ============================================================
  // AUTO SYNC
  // ============================================================
  const syncInterval = isPos ? SYNC_INTERVAL_POS_MS : SYNC_INTERVAL_IDLE_MS;
  usePolling(
    () => {
      if (connectionRef.current !== 'online') return;
      if (!activeBranchRef.current?.id) return;
      if (syncStateRef.current === 'syncing') return;
      // Don't poll-sync while a manual branch switch is still settling
      if (switchingBranchRef.current) return;
      sync(activeBranchRef.current.id).catch(() => {});
    },
    syncInterval,
    [syncInterval, connectionState, activeBranch?.id]
  );

  // ---------- handlers ----------
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName || ''}`.trim()
    : user?.name || 'User';

  const orgName = activeOrganization?.name || '';
  const branchName = activeBranch?.name || '';

  const userRole = activeOrganization?.role || 'MEMBER';
  const displayRole =
    userRole === 'OWNER' || userRole === 'Owner' ? 'Owner' : 'Member';

  const handleSwitchOrg = async (org) => {
    try {
      await setActiveOrganization(org.id);
      setOrgDropdownOpen(false);
    } catch (err) {
      console.error('Failed to switch organization:', err);
    }
  };

  // FIX: await setActiveBranch (which runs resetDb via clearOfflineData)
  // BEFORE calling sync. Previously setActiveBranch was fire-and-forget and
  // sync ran concurrently with the DB reset, producing partial local state
  // (e.g. only one product landing before resetDb wiped the rest).
  const handleSwitchBranch = async (branch) => {
    if (!allowBranchSwitch) return;
    if (switchingBranchRef.current) return;
    switchingBranchRef.current = true;
    setBranchDropdownOpen(false);

    try {
      await setActiveBranch(branch);
    } catch (err) {
      console.error('Failed to switch branch:', err);
      switchingBranchRef.current = false;
      return;
    }

    try {
      await sync(branch.id);
    } catch (err) {
      // sync() reports failures via the sync-complete event; the promise
      // itself only throws on truly fatal errors, which we log here.
      console.error('Post-switch sync failed:', err);
    } finally {
      switchingBranchRef.current = false;
    }
  };

  const navigateAndClose = (path) => {
    setUserMenuOpen(false);
    setOrgDropdownOpen(false);
    setBranchDropdownOpen(false);
    navigate(path);
  };

  // ---------- status derivation ----------
  const getSyncStatusColor = () => {
    if (connectionState === 'offline') return 'offline';
    if (syncState === 'syncing') return 'sync';
    if (syncState === 'success') return 'success';
    if (syncState === 'error') return 'error';
    return 'online';
  };

  const getSyncStatusLabel = () => {
    if (connectionState === 'offline') return 'Offline';
    if (syncState === 'syncing') return 'Syncing...';
    if (syncState === 'success') return 'Synced';
    if (syncState === 'error') return 'Sync failed';
    return 'Online';
  };

  const handleSyncButtonClick = useCallback(async () => {
    if (connectionRef.current === 'offline') {
      await runHeartbeat();
      if (connectionRef.current === 'offline') return;
    }
    if (!activeBranchRef.current?.id) return;
    if (syncStateRef.current === 'syncing') return;
    if (switchingBranchRef.current) return;
    sync(activeBranchRef.current.id).catch(() => {});
  }, [runHeartbeat]);

  // ---------- notifications content ----------
  const getNotificationContent = () => {
    const items = [];

    if (pendingCount > 0) {
      items.push({
        id: 'pending-sales',
        icon: <RefreshCw size={15} />,
        title: `${pendingCount} sale${pendingCount > 1 ? 's' : ''} pending sync`,
        desc:
          connectionState === 'online'
            ? 'Click sync to upload'
            : 'Will sync when online',
        type: 'pending',
      });
    }

    notifications.forEach((n) => {
      items.push({
        id: n.id,
        icon: <Bell size={15} />,
        title: n.title,
        desc: n.message,
        type: 'backend',
        notificationId: n.id,
        read: Boolean(n.readAt),
      });
    });

    if (items.length === 0) {
      items.push({
        id: 'empty',
        icon: null,
        title: 'No notifications',
        desc: 'All caught up',
        type: 'empty',
      });
    }

    return items;
  };

  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  const showOrgSwitcher = organizations && organizations.length > 0;
  const showBranchSwitcher =
    allowBranchSwitch && branches && branches.length > 0;
  const showOrgSection = showOrgSwitcher || showBranchSwitcher;

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <header className={styles.topBar}>
      <div className={styles.leftGroup}>
        {isMobile && (
          <button
            className={styles.menuButton}
            onClick={onToggleSidebar}
            aria-label="Toggle menu"
          >
            <Menu size={18} />
          </button>
        )}

        <div className={styles.logo}>
          <img
            src="/assets/logo5.png"
            alt="KxTill Logo"
            className={styles.logoImage}
          />
          <span className={styles.logoText}>KXTILL</span>
        </div>

        {(orgName || branchName) && (
          <div className={styles.orgInfo}>
            <Building2 size={14} className={styles.orgIcon} />
            <span className={styles.orgText}>
              {orgName}
              {branchName && (
                <>
                  <span className={styles.orgSeparator}>•</span>
                  <span className={styles.branchText}>{branchName}</span>
                </>
              )}
            </span>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <div className={styles.syncIndicator} title={getSyncStatusLabel()}>
          <button
            className={`${styles.syncBtn} ${styles[getSyncStatusColor()]}`}
            onClick={handleSyncButtonClick}
            disabled={syncState === 'syncing'}
            aria-label="Sync now"
          >
            {syncState === 'syncing' ? (
              <RefreshCw size={16} className={styles.spinning} />
            ) : syncState === 'success' ? (
              <CheckCircle size={16} />
            ) : syncState === 'error' ? (
              <XCircle size={16} />
            ) : connectionState === 'online' ? (
              <Wifi size={16} />
            ) : (
              <WifiOff size={16} />
            )}
          </button>
          <span
            className={`${styles.syncStatusText} ${styles[getSyncStatusColor()]}`}
          >
            {getSyncStatusLabel()}
            {pendingCount > 0 && syncState !== 'syncing' && (
              <span className={styles.pendingBadge}>{pendingCount}</span>
            )}
          </span>
        </div>

        <button
          className={styles.iconBtn}
          onClick={toggleTheme}
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle theme"
        >
          {darkMode ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {/* Notifications */}
        <div className={styles.dropdownWrap} ref={notifMenuRef}>
          <button
            className={styles.iconBtn}
            onClick={() => {
              setNotifOpen((v) => !v);
              if (!notifOpen) refreshNotifications();
            }}
            title="Notifications"
            aria-expanded={notifOpen}
          >
            <Bell size={17} />
            {unreadCount > 0 && (
              <span className={styles.notifBadge}>{unreadCount}</span>
            )}
          </button>

          {notifOpen && (
            <div className={styles.notifMenu}>
              <div className={styles.notifHeader}>
                <span>Notifications</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {unreadCount > 0 && (
                    <button
                      className={styles.notifMarkAll}
                      onClick={markAllAsRead}
                    >
                      Mark all read
                    </button>
                  )}
                  {pendingCount > 0 && connectionState === 'online' && (
                    <button
                      className={styles.notifMarkAll}
                      onClick={handleSyncButtonClick}
                      disabled={syncState === 'syncing'}
                    >
                      Sync now
                    </button>
                  )}
                </div>
              </div>
              <div className={styles.notifList}>
                {getNotificationContent().map((item) => (
                  <div
                    key={item.id}
                    className={`${styles.notifItem} ${
                      item.type === 'pending' ? styles.pendingItem : ''
                    } ${
                      item.type === 'backend' && !item.read
                        ? styles.notifUnread
                        : ''
                    }`}
                    onClick={() => {
                      if (item.type === 'backend' && !item.read) {
                        markAsRead(item.notificationId);
                      }
                    }}
                    style={
                      item.type === 'backend' ? { cursor: 'pointer' } : undefined
                    }
                  >
                    {item.icon && (
                      <span
                        className={
                          item.type === 'pending'
                            ? styles.notifIconPending
                            : styles.notifIconLowStock
                        }
                      >
                        {item.icon}
                      </span>
                    )}
                    <div>
                      <div className={styles.notifTitle}>{item.title}</div>
                      <div className={styles.notifDesc}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className={styles.dropdownWrap} ref={userMenuRef}>
          <button
            className={styles.userBtn}
            onClick={() => setUserMenuOpen((v) => !v)}
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
          >
            <span className={styles.userAvatarSmall}>
              {initials || <User size={14} />}
            </span>
            <span className={styles.userName}>{displayName}</span>
          </button>

          {userMenuOpen && (
            <div className={styles.userMenu} role="menu">
              <div className={styles.userInfo}>
                <div className={styles.userAvatarLarge}>
                  {initials || <User size={22} />}
                </div>
                <div className={styles.userInfoText}>
                  <div className={styles.userNameFull}>{displayName}</div>
                  <div className={styles.userEmail}>{user?.email}</div>
                  <div className={styles.userRole}>{displayRole}</div>
                </div>
              </div>

              <div className={styles.divider} />

              <div className={styles.menuSectionLabel}>Account</div>

              <button
                className={styles.menuItem}
                role="menuitem"
                onClick={() => navigateAndClose('/account')}
              >
                <UserCircle size={15} />
                My Account
              </button>
              <button
                className={styles.menuItem}
                role="menuitem"
                onClick={() => navigateAndClose('/account?tab=preferences')}
              >
                <Settings size={15} />
                Preferences
              </button>
              <button
                className={styles.menuItem}
                role="menuitem"
                onClick={() => navigateAndClose('/support')}
              >
                <HelpCircle size={15} />
                Help &amp; Support
              </button>
              <button
                className={styles.menuItem}
                role="menuitem"
                onClick={() => navigateAndClose('/billing')}
              >
                <CreditCard size={15} />
                Billing &amp; Subscription
              </button>

              {showOrgSection && (
                <>
                  <div className={styles.divider} />
                  <div className={styles.menuSectionLabel}>Organization</div>
                </>
              )}

              {showOrgSwitcher && (
                <div className={styles.switcherSection}>
                  <div
                    className={styles.switcherHeader}
                    onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
                  >
                    <Building2 size={14} />
                    <span>Org</span>
                    <span className={styles.switcherCurrent}>
                      {activeOrganization?.name || 'Select'}
                    </span>
                    <ChevronRight
                      size={14}
                      className={`${styles.switcherChevron} ${
                        orgDropdownOpen ? styles.open : ''
                      }`}
                    />
                  </div>
                  {orgDropdownOpen && (
                    <div className={styles.switcherList}>
                      {organizations.map((org) => (
                        <button
                          key={org.id}
                          className={`${styles.switcherOption} ${
                            activeOrganization?.id === org.id
                              ? styles.active
                              : ''
                          }`}
                          onClick={() => handleSwitchOrg(org)}
                        >
                          <span className={styles.switcherOptionName}>
                            {org.name}
                          </span>
                          {activeOrganization?.id === org.id && (
                            <Check size={14} className={styles.checkIcon} />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {showBranchSwitcher && (
                <div className={styles.switcherSection}>
                  <div
                    className={styles.switcherHeader}
                    onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
                  >
                    <Building2 size={14} />
                    <span>Branch</span>
                    <span className={styles.switcherCurrent}>
                      {activeBranch?.name || 'Select'}
                    </span>
                    <ChevronRight
                      size={14}
                      className={`${styles.switcherChevron} ${
                        branchDropdownOpen ? styles.open : ''
                      }`}
                    />
                  </div>
                  {branchDropdownOpen && (
                    <div className={styles.switcherList}>
                      {branches.map((branch) => (
                        <button
                          key={branch.id}
                          className={`${styles.switcherOption} ${
                            activeBranch?.id === branch.id ? styles.active : ''
                          }`}
                          onClick={() => handleSwitchBranch(branch)}
                        >
                          <span className={styles.switcherOptionName}>
                            {branch.name}
                          </span>
                          {activeBranch?.id === branch.id && (
                            <Check size={14} className={styles.checkIcon} />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className={styles.divider} />

              <button
                className={styles.menuItemLogout}
                role="menuitem"
                onClick={handleLogout}
              >
                <LogOut size={15} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopBar;