import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import styles from './Layout.module.css';

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

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

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  return (
    <div className={styles.layout}>
      {/* TopBar - always visible */}
      <TopBar isMobile={isMobile} onToggleSidebar={toggleSidebar} />

      {/* Sidebar Overlay - mobile only */}
      {isMobile && (
        <div 
          className={`${styles.overlay} ${sidebarOpen ? styles.open : ''}`}
          onClick={closeSidebar}
        />
      )}
      
      {/* Sidebar */}
      <div className={`${styles.sidebarWrap} ${sidebarOpen ? styles.open : ''}`}>
        <Sidebar isMobile={isMobile} onClose={closeSidebar} />
      </div>

      {/* Main Content */}
      <div className={styles.contentWrap}>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;