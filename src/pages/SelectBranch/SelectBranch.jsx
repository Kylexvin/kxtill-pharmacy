// src/pages/SelectBranch/SelectBranch.jsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  MapPin, 
  Check, 
  Plus,
  ChevronRight, 
  ArrowLeft, 
  Store,
  LogOut,
  AlertCircle,
  Search,
  Crown
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { showToast } from '../../components/Common/Toast';
import { initializeKxTill } from '../../initializer';
import styles from './SelectBranch.module.css';

// Logo URL
const LOGO_URL = 'https://res.cloudinary.com/dkahrnjrn/image/upload/v1788695499/logo.png';

// API error helper
function getErrorMessage(error, fallback) {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || error.response?.data?.error || fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return fallback;
}

// ============================================================
// TOOLTIP COMPONENT
// ============================================================
const Tooltip = ({ children, content, position = 'top' }) => {
  const [show, setShow] = useState(false);
  
  return (
    <div 
      className={styles.tooltipWrapper} 
      onMouseEnter={() => setShow(true)} 
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className={`${styles.tooltip} ${styles[position]}`}>
          {content}
        </div>
      )}
    </div>
  );
};

// ============================================================
// CONFIRMATION DIALOG COMPONENT (Sweet Alert Style)
// ============================================================
const ConfirmationDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel',
  type = 'warning'
}) => {
  if (!isOpen) return null;

  const getIconColor = () => {
    switch(type) {
      case 'danger': return '#ef5350';
      case 'warning': return '#d9a84e';
      case 'info': return '#4caf82';
      default: return '#d9a84e';
    }
  };

  const getIconBg = () => {
    switch(type) {
      case 'danger': return 'rgba(239, 83, 80, 0.15)';
      case 'warning': return 'rgba(217, 168, 78, 0.15)';
      case 'info': return 'rgba(76, 175, 130, 0.15)';
      default: return 'rgba(217, 168, 78, 0.15)';
    }
  };

  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.dialogIcon} style={{ background: getIconBg() }}>
          <AlertCircle size={28} color={getIconColor()} />
        </div>
        <h3 className={styles.dialogTitle}>{title}</h3>
        <p className={styles.dialogMessage}>{message}</p>
        <div className={styles.dialogActions}>
          <button 
            className={styles.dialogCancel} 
            onClick={onClose}
          >
            {cancelText}
          </button>
          <button 
            className={`${styles.dialogConfirm} ${styles[type]}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// SKELETON LOADER COMPONENTS
// ============================================================
const SkeletonBranchCard = () => (
  <div className={styles.branchItem} style={{ pointerEvents: 'none', cursor: 'default' }}>
    <div className={styles.skeletonAvatar} style={{ width: '40px', height: '40px' }} />
    <div className={styles.branchInfo}>
      <div className={styles.skeletonText} style={{ width: '60%', height: '18px' }} />
      <div className={styles.skeletonText} style={{ width: '40%', height: '14px' }} />
    </div>
    <div className={styles.skeletonChevron} style={{ width: '20px', height: '20px' }} />
  </div>
);

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function SelectBranchPage() {
  const navigate = useNavigate();
  const { 
    user, 
    activeOrganization, 
    activeBranch,
    setActiveBranch,
    setBranches,
    isLoading, 
    logout,
    isAuthenticated
  } = useAuth();

  const [branchesState, setBranchesState] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [redirecting, setRedirecting] = useState(false);
  const [query, setQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({ name: '', address: '', phone: '' });

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    type: 'warning',
    onConfirm: null
  });

  const hasLoaded = useRef(false);

  // ============================================================
  // AUTH CHECK — redirect if not authenticated
  // ============================================================
  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  // ============================================================
  // CHECK ACTIVE ORGANIZATION
  // ============================================================
  useEffect(() => {
    if (!activeOrganization && !isLoading && isAuthenticated) {
      navigate('/select-org', { replace: true });
    }
  }, [activeOrganization, isLoading, isAuthenticated, navigate]);

  // ============================================================
  // LOAD BRANCHES
  // ============================================================
  useEffect(() => {
    let mounted = true;

    const fetchBranches = async () => {
      if (hasLoaded.current) return;
      if (!activeOrganization) return;

      try {
        setLoading(true);
        setError('');
        
        const response = await axios.get(
          `/organizations/${activeOrganization.id}/branches/my`
        );
        
        if (!mounted) return;
        
        const branchList = response.data.branches || [];
        setBranchesState(branchList);
        setBranches(branchList);
        
        // Check if there's an active branch already set
        if (activeBranch) {
          setSelectedId(activeBranch.id);
        } else {
          // Find default or first active branch
          const defaultBranch = branchList.find(b => b.isDefault === true);
          if (defaultBranch) {
            setSelectedId(defaultBranch.id);
          } else if (branchList.length > 0) {
            const activeBranchItem = branchList.find(b => b.isActive !== false);
            if (activeBranchItem) {
              setSelectedId(activeBranchItem.id);
            }
          }
        }
        
        setLoading(false);
        hasLoaded.current = true;
      } catch (err) {
        if (!mounted) return;
        const message = getErrorMessage(err, 'Failed to load branches');
        setError(message);
        showToast.error(message);
        setLoading(false);
      }
    };

    fetchBranches();

    return () => {
      mounted = false;
    };
  }, [activeOrganization, setBranches, activeBranch]);

  // ============================================================
  // HANDLERS
  // ============================================================

  const showConfirmation = useCallback(({ title, message, confirmText, cancelText, type, onConfirm }) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      confirmText: confirmText || 'Confirm',
      cancelText: cancelText || 'Cancel',
      type: type || 'warning',
      onConfirm: onConfirm || (() => {})
    });
  }, []);

  const closeConfirmation = useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleLogout = useCallback(() => {
    showConfirmation({
      title: 'Logout Confirmation',
      message: 'Are you sure you want to logout? You will need to login again to access your organizations.',
      confirmText: 'Logout',
      cancelText: 'Stay',
      type: 'danger',
      onConfirm: () => {
        logout();
        navigate('/login', { replace: true });
      }
    });
  }, [logout, navigate, showConfirmation]);

  const handleSelect = useCallback(async (branch) => {
    if (!branch.isActive) {
      showToast.error('This branch is inactive');
      return;
    }

    setSelectedId(branch.id);
    setRedirecting(true);
    
    try {
      await setActiveBranch(branch);
      await initializeKxTill(activeOrganization.id);
      showToast.success(`Selected ${branch.name}`);
      navigate('/pos');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to select branch');
      showToast.error(message);
      setRedirecting(false);
    }
  }, [setActiveBranch, activeOrganization, navigate]);

  const handleBack = useCallback(() => {
    navigate('/select-org');
  }, [navigate]);

  const handleCreateChange = useCallback((e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }, []);

  const handleCreateSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    setCreating(true);

    try {
      const response = await axios.post(
        `/organizations/${activeOrganization.id}/branches`,
        {
          name: formData.name,
          address: formData.address,
          phone: formData.phone,
          isActive: true
        }
      );

      const { branch } = response.data;
      
      setBranchesState((prev) => [...prev, branch]);
      setBranches([...branchesState, branch]);
      
      showToast.success(`"${branch.name}" created successfully!`);

      setFormData({ name: '', address: '', phone: '' });
      setShowCreateForm(false);
      
      // Auto-select the new branch
      setSelectedId(branch.id);
      setRedirecting(true);
      await setActiveBranch(branch);
      await initializeKxTill(activeOrganization.id);
      navigate('/pos');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to create branch');
      showToast.error(message);
      setCreating(false);
    }
  }, [formData, activeOrganization, setActiveBranch, navigate, setBranches, branchesState]);

  const getStatusBadge = (branch) => {
    if (branch.isDefault) {
      return (
        <span className={styles.badgeDefault}>
          <Crown size={11} />
          Default
        </span>
      );
    }
    if (branch.isActive === false) {
      return <span className={styles.badgeInactive}>Inactive</span>;
    }
    return null;
  };

  const filteredBranches = useMemo(() => {
    if (!query.trim()) return branchesState;
    const q = query.trim().toLowerCase();
    return branchesState.filter((branch) => 
      branch.name.toLowerCase().includes(q) ||
      (branch.address && branch.address.toLowerCase().includes(q))
    );
  }, [branchesState, query]);

  // ============================================================
  // LOADING / SKELETON STATES
  // ============================================================

  if (isLoading || loading) {
    return (
      <div className={styles.page}>
        <div className={styles.glowAmber} />
        <div className={styles.glowMoss} />
        <div className={styles.glassCard}>
          {/* Brand + user skeleton */}
          <div className={styles.cardTopRow}>
            <div className={styles.brand}>
              <div className={styles.skeletonAvatar} style={{ width: '32px', height: '32px', borderRadius: '8px' }} />
              <div className={styles.skeletonText} style={{ width: '60px' }} />
            </div>
            <div className={styles.userChip}>
              <div className={styles.skeletonAvatar} style={{ width: '22px', height: '22px' }} />
              <div className={styles.skeletonText} style={{ width: '60px' }} />
            </div>
          </div>

          {/* Header skeleton */}
          <div className={styles.header}>
            <div className={styles.skeletonAvatar} style={{ width: '40px', height: '40px', borderRadius: '12px' }} />
            <div className={styles.headerContent}>
              <div className={styles.skeletonText} style={{ width: '150px', height: '24px', marginBottom: '8px' }} />
              <div className={styles.skeletonText} style={{ width: '200px', height: '16px' }} />
            </div>
          </div>

          {/* Search bar skeleton */}
          <div className={styles.searchRow}>
            <div className={styles.searchBar} style={{ border: 'none', background: 'var(--bg)' }}>
              <div className={styles.skeletonText} style={{ width: '100%', height: '20px' }} />
            </div>
            <div className={styles.skeletonAvatar} style={{ width: '40px', height: '40px', borderRadius: '13px' }} />
          </div>

          {/* Branch cards skeleton */}
          <div className={styles.list}>
            {[1, 2, 3, 4].map((i) => (
              <SkeletonBranchCard key={i} />
            ))}
          </div>

          {/* Logout button skeleton */}
          <div className={styles.skeletonAvatar} style={{ 
            position: 'absolute', 
            right: '20px', 
            bottom: '18px',
            width: '34px', 
            height: '34px', 
            borderRadius: '11px' 
          }} />
        </div>
      </div>
    );
  }

  if (redirecting) {
    return (
      <div className={styles.page}>
        <div className={styles.glowAmber} />
        <div className={styles.glowMoss} />
        <div className={styles.loadingCard}>
          <div className={styles.spinner} />
          <p>Loading branch...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, show nothing (will redirect via useEffect)
  if (!isAuthenticated) {
    return null;
  }

  const initial = user?.firstName?.charAt(0).toUpperCase() || 
                  user?.name?.charAt(0).toUpperCase() || '?';

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className={styles.page}>
      <div className={styles.glowAmber} />
      <div className={styles.glowMoss} />

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={confirmDialog.isOpen}
        onClose={closeConfirmation}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        type={confirmDialog.type}
      />

      <div className={styles.glassCard}>
        {/* ===== brand + user, always visible ===== */}
        <div className={styles.cardTopRow}>
          <div className={styles.brand}>
            <img 
              src={LOGO_URL} 
              alt="KXBYTE Logo" 
              className={styles.logoImage}
              onError={(e) => {
                e.target.style.display = 'none';
                const fallback = e.target.nextElementSibling;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
            <span className={styles.logoFallback} style={{ display: 'none' }}>K</span>
            <span className={styles.brandName}>KXBYTE</span>
          </div>
          <div className={styles.userChip}>
            <div className={styles.avatar}>{initial}</div>
            <span className={styles.userNameText}>
              {user?.firstName || user?.name || 'User'}
            </span>
          </div>
        </div>

        {showCreateForm ? (
          // ===== CREATE BRANCH =====
          <div className={styles.createWrap}>
            <div className={styles.createIconWrap}>
              <Plus size={18} />
            </div>
            <h1 className={styles.title}>Add a Branch</h1>
            <p className={styles.subtitle}>
              Create a new branch location for {activeOrganization?.name}
            </p>

            <div className={styles.createCard}>
              {error && <div className={styles.error}>{error}</div>}

              <form onSubmit={handleCreateSubmit} className={styles.form}>
                <div className={styles.formGroup}>
                  <label htmlFor="name">Branch name *</label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={formData.name}
                    onChange={handleCreateChange}
                    placeholder="e.g. Nairobi CBD"
                    required
                    disabled={creating}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="address">Address</label>
                  <input
                    id="address"
                    name="address"
                    type="text"
                    value={formData.address}
                    onChange={handleCreateChange}
                    placeholder="e.g. Kenyatta Avenue, Nairobi"
                    disabled={creating}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="phone">Phone number</label>
                  <input
                    id="phone"
                    name="phone"
                    type="text"
                    value={formData.phone}
                    onChange={handleCreateChange}
                    placeholder="e.g. +254 700 123456"
                    disabled={creating}
                  />
                </div>

                <button type="submit" className={styles.submitBtn} disabled={creating}>
                  {creating ? (
                    <>
                      <span className={styles.spinnerSmall} />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Create Branch
                    </>
                  )}
                </button>
              </form>

              <button
                className={styles.backBtn}
                onClick={() => setShowCreateForm(false)}
                disabled={creating}
              >
                ← Back to branches
              </button>
            </div>
          </div>
        ) : (
          // ===== BRANCH LIST =====
          <>
            <div className={styles.header}>
              <button className={styles.backButton} onClick={handleBack}>
                <ArrowLeft size={20} />
              </button>
              <div className={styles.headerContent}>
                <div className={styles.iconWrapper}>
                  <MapPin size={22} />
                </div>
                <div>
                  <h1 className={styles.title}>Select Branch</h1>
                  {activeOrganization && (
                    <p className={styles.subtitle}>
                      {activeOrganization.name}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div className={styles.error}>
                <AlertCircle size={16} />
                <span>{error}</span>
                <button 
                  className={styles.retryBtn}
                  onClick={() => window.location.reload()}
                >
                  Retry
                </button>
              </div>
            )}

            {/* search + quick add */}
            <div className={styles.searchRow}>
              <div className={styles.searchBar}>
                <Search size={15} className={styles.searchIcon} />
                <input
                  className={styles.searchInput}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search branches..."
                />
              </div>
              <Tooltip content="Create a new branch">
                <button
                  className={styles.addIconBtn}
                  onClick={() => setShowCreateForm(true)}
                  title="New branch"
                  type="button"
                >
                  <Plus size={18} />
                </button>
              </Tooltip>
            </div>

            <div className={styles.list}>
              {filteredBranches.length === 0 ? (
                <div className={styles.emptyState}>
                  <Store size={48} />
                  <h3>No branches found</h3>
                  <p>
                    {query 
                      ? `No branches match "${query}"` 
                      : "You don't have access to any branches in this organization."}
                  </p>
                  {branchesState.length === 0 && (
                    <button 
                      className={styles.createBranchBtn}
                      onClick={() => setShowCreateForm(true)}
                    >
                      <Plus size={16} />
                      Create your first branch
                    </button>
                  )}
                </div>
              ) : (
                filteredBranches.map((branch) => (
                  <Tooltip
                    key={branch.id}
                    content={branch.isActive === false ? 'Branch is inactive' : 'Click to access this branch'}
                  >
                    <button
                      className={`${styles.branchItem} ${selectedId === branch.id ? styles.selected : ''}`}
                      onClick={() => handleSelect(branch)}
                      disabled={branch.isActive === false || redirecting}
                    >
                      <div className={styles.branchIcon}>
                        <MapPin size={18} />
                      </div>
                      <div className={styles.branchInfo}>
                        <div className={styles.branchNameRow}>
                          <span className={styles.branchName}>{branch.name}</span>
                          {getStatusBadge(branch)}
                        </div>
                        {branch.address && (
                          <span className={styles.branchAddress}>{branch.address}</span>
                        )}
                        {branch.phone && (
                          <span className={styles.branchPhone}>{branch.phone}</span>
                        )}
                      </div>
                      <div className={styles.branchAction}>
                        {selectedId === branch.id ? (
                          <Check size={20} className={styles.checkIcon} />
                        ) : (
                          <ChevronRight size={20} className={styles.chevronIcon} />
                        )}
                      </div>
                    </button>
                  </Tooltip>
                ))
              )}
            </div>

            {/* Branch count */}
            {branchesState.length > 0 && (
              <div className={styles.branchCount}>
                <span>{branchesState.length} branch{branchesState.length > 1 ? 'es' : ''} available</span>
              </div>
            )}
          </>
        )}

        {/* logout — pinned bottom-right corner */}
        <Tooltip content="Logout">
          <button className={styles.logoutCorner} onClick={handleLogout} title="Log out" type="button">
            <LogOut size={15} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}