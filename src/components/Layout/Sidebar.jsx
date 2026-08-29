import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Receipt, Undo2, Package, BarChart3, Settings,
  LogOut, ChevronDown, ShoppingCart, Users, Building2, 
  Globe, ExternalLink, UserCog
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Sidebar.module.css';

const Sidebar = ({ collapsed, isMobile, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const [inventoryOpen, setInventoryOpen] = useState(true);
  const [customersOpen, setCustomersOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    if (isMobile && onClose) onClose();
  };

  const isInventoryActive = location.pathname === '/inventory' || 
                           location.pathname === '/transfers' ||
                           location.pathname.startsWith('/inventory/');

  const isCustomersActive = location.pathname === '/customers' || 
                           location.pathname === '/customer-groups' ||
                           location.pathname.startsWith('/customers/');

  const isStaffActive = location.pathname === '/staff' || 
                       location.pathname === '/roles' ||
                       location.pathname.startsWith('/staff/');

  const handleVisitSuite = () => {
    const suiteUrl = process.env.REACT_APP_SUITE_URL || 'https://suite.kxbyte.com';
    const token = localStorage.getItem('accessToken');
    if (token) {
      window.open(`${suiteUrl}?sso_token=${token}`, '_blank');
    } else {
      window.open(suiteUrl, '_blank');
    }
  };

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''} ${isMobile ? styles.mobile : ''}`}>
      {isMobile && <div className={styles.mobileSpacer} />}

      <nav className={styles.nav}>
        <NavLink to="/pos" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`} onClick={handleNavClick}>
          <ShoppingCart size={16} className={styles.navIcon} /> <span className={styles.navLabel}>POS</span>
        </NavLink>
        
        <NavLink to="/dashboard" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`} onClick={handleNavClick}>
          <LayoutDashboard size={16} className={styles.navIcon} /> <span className={styles.navLabel}>Overview</span>
        </NavLink>
        
        <NavLink to="/sales" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`} onClick={handleNavClick}>
          <Receipt size={16} className={styles.navIcon} /> <span className={styles.navLabel}>Sales</span>
        </NavLink>
        
        <NavLink to="/refunds" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`} onClick={handleNavClick}>
          <Undo2 size={16} className={styles.navIcon} /> <span className={styles.navLabel}>Refunds</span>
        </NavLink>

        {/* Inventory - Expandable */}
        <div>
          <button className={`${styles.navLinkExpandable} ${isInventoryActive ? styles.navLinkActive : ''}`} onClick={() => setInventoryOpen(!inventoryOpen)}>
            <span className={styles.navLinkExpandableLabel}>
              <Package size={16} className={styles.navIcon} /> <span className={styles.navLabel}>Inventory</span>
            </span>
            <ChevronDown size={13} className={styles.chevron} data-open={inventoryOpen} />
          </button>
          {inventoryOpen && !collapsed && (
            <div className={styles.subNav}>
              <NavLink to="/inventory" className={({ isActive }) => `${styles.subLink} ${isActive ? styles.subLinkActive : ''}`} onClick={handleNavClick}>
                Overview
              </NavLink>
              <NavLink to="/transfers" className={({ isActive }) => `${styles.subLink} ${isActive ? styles.subLinkActive : ''}`} onClick={handleNavClick}>
                Stock Transfers
              </NavLink>
            </div>
          )}
        </div>

        {/* Customers - Expandable */}
        <div>
          <button className={`${styles.navLinkExpandable} ${isCustomersActive ? styles.navLinkActive : ''}`} onClick={() => setCustomersOpen(!customersOpen)}>
            <span className={styles.navLinkExpandableLabel}>
              <Users size={16} className={styles.navIcon} /> <span className={styles.navLabel}>Customers</span>
            </span>
            <ChevronDown size={13} className={styles.chevron} data-open={customersOpen} />
          </button>
          {customersOpen && !collapsed && (
            <div className={styles.subNav}>
              <NavLink to="/customers" className={({ isActive }) => `${styles.subLink} ${isActive ? styles.subLinkActive : ''}`} onClick={handleNavClick}>
                All Customers
              </NavLink>
              <NavLink to="/customer-groups" className={({ isActive }) => `${styles.subLink} ${isActive ? styles.subLinkActive : ''}`} onClick={handleNavClick}>
                Groups
              </NavLink>
            </div>
          )}
        </div>

        {/* Staff/Team - Expandable */}
        <div>
          <button className={`${styles.navLinkExpandable} ${isStaffActive ? styles.navLinkActive : ''}`} onClick={() => setStaffOpen(!staffOpen)}>
            <span className={styles.navLinkExpandableLabel}>
              <UserCog size={16} className={styles.navIcon} /> <span className={styles.navLabel}>Staff</span>
            </span>
            <ChevronDown size={13} className={styles.chevron} data-open={staffOpen} />
          </button>
          {staffOpen && !collapsed && (
            <div className={styles.subNav}>
              <NavLink to="/staff" className={({ isActive }) => `${styles.subLink} ${isActive ? styles.subLinkActive : ''}`} onClick={handleNavClick}>
                All Staff
              </NavLink>
              <NavLink to="/roles" className={({ isActive }) => `${styles.subLink} ${isActive ? styles.subLinkActive : ''}`} onClick={handleNavClick}>
                Roles & Permissions
              </NavLink>
            </div>
          )}
        </div>

        <NavLink to="/branches" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`} onClick={handleNavClick}>
          <Building2 size={16} className={styles.navIcon} /> <span className={styles.navLabel}>Branches</span>
        </NavLink>

        <NavLink to="/reports" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`} onClick={handleNavClick}>
          <BarChart3 size={16} className={styles.navIcon} /> <span className={styles.navLabel}>Reports</span>
        </NavLink>
        
        <NavLink to="/settings" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`} onClick={handleNavClick}>
          <Settings size={16} className={styles.navIcon} /> <span className={styles.navLabel}>Settings</span>
        </NavLink>
      </nav>

      <div className={styles.spacer} />

      <div className={styles.divider} />

      {/* Visit Suite Button */}
      <button className={styles.suiteRow} onClick={handleVisitSuite} title="Visit KXBYTE Suite">
        <Globe size={15} />
        <span className={styles.navLabel}>Visit Suite</span>
        <ExternalLink size={12} className={styles.externalIcon} />
      </button>

      <button className={styles.logoutRow} onClick={handleLogout} title="Logout">
        <LogOut size={15} />
        <span className={styles.navLabel}>Logout</span>
      </button>
    </aside>
  );
};

export default Sidebar;