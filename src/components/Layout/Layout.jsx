// src/components/Layout/Layout.jsx

import React, { useState, useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import styles from './Layout.module.css';

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const { activeOrganization, fetchSettings, settings } = useAuth();
  const settingsFetched = useRef(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch settings only once when organization loads
  useEffect(() => {
    if (activeOrganization && !settingsFetched.current && !settings) {
      settingsFetched.current = true;
      fetchSettings();
    }
  }, [activeOrganization, fetchSettings, settings]);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  return (
    <div className={styles.layout}>
      <TopBar isMobile={isMobile} onToggleSidebar={toggleSidebar} />

      <div className={`${styles.sidebarWrap} ${sidebarOpen ? styles.open : ''}`}>
        <Sidebar isMobile={isMobile} onClose={closeSidebar} />
      </div>

      {isMobile && sidebarOpen && (
        <div 
          className={styles.overlay}
          onClick={closeSidebar}
        />
      )}

      <div className={styles.contentWrap}>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;