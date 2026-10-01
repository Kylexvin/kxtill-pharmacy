// src/components/Layout/Sidebar.jsx
import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Receipt, Undo2, Package, BarChart3, Settings,
  LogOut, ChevronDown, ShoppingCart, Users, Building2,
  Globe, ExternalLink, UserCog, Clock,
} from 'lucide-react';
import axios from 'axios';
import { showToast } from '../Common/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { KXTILL, PLATFORM } from '../../constants/permissions';
import styles from './Sidebar.module.css';

const Sidebar = ({ collapsed, isMobile, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { can, canAny } = usePermissions();

  // ---------- permissions ----------
  const showPos           = can(KXTILL.SALES.CREATE);
  const showSales         = can(KXTILL.SALES.VIEW);
  const showRefunds       = can(KXTILL.SALES.REFUND);
  const showCustomers     = can(PLATFORM.CUSTOMERS.VIEW);

  const showKxTillStaff   = can(PLATFORM.MEMBERS.VIEW);

  const showProducts      = can(KXTILL.INVENTORY.VIEW);
  const showGlobalInv     = can(KXTILL.INVENTORY.GLOBAL_VIEW);
  const showTransfers     = canAny([
    KXTILL.INVENTORY.TRANSFERS.CREATE,
    KXTILL.INVENTORY.TRANSFERS.APPROVE,
    KXTILL.INVENTORY.TRANSFERS.COMPLETE,
  ]);
  const showInventoryGroup = showProducts || showGlobalInv || showTransfers;

  const showBranches      = canAny([PLATFORM.BRANCHES.VIEW, PLATFORM.BRANCHES.MANAGE]);
  const showReports       = can(KXTILL.REPORTS.VIEW);
  const showSettings      = can(KXTILL.SETTINGS.VIEW);

  // ---------- route matching ----------
  const path = location.pathname;

  const isInventoryActive =
    path === '/inventory' ||
    path === '/global-inventory' ||
    path === '/transfers' ||
    path.startsWith('/inventory/') ||
    path.startsWith('/global-inventory/') ||
    path.startsWith('/transfers/');

  // ---------- open/close state ----------
  const [openGroup, setOpenGroup] = useState(null);

  useEffect(() => {
    if (isInventoryActive) setOpenGroup('inventory');
    else setOpenGroup(null);
  }, [isInventoryActive]);

  const toggleGroup = (group) => {
    setOpenGroup((current) => (current === group ? null : group));
  };

  const inventoryOpen = openGroup === 'inventory';

  // ---------- handlers ----------
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    if (isMobile && onClose) onClose();
  };

  const handleVisitSuite = async () => {
    const suiteUrl = 'https://suite.kxbyte.co.ke';
    try {
      const { data } = await axios.post('/auth/sso/mint', { target: 'suite' });
      const ssoUrl = `${suiteUrl}/sso?code=${encodeURIComponent(data.code)}`;
      window.open(ssoUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Failed to open Suite:', err);
      showToast.error('Failed to open Suite. Please try again.');
    }
  };

  // ---------- link class helpers ----------
  const navLinkClass = ({ isActive }) =>
    `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`;
  const subLinkClass = ({ isActive }) =>
    `${styles.subLink} ${isActive ? styles.subLinkActive : ''}`;

  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''} ${
        isMobile ? styles.mobile : ''
      }`}
    >
      {isMobile && <div className={styles.mobileSpacer} />}

      <nav className={styles.nav}>
        <NavLink to="/dashboard" className={navLinkClass} onClick={handleNavClick}>
          <LayoutDashboard size={16} className={styles.navIcon} />
          <span className={styles.navLabel}>Overview</span>
        </NavLink>

        {showPos && (
          <NavLink to="/pos" className={navLinkClass} onClick={handleNavClick}>
            <ShoppingCart size={16} className={styles.navIcon} />
            <span className={styles.navLabel}>POS</span>
          </NavLink>
        )}

        <NavLink to="/shifts" className={navLinkClass} onClick={handleNavClick}>
          <Clock size={16} className={styles.navIcon} />
          <span className={styles.navLabel}>Shifts</span>
        </NavLink>

        {showSales && (
          <NavLink to="/sales" className={navLinkClass} onClick={handleNavClick}>
            <Receipt size={16} className={styles.navIcon} />
            <span className={styles.navLabel}>Sales</span>
          </NavLink>
        )}

        {showRefunds && (
          <NavLink to="/refunds" className={navLinkClass} onClick={handleNavClick}>
            <Undo2 size={16} className={styles.navIcon} />
            <span className={styles.navLabel}>Refunds</span>
          </NavLink>
        )}

        {showCustomers && (
          <NavLink to="/customers" className={navLinkClass} onClick={handleNavClick}>
            <Users size={16} className={styles.navIcon} />
            <span className={styles.navLabel}>Customers</span>
          </NavLink>
        )}

        {/* Inventory */}
        {showInventoryGroup && (
          <div>
            <button
              type="button"
              className={`${styles.navLinkExpandable} ${
                isInventoryActive ? styles.navLinkActive : ''
              }`}
              onClick={() => toggleGroup('inventory')}
            >
              <span className={styles.navLinkExpandableLabel}>
                <Package size={16} className={styles.navIcon} />
                <span className={styles.navLabel}>Inventory</span>
              </span>
              <ChevronDown
                size={13}
                className={styles.chevron}
                data-open={inventoryOpen}
              />
            </button>
            {inventoryOpen && !collapsed && (
              <div className={styles.subNav}>
                {showProducts && (
                  <NavLink
                    to="/inventory"
                    className={subLinkClass}
                    onClick={handleNavClick}
                  >
                    Products
                  </NavLink>
                )}
                {showGlobalInv && (
                  <NavLink
                    to="/global-inventory"
                    className={subLinkClass}
                    onClick={handleNavClick}
                  >
                    Global Inventory
                  </NavLink>
                )}
                {showTransfers && (
                  <NavLink
                    to="/transfers"
                    className={subLinkClass}
                    onClick={handleNavClick}
                  >
                    Stock Transfers
                  </NavLink>
                )}
              </div>
            )}
          </div>
        )}

        {showKxTillStaff && (
          <NavLink
            to="/kxtill/staff"
            className={navLinkClass}
            onClick={handleNavClick}
          >
            <UserCog size={16} className={styles.navIcon} />
            <span className={styles.navLabel}>KxTill Staff</span>
          </NavLink>
        )}

        {showBranches && (
          <NavLink to="/branches" className={navLinkClass} onClick={handleNavClick}>
            <Building2 size={16} className={styles.navIcon} />
            <span className={styles.navLabel}>Branches</span>
          </NavLink>
        )}

        {showReports && (
          <NavLink to="/reports" className={navLinkClass} onClick={handleNavClick}>
            <BarChart3 size={16} className={styles.navIcon} />
            <span className={styles.navLabel}>Reports</span>
          </NavLink>
        )}

        {showSettings && (
          <NavLink to="/settings" className={navLinkClass} onClick={handleNavClick}>
            <Settings size={16} className={styles.navIcon} />
            <span className={styles.navLabel}>Settings</span>
          </NavLink>
        )}
      </nav>

      <div className={styles.spacer} />

      <div className={styles.divider} />

      <button
        className={styles.suiteRow}
        onClick={handleVisitSuite}
        title="Visit KXBYTE Suite"
        type="button"
      >
        <Globe size={15} />
        <span className={styles.navLabel}>Visit Suite</span>
        <ExternalLink size={12} className={styles.externalIcon} />
      </button>

      <button
        className={styles.logoutRow}
        onClick={handleLogout}
        title="Logout"
        type="button"
      >
        <LogOut size={15} />
        <span className={styles.navLabel}>Logout</span>
      </button>
    </aside>
  );
};

export default Sidebar;