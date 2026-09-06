// src/components/layout/TopBar.jsx

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import axios from 'axios';
import {
  Bell, User, Settings, HelpCircle, LogOut, AlertTriangle,
  Menu, Moon, Sun, Building2, Check, ChevronRight,
  Wifi, WifiOff, RefreshCw, CheckCircle, XCircle
} from 'lucide-react';
import styles from './TopBar.module.css';
import { sync } from '../../sync/engine';
import { getPendingSales } from '../../db/sqlite';

const HEARTBEAT_URL = '/auth/me';
const HEARTBEAT_INTERVAL_MS = 20000;
const HEARTBEAT_TIMEOUT_MS = 5000;

const TopBar = ({ isMobile, onToggleSidebar }) => {
  const navigate = useNavigate();
  const {
    user,
    logout,
    activeOrganization,
    activeBranch,
    organizations,
    branches,
    setActiveOrganization,
    setActiveBranch
  } = useAuth();
  const { darkMode, toggleTheme } = useTheme();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);

  const [isOnline, setIsOnline] = useState(true);
  const [checkingConnectivity, setCheckingConnectivity] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncStatus, setLastSyncStatus] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  const userMenuRef = useRef(null);
  const notifMenuRef = useRef(null);

  const isSyncingRef = useRef(isSyncing);
  const activeBranchRef = useRef(activeBranch);
  const heartbeatInFlightRef = useRef(false);

  useEffect(() => {
    isSyncingRef.current = isSyncing;
  }, [isSyncing]);

  useEffect(() => {
    activeBranchRef.current = activeBranch;
  }, [activeBranch]);

  const lowStockCount = 0;

  // Check pending sales count
  const checkPendingSales = useCallback(async () => {
    try {
      const pending = await getPendingSales();
      setPendingCount(pending.length);
    } catch (err) {
      console.error('Failed to get pending sales:', err);
    }
  }, []);

  // Check pending on mount and when online status changes
  useEffect(() => {
    checkPendingSales();
  }, [isOnline, lastSyncStatus, checkPendingSales]);

  const handleManualSync = useCallback(async () => {
    if (isSyncingRef.current) return;

    setIsSyncing(true);
    setLastSyncStatus(null);

    try {
      const result = await sync(activeBranchRef.current?.id);
      setLastSyncStatus(result.success ? 'success' : 'error');
      // Refresh pending count after sync
      await checkPendingSales();
    } catch (error) {
      setLastSyncStatus('error');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setLastSyncStatus(null), 3000);
    }
  }, [checkPendingSales]);

  const checkConnectivity = useCallback(async () => {
    if (heartbeatInFlightRef.current) return;
    heartbeatInFlightRef.current = true;
    setCheckingConnectivity(true);

    try {
      await axios.get(HEARTBEAT_URL, { timeout: HEARTBEAT_TIMEOUT_MS });
      setIsOnline(true);
    } catch (err) {
      if (err.response) {
        setIsOnline(true);
      } else {
        setIsOnline(false);
      }
    } finally {
      heartbeatInFlightRef.current = false;
      setCheckingConnectivity(false);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
        setOrgDropdownOpen(false);
        setBranchDropdownOpen(false);
      }
      if (notifMenuRef.current && !notifMenuRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    checkConnectivity();

    const interval = setInterval(checkConnectivity, HEARTBEAT_INTERVAL_MS);

    const handleBrowserOnline = () => {
      checkConnectivity();
    };
    const handleBrowserOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleBrowserOnline);
    window.addEventListener('offline', handleBrowserOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleBrowserOnline);
      window.removeEventListener('offline', handleBrowserOffline);
    };
  }, [checkConnectivity]);

  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (!wasOnlineRef.current && isOnline) {
      handleManualSync();
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline, handleManualSync]);

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
  const displayRole = userRole === 'OWNER' || userRole === 'Owner' ? 'Owner' : 'Member';

  const handleSwitchOrg = async (org) => {
    try {
      await setActiveOrganization(org.id);
      setOrgDropdownOpen(false);
    } catch (err) {
      console.error('Failed to switch organization:', err);
    }
  };

  const handleSwitchBranch = (branch) => {
    setActiveBranch(branch);
    setBranchDropdownOpen(false);
  };

  const getSyncStatusColor = () => {
    if (isSyncing) return 'sync';
    if (lastSyncStatus === 'success') return 'success';
    if (lastSyncStatus === 'error') return 'error';
    if (checkingConnectivity) return 'sync';
    return isOnline ? 'online' : 'offline';
  };

  const getSyncStatusLabel = () => {
    if (isSyncing) return 'Syncing...';
    if (lastSyncStatus === 'success') return 'Synced';
    if (lastSyncStatus === 'error') return 'Sync failed';
    if (checkingConnectivity) return 'Checking...';
    return isOnline ? 'Online' : 'Offline';
  };

  const handleSyncButtonClick = () => {
    checkConnectivity().then(() => {
      if (isOnline) handleManualSync();
    });
  };

  // Notification content - includes pending sales
  const getNotificationContent = () => {
    const items = [];

    if (pendingCount > 0) {
      items.push({
        id: 'pending-sales',
        icon: <RefreshCw size={15} />,
        title: `${pendingCount} sale${pendingCount > 1 ? 's' : ''} pending sync`,
        desc: isOnline ? 'Click sync to upload' : 'Will sync when online',
        type: 'pending'
      });
    }

    if (lowStockCount > 0) {
      items.push({
        id: 'low-stock',
        icon: <AlertTriangle size={15} />,
        title: 'Low Stock Alert',
        desc: `${lowStockCount} items below minimum stock`,
        type: 'warning'
      });
    }

    if (items.length === 0) {
      items.push({
        id: 'empty',
        icon: null,
        title: 'No notifications',
        desc: 'All caught up',
        type: 'empty'
      });
    }

    return items;
  };

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
            src="/assets/logo3.png"
            alt="KxTill Logo"
            className={styles.logoImage}
          />
          <span className={styles.logoText}>KxTill</span>
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
            disabled={isSyncing || checkingConnectivity}
            aria-label="Sync now"
          >
            {isSyncing || checkingConnectivity ? (
              <RefreshCw size={16} className={styles.spinning} />
            ) : lastSyncStatus === 'success' ? (
              <CheckCircle size={16} />
            ) : lastSyncStatus === 'error' ? (
              <XCircle size={16} />
            ) : isOnline ? (
              <Wifi size={16} />
            ) : (
              <WifiOff size={16} />
            )}
          </button>
          <span className={`${styles.syncStatusText} ${styles[getSyncStatusColor()]}`}>
            {getSyncStatusLabel()}
            {pendingCount > 0 && !isSyncing && (
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

        <div className={styles.dropdownWrap} ref={notifMenuRef}>
          <button
            className={styles.iconBtn}
            onClick={() => setNotifOpen((v) => !v)}
            title="Notifications"
          >
            <Bell size={17} />
            {pendingCount > 0 && <span className={styles.notifBadge}>{pendingCount}</span>}
          </button>

          {notifOpen && (
            <div className={styles.notifMenu}>
              <div className={styles.notifHeader}>
                <span>Notifications</span>
                {pendingCount > 0 && isOnline && (
                  <button 
                    className={styles.notifMarkAll} 
                    onClick={handleSyncButtonClick}
                    disabled={isSyncing}
                  >
                    Sync now
                  </button>
                )}
              </div>
              <div className={styles.notifList}>
                {getNotificationContent().map((item) => (
                  <div key={item.id} className={`${styles.notifItem} ${item.type === 'pending' ? styles.pendingItem : ''}`}>
                    {item.icon && (
                      <span className={item.type === 'pending' ? styles.notifIconPending : styles.notifIconLowStock}>
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

        <div className={styles.dropdownWrap} ref={userMenuRef}>
          <button
            className={styles.userBtn}
            onClick={() => setUserMenuOpen((v) => !v)}
          >
            <User size={16} className={styles.userIcon} />
            <span className={styles.userName}>{displayName}</span>
          </button>

          {userMenuOpen && (
            <div className={styles.userMenu}>
              <div className={styles.userInfo}>
                <div className={styles.userAvatarLarge}>
                  <User size={24} />
                </div>
                <div className={styles.userInfoText}>
                  <div className={styles.userNameFull}>{displayName}</div>
                  <div className={styles.userEmail}>{user?.email}</div>
                  <div className={styles.userRole}>{displayRole}</div>
                </div>
              </div>

              <div className={styles.divider} />

              {organizations && organizations.length > 0 && (
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
                    <ChevronRight size={14} className={`${styles.switcherChevron} ${orgDropdownOpen ? styles.open : ''}`} />
                  </div>
                  {orgDropdownOpen && (
                    <div className={styles.switcherList}>
                      {organizations.map((org) => (
                        <button
                          key={org.id}
                          className={`${styles.switcherOption} ${activeOrganization?.id === org.id ? styles.active : ''}`}
                          onClick={() => handleSwitchOrg(org)}
                        >
                          <span className={styles.switcherOptionName}>{org.name}</span>
                          {activeOrganization?.id === org.id && (
                            <Check size={14} className={styles.checkIcon} />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {branches && branches.length > 0 && (
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
                    <ChevronRight size={14} className={`${styles.switcherChevron} ${branchDropdownOpen ? styles.open : ''}`} />
                  </div>
                  {branchDropdownOpen && (
                    <div className={styles.switcherList}>
                      {branches.map((branch) => (
                        <button
                          key={branch.id}
                          className={`${styles.switcherOption} ${activeBranch?.id === branch.id ? styles.active : ''}`}
                          onClick={() => handleSwitchBranch(branch)}
                        >
                          <span className={styles.switcherOptionName}>{branch.name}</span>
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
                className={styles.menuItem}
                onClick={() => navigate('/settings')}
              >
                <User size={15} />
                My Profile
              </button>
              <button
                className={styles.menuItem}
                onClick={() => navigate('/settings')}
              >
                <Settings size={15} />
                Settings
              </button>
              <button
                className={styles.menuItem}
                onClick={() => navigate('/help')}
              >
                <HelpCircle size={15} />
                Help & Support
              </button>

              <div className={styles.divider} />

              <button className={styles.menuItemLogout} onClick={handleLogout}>
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