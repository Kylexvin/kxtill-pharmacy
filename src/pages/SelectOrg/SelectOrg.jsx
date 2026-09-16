// src/pages/SelectOrg/SelectOrg.jsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  Building2, 
  Check, 
  X, 
  Plus, 
  Crown, 
  Mail, 
  Rocket, 
  RefreshCw, 
  LogOut, 
  Search, 
  ChevronRight,
  AlertCircle,
  Bell
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { showToast } from '../../components/Common/Toast';
import { initializeKxTill } from '../../initializer';
import styles from './SelectOrg.module.css';

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
  type = 'warning' // 'warning', 'danger', 'info'
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
const SkeletonOrganizationCard = () => (
  <div className={styles.orgCardNeo} style={{ pointerEvents: 'none' }}>
    <div className={styles.skeletonAvatar} />
    <div className={styles.orgMeta}>
      <div className={styles.skeletonText} style={{ width: '70%' }} />
      <div className={styles.skeletonText} style={{ width: '40%' }} />
    </div>
    <div className={styles.skeletonBadge} />
    <div className={styles.skeletonChevron} />
  </div>
);

const SkeletonInviteCard = () => (
  <div className={styles.inviteCard} style={{ pointerEvents: 'none' }}>
    <div className={styles.inviteTop}>
      <div className={styles.skeletonAvatar} style={{ width: '30px', height: '30px' }} />
      <div className={styles.inviteInfo}>
        <div className={styles.skeletonText} style={{ width: '60%' }} />
        <div className={styles.skeletonText} style={{ width: '40%' }} />
      </div>
    </div>
    <div className={styles.inviteActions}>
      <div className={styles.skeletonButton} />
      <div className={styles.skeletonButton} />
    </div>
  </div>
);

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function SelectOrganizationPage() {
  const navigate = useNavigate();
  const {
    user,
    organizations,
    setActiveOrganization,
    addOrganization,
    isLoading,
    logout,
    isAuthenticated,
  } = useAuth();

  const [pendingInvites, setPendingInvites] = useState([]);
  const [archivedOrgs, setArchivedOrgs] = useState([]);
  const [restoring, setRestoring] = useState(null);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({ name: '', country: 'KE' });
  const [redirecting, setRedirecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  
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
  const redirectingRef = useRef(false);

  // ============================================================
  // AUTH CHECK — redirect to login if not authenticated
  // ============================================================
  useEffect(() => {
    // If not authenticated and not loading, redirect to login
    if (!isAuthenticated && !isLoading) {
      console.log('User not authenticated, redirecting to login');
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  // ============================================================
  // LOAD DATA — ONLY ONCE, but ALWAYS resolve `loading`
  // ============================================================
  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      if (!user) return;

      // Already loaded once — skip the fetch but resolve loading so the
      // auto-redirect effect below can run.
      if (hasLoaded.current) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        const [orgsRes, invitesRes, archivedRes] = await Promise.all([
          axios.get('/organizations').catch(() => ({ data: { organizations: [] } })),
          axios.get('/invitations/my').catch(() => ({ data: { invitations: [] } })),
          axios.get('/organizations/archived').catch(() => ({ data: { organizations: [] } })),
        ]);

        if (!mounted) return;

        const freshInvites = (invitesRes.data.invitations || []).filter(
          (inv) => inv.status === 'PENDING'
        );
        
        setPendingInvites(freshInvites);
        setArchivedOrgs(archivedRes.data.organizations || []);

        // Check if organizations array exists from response
        const orgs = orgsRes.data.organizations || [];
        
        if (orgs.length === 0 && freshInvites.length === 0) {
          setShowCreateForm(true);
        }

        setLoading(false);
        hasLoaded.current = true;
      } catch (err) {
        console.error('Failed to load data:', err);
        
        // If it's a 401, AuthContext should handle it, but just in case
        if (err.response?.status === 401) {
          navigate('/login', { replace: true });
          return;
        }
        
        showToast.error('Could not load your organizations');
        setShowCreateForm(true);
        setLoading(false);
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [user, navigate]);

  // ============================================================
  // AUTO-REDIRECT — when only one organization and no other items
  // ============================================================
  useEffect(() => {
    if (redirectingRef.current || loading) return;
    if (!user) return;
    
    if (organizations.length === 1 && pendingInvites.length === 0 && archivedOrgs.length === 0) {
      const org = organizations[0];
      redirectingRef.current = true;
      setRedirecting(true);
      
      setActiveOrganization(org.id)
        .then(async () => {
          await initializeKxTill(org.id);
          navigate('/select-branch');
        })
        .catch((err) => {
          console.error('Auto-redirect failed:', err);
          redirectingRef.current = false;
          setRedirecting(false);
          showToast.error('Failed to load organization');
        });
    }
  }, [organizations, pendingInvites, archivedOrgs, loading, user, setActiveOrganization, navigate]);

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

  const handleSelect = useCallback(async (orgId) => {
    setError('');
    setRedirecting(true);
    try {
      const org = organizations.find((o) => o.id === orgId);
      if (!org) {
        showToast.error('Organization not found');
        setRedirecting(false);
        return;
      }

      await setActiveOrganization(orgId);
      await initializeKxTill(orgId);
      navigate('/select-branch');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to select organization');
      showToast.error(message);
      console.error(err);
      setRedirecting(false);
    }
  }, [organizations, setActiveOrganization, navigate]);

  const handleRestoreOrganization = useCallback(async (orgId) => {
    setRestoring(orgId);
    try {
      await axios.patch(`/organizations/${orgId}/restore`);
      
      setArchivedOrgs((prev) => prev.filter((org) => org.id !== orgId));
      
      showToast.success('Organization restored successfully!');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to restore organization');
      showToast.error(message);
      console.error(err);
    } finally {
      setRestoring(null);
    }
  }, []);

  const handleAcceptInvite = useCallback(async (token) => {
    setError('');
    try {
      await axios.post('/invitations/accept', { token });
      
      const remainingInvites = pendingInvites.filter((inv) => inv.token !== token);
      setPendingInvites(remainingInvites);
      setShowCreateForm(false);
      
      showToast.success('Invitation accepted!');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to accept invitation');
      showToast.error(message);
      console.error(err);
    }
  }, [pendingInvites]);

  const handleRejectInvite = useCallback(async (token) => {
    showConfirmation({
      title: 'Decline Invitation',
      message: 'Are you sure you want to decline this organization invitation? This action cannot be undone.',
      confirmText: 'Decline',
      cancelText: 'Keep Invitation',
      type: 'warning',
      onConfirm: async () => {
        try {
          await axios.post('/invitations/reject', { token });
          const remainingInvites = pendingInvites.filter((inv) => inv.token !== token);
          setPendingInvites(remainingInvites);
          
          if (organizations.length === 0 && remainingInvites.length === 0) {
            setShowCreateForm(true);
          }
          
          showToast.info('Invitation declined');
        } catch (err) {
          const message = getErrorMessage(err, 'Failed to reject invitation');
          showToast.error(message);
          console.error(err);
        }
      }
    });
  }, [pendingInvites, organizations, showConfirmation]);

  const handleCreateChange = useCallback((e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }, []);

  const handleCreateSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    setCreating(true);

    try {
      const response = await axios.post('/organizations', {
        name: formData.name,
        country: formData.country,
      });

      const { organization } = response.data;

      // Keep local org list in sync so SelectOrg reflects the new org
      addOrganization(organization);

      showToast.success(`"${organization.name}" created successfully!`);

      setRedirecting(true);
      await setActiveOrganization(organization.id);
      await initializeKxTill(organization.id);
      navigate('/select-branch');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to create organization');
      showToast.error(message);
      setCreating(false);
      setRedirecting(false); // reset so we don't stay on the spinner
    }
  }, [formData, setActiveOrganization, addOrganization, navigate]);

  const getOrgRole = useCallback((org) => {
    return org.role || 'MEMBER';
  }, []);

  const filteredOrganizations = useMemo(() => {
    if (!query.trim()) return organizations;
    const q = query.trim().toLowerCase();
    return organizations.filter((org) => org.name.toLowerCase().includes(q));
  }, [organizations, query]);

  // ============================================================
  // LOADING / SKELETON STATES
  // ============================================================

  if (isLoading || loading) {
    return (
      <div className={styles.page}>
        <div className={styles.glowAmber} />
        <div className={styles.glowMoss} />
        <div className={styles.glassCard}>
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

          <div className={styles.heroText}>
            <div className={styles.skeletonText} style={{ width: '200px', height: '24px', marginBottom: '8px' }} />
            <div className={styles.skeletonText} style={{ width: '300px', height: '16px' }} />
          </div>

          <div className={styles.searchRow}>
            <div className={styles.searchBar} style={{ border: 'none', background: 'var(--bg)' }}>
              <div className={styles.skeletonText} style={{ width: '100%', height: '20px' }} />
            </div>
            <div className={styles.skeletonAvatar} style={{ width: '40px', height: '40px', borderRadius: '13px' }} />
          </div>

          <div className={styles.scrollArea}>
            <div className={styles.mainCol}>
              <section className={styles.section}>
                <div className={styles.sectionLabel}>
                  <div className={styles.skeletonText} style={{ width: '120px', height: '12px' }} />
                </div>
                <div className={styles.orgList}>
                  {[1, 2, 3, 4].map((i) => (
                    <SkeletonOrganizationCard key={i} />
                  ))}
                </div>
              </section>
            </div>
            <div className={styles.sideCol}>
              <section className={styles.section}>
                <div className={styles.sectionLabel}>
                  <div className={styles.skeletonText} style={{ width: '100px', height: '12px' }} />
                </div>
                {[1, 2].map((i) => (
                  <SkeletonInviteCard key={i} />
                ))}
              </section>
            </div>
          </div>

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
          <p>Loading organization...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const hasOrgs = organizations.length > 0;
  const hasInvites = pendingInvites.length > 0;
  const hasArchived = archivedOrgs.length > 0;
  const initial = user?.firstName?.charAt(0).toUpperCase() || user?.name?.charAt(0).toUpperCase() || '?';
  const totalNotifications = pendingInvites.length;

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className={styles.page}>
      <div className={styles.glowAmber} />
      <div className={styles.glowMoss} />

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
            {totalNotifications > 0 && (
              <Tooltip content={`${totalNotifications} pending invitation${totalNotifications > 1 ? 's' : ''}`}>
                <div className={styles.notificationBadge}>
                  <Bell size={12} />
                  <span className={styles.badgeCount}>{totalNotifications}</span>
                </div>
              </Tooltip>
            )}
          </div>
          <div className={styles.userChip}>
            <div className={styles.avatar}>{initial}</div>
            <span className={styles.userNameText}>
              {user?.firstName || user?.name || 'User'}
            </span>
          </div>
        </div>

        {showCreateForm ? (
          <div className={styles.createWrap}>
            <div className={styles.createIconWrap}>
              <Rocket size={18} />
            </div>
            <h1 className={styles.title}>Launch an organization</h1>
            <p className={styles.subtitle}>
              {hasOrgs || hasInvites
                ? 'Set up a new organization to expand your business.'
                : 'Create your first organization to get started with KXBYTE Suite.'}
            </p>

            <div className={styles.createCard}>
              {error && <div className={styles.error}>{error}</div>}

              <form onSubmit={handleCreateSubmit} className={styles.form}>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="name">Organization name</label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      value={formData.name}
                      onChange={handleCreateChange}
                      placeholder="e.g. Kamau Supermarket"
                      required
                      disabled={creating}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="country">Country</label>
                    <select
                      id="country"
                      name="country"
                      value={formData.country}
                      onChange={handleCreateChange}
                      disabled={creating}
                    >
                      <option value="KE">🇰🇪 Kenya</option>
                      <option value="UG">🇺🇬 Uganda</option>
                      <option value="TZ">🇹🇿 Tanzania</option>
                      <option value="RW">🇷🇼 Rwanda</option>
                      <option value="NG">🇳🇬 Nigeria</option>
                      <option value="ZA">🇿🇦 South Africa</option>
                    </select>
                  </div>
                </div>

                <button type="submit" className={styles.submitBtn} disabled={creating}>
                  {creating ? (
                    <>
                      <span className={styles.spinnerSmall} />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Rocket size={16} />
                      Launch Organization
                    </>
                  )}
                </button>
              </form>

              {(hasOrgs || hasInvites) && (
                <button
                  className={styles.backBtn}
                  onClick={() => setShowCreateForm(false)}
                  disabled={creating}
                >
                  ← Back to your organizations
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className={styles.heroText}>
              <h1 className={styles.title}>Select a workspace</h1>
              <p className={styles.subtitle}>Pick an organization to continue, or start a new one.</p>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.searchRow}>
              <div className={styles.searchBar}>
                <Search size={15} className={styles.searchIcon} />
                <input
                  className={styles.searchInput}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search organizations..."
                />
              </div>
              <Tooltip content="Create a new organization">
                <button
                  className={styles.addIconBtn}
                  onClick={() => setShowCreateForm(true)}
                  title="New organization"
                  type="button"
                >
                  <Plus size={18} />
                </button>
              </Tooltip>
            </div>

            <div className={styles.scrollArea}>
              <div className={styles.mainCol}>
                <section className={styles.section}>
                  <div className={styles.sectionLabel}>
                    <Building2 size={12} />
                    Your Organizations
                    {organizations.length > 0 && (
                      <span className={styles.countBadge}>{organizations.length}</span>
                    )}
                  </div>

                  <div className={styles.orgList}>
                    {filteredOrganizations.map((org) => {
                      const role = getOrgRole(org);
                      const isOwner = role === 'Owner' || role === 'OWNER';

                      return (
                        <Tooltip 
                          key={org.id} 
                          content={`${isOwner ? 'Owner' : 'Member'} • Click to access`}
                        >
                          <button
                            className={styles.orgCardNeo}
                            onClick={() => handleSelect(org.id)}
                            disabled={isLoading || redirecting}
                          >
                            <div className={styles.orgIcon}>{org.name.charAt(0).toUpperCase()}</div>
                            <div className={styles.orgMeta}>
                              <span className={styles.orgName}>{org.name}</span>
                            </div>
                            {isOwner ? (
                              <span className={styles.badgeOwner}>
                                <Crown size={11} />
                                Owner
                              </span>
                            ) : (
                              <span className={styles.badgeMember}>Member</span>
                            )}
                            <ChevronRight size={16} className={styles.chevron} />
                          </button>
                        </Tooltip>
                      );
                    })}

                    {filteredOrganizations.length === 0 && (
                      <div className={styles.emptyNote}>
                        {query ? `No organizations match "${query}"` : 'No organizations yet'}
                      </div>
                    )}

                    <Tooltip content="Start a new organization">
                      <button className={styles.addOrgCard} onClick={() => setShowCreateForm(true)}>
                        <Plus size={15} />
                        <span>New organization</span>
                      </button>
                    </Tooltip>
                  </div>
                </section>
              </div>

              {(hasInvites || hasArchived) && (
                <div className={styles.sideCol}>
                  {hasInvites && (
                    <section className={styles.section}>
                      <div className={styles.sectionLabel}>
                        <Mail size={12} />
                        Pending Invitations
                        <span className={styles.countBadge}>{pendingInvites.length}</span>
                      </div>
                      <div className={styles.inviteList}>
                        {pendingInvites.map((invite) => (
                          <div key={invite.id} className={styles.inviteCard}>
                            <div className={styles.inviteTop}>
                              <div className={styles.inviteIcon}>
                                {invite.organization.name.charAt(0).toUpperCase()}
                              </div>
                              <div className={styles.inviteInfo}>
                                <span className={styles.inviteName}>{invite.organization.name}</span>
                                <span className={styles.inviteBy}>
                                  Invited by {invite.invitedBy.firstName} {invite.invitedBy.lastName}
                                </span>
                              </div>
                            </div>
                            <div className={styles.inviteActions}>
                              <Tooltip content="Accept this invitation and join the organization">
                                <button 
                                  className={styles.acceptBtn} 
                                  onClick={() => handleAcceptInvite(invite.token)}
                                >
                                  <Check size={13} />
                                  Accept
                                </button>
                              </Tooltip>
                              <Tooltip content="Decline this invitation">
                                <button 
                                  className={styles.rejectBtn} 
                                  onClick={() => handleRejectInvite(invite.token)}
                                >
                                  <X size={13} />
                                  Decline
                                </button>
                              </Tooltip>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {hasArchived && (
                    <section className={styles.section}>
                      <div className={styles.sectionLabel}>
                        <RefreshCw size={12} />
                        Archived
                      </div>
                      <div className={styles.inviteList}>
                        {archivedOrgs.map((org) => (
                          <div key={org.id} className={`${styles.inviteCard} ${styles.archivedCard}`}>
                            <div className={styles.inviteTop}>
                              <div className={styles.inviteIcon}>{org.name.charAt(0).toUpperCase()}</div>
                              <div className={styles.inviteInfo}>
                                <span className={styles.inviteName}>{org.name}</span>
                                <span className={styles.inviteBy}>Restore to regain access</span>
                              </div>
                            </div>
                            <div className={styles.inviteActions}>
                              <Tooltip content="Restore this organization to regain access">
                                <button
                                  className={styles.restoreBtn}
                                  onClick={() => handleRestoreOrganization(org.id)}
                                  disabled={restoring === org.id}
                                >
                                  {restoring === org.id ? (
                                    <span className={styles.spinnerSmall} />
                                  ) : (
                                    <RefreshCw size={13} />
                                  )}
                                  Restore
                                </button>
                              </Tooltip>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <Tooltip content="Logout">
          <button className={styles.logoutCorner} onClick={handleLogout} title="Log out" type="button">
            <LogOut size={15} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}