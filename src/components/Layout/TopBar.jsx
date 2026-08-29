// src/components/layout/TopBar.jsx

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { 
  Bell, User, Settings, HelpCircle, LogOut, AlertTriangle, 
  Menu, Moon, Sun, Building2, Check, ChevronRight
} from 'lucide-react';
import styles from './TopBar.module.css';

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
  const userMenuRef = useRef(null);
  const notifMenuRef = useRef(null);

  const lowStockCount = 0;

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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const displayName = user?.firstName 
    ? `${user.firstName} ${user.lastName || ''}`.trim()
    : user?.name || 'User';

  const orgName = activeOrganization?.name || '';
  const branchName = activeBranch?.name || '';

  // Get role from active organization
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

  return (
    <header className={styles.topBar}>
      <div className={styles.leftGroup}>
        {/* Hamburger menu - mobile only */}
        {isMobile && (
          <button 
            className={styles.menuButton} 
            onClick={onToggleSidebar}
            aria-label="Toggle menu"
          >
            <Menu size={18} />
          </button>
        )}

        {/* Logo - Using PNG from assets */}
        <div className={styles.logo}>
          <img 
            src="/assets/logo.png" 
            alt="KxTill Logo"
            className={styles.logoImage}
          />
          <span className={styles.logoText}>KxTill</span>
        </div>

        {/* Organization & Branch - Read Only */}
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
        {/* Theme Toggle Button */}
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
            onClick={() => setNotifOpen((v) => !v)}
            title="Notifications"
          >
            <Bell size={17} />
            {lowStockCount > 0 && <span className={styles.notifBadge}>{lowStockCount}</span>}
          </button>

          {notifOpen && (
            <div className={styles.notifMenu}>
              <div className={styles.notifHeader}>
                <span>Notifications</span>
                <button className={styles.notifMarkAll}>Mark all read</button>
              </div>
              <div className={styles.notifList}>
                {lowStockCount > 0 ? (
                  <div className={styles.notifItem}>
                    <span className={styles.notifIconLowStock}>
                      <AlertTriangle size={15} />
                    </span>
                    <div>
                      <div className={styles.notifTitle}>Low Stock Alert</div>
                      <div className={styles.notifDesc}>
                        {lowStockCount} items below minimum stock
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={styles.notifEmpty}>No notifications</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
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

              {/* Organization Switcher */}
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

              {/* Branch Switcher */}
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