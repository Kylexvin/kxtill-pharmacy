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
  ChevronRight 
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { showToast } from '../../components/Common/Toast';
import styles from './SelectOrg.module.css';

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

export default function SelectOrganizationPage() {
  const navigate = useNavigate();
  const {
    user,
    organizations,
    setActiveOrganization,
    isLoading,
    logout,
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
  const hasLoaded = useRef(false);
  const redirectingRef = useRef(false);

  // ============================================================
  // LOAD DATA — ONLY ONCE
  // ============================================================

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      if (hasLoaded.current) return;
      if (!user) return;

      try {
        // Load organizations, invites, and archived
        const [invitesRes, archivedRes] = await Promise.all([
          axios.get('/organizations'),
          axios.get('/invitations/my').catch(() => ({ data: { invitations: [] } })),
          axios.get('/organizations/archived').catch(() => ({ data: { organizations: [] } })),
        ]);

        if (!mounted) return;

        const freshInvites = (invitesRes.data.invitations || []).filter(
          (inv) => inv.status === 'PENDING'
        );
        
        setPendingInvites(freshInvites);
        setArchivedOrgs(archivedRes.data.organizations || []);

        if (organizations.length === 0 && freshInvites.length === 0) {
          setShowCreateForm(true);
        }

        setLoading(false);
        hasLoaded.current = true;
      } catch (err) {
        console.error('Failed to load data:', err);
        showToast.error('Could not load your organizations');
        setShowCreateForm(true);
        setLoading(false);
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [user, organizations.length]);

  // ============================================================
  // AUTO-REDIRECT — when only one organization
  // ============================================================

  useEffect(() => {
    if (redirectingRef.current || loading) return;
    if (!user) return;
    
    if (organizations.length === 1 && pendingInvites.length === 0 && archivedOrgs.length === 0) {
      const org = organizations[0];
      redirectingRef.current = true;
      setRedirecting(true);
      
      setActiveOrganization(org.id)
        .then(() => {
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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
    // branches will be loaded by setActiveOrganization
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
    setError('');
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
  }, [pendingInvites, organizations]);

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
        country: formData.country 
      });

      const { organization } = response.data;

      showToast.success(`"${organization.name}" created successfully!`);

      setRedirecting(true);
      await setActiveOrganization(organization.id);
      navigate('/select-branch');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to create organization');
      showToast.error(message);
      setCreating(false);
    }
  }, [formData, setActiveOrganization, navigate]);

  const getOrgRole = useCallback((org) => {
    return org.role || 'MEMBER';
  }, []);

  const filteredOrganizations = useMemo(() => {
    if (!query.trim()) return organizations;
    const q = query.trim().toLowerCase();
    return organizations.filter((org) => org.name.toLowerCase().includes(q));
  }, [organizations, query]);

  // ============================================================
  // LOADING
  // ============================================================

  if (loading || isLoading || redirecting) {
    return (
      <div className={styles.page}>
        <div className={styles.glowAmber} />
        <div className={styles.glowMoss} />
        <div className={styles.loadingCard}>
          <div className={styles.spinner} />
          <p>{redirecting ? 'Loading organization...' : 'Loading your workspace...'}</p>
        </div>
      </div>
    );
  }

  const hasOrgs = organizations.length > 0;
  const hasInvites = pendingInvites.length > 0;
  const hasArchived = archivedOrgs.length > 0;
  const initial = user?.firstName?.charAt(0).toUpperCase() || user?.name?.charAt(0).toUpperCase() || '?';

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className={styles.page}>
      <div className={styles.glowAmber} />
      <div className={styles.glowMoss} />

      <div className={styles.glassCard}>
        {/* ===== brand + user, always visible ===== */}
        <div className={styles.cardTopRow}>
          <div className={styles.brand}>
            <div className={styles.logoMark}>K</div>
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
          // ===== CREATE ORGANIZATION =====
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
          // ===== DASHBOARD =====
          <>
            <div className={styles.heroText}>
              <h1 className={styles.title}>Select a workspace</h1>
              <p className={styles.subtitle}>Pick an organization to continue, or start a new one.</p>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            {/* search + quick add */}
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
              <button
                className={styles.addIconBtn}
                onClick={() => setShowCreateForm(true)}
                title="New organization"
                type="button"
              >
                <Plus size={18} />
              </button>
            </div>

            <div className={styles.scrollArea}>
              {/* Organizations — main column */}
              <div className={styles.mainCol}>
                <section className={styles.section}>
                  <div className={styles.sectionLabel}>
                    <Building2 size={12} />
                    Your Organizations
                  </div>

                  <div className={styles.orgList}>
                    {filteredOrganizations.map((org) => {
                      const role = getOrgRole(org);
                      const isOwner = role === 'Owner' || role === 'OWNER';

                      return (
                        <button
                          key={org.id}
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
                      );
                    })}

                    {filteredOrganizations.length === 0 && (
                      <div className={styles.emptyNote}>
                        {query ? `No organizations match "${query}"` : 'No organizations yet'}
                      </div>
                    )}

                    <button className={styles.addOrgCard} onClick={() => setShowCreateForm(true)}>
                      <Plus size={15} />
                      <span>New organization</span>
                    </button>
                  </div>
                </section>
              </div>

              {/* Invites + archived — side column */}
              {(hasInvites || hasArchived) && (
                <div className={styles.sideCol}>
                  {hasInvites && (
                    <section className={styles.section}>
                      <div className={styles.sectionLabel}>
                        <Mail size={12} />
                        Pending Invitations
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
                              <button className={styles.acceptBtn} onClick={() => handleAcceptInvite(invite.token)}>
                                <Check size={13} />
                                Accept
                              </button>
                              <button className={styles.rejectBtn} onClick={() => handleRejectInvite(invite.token)}>
                                <X size={13} />
                                Decline
                              </button>
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

        {/* logout — pinned bottom-right corner */}
        <button className={styles.logoutCorner} onClick={handleLogout} title="Log out" type="button">
          <LogOut size={15} />
        </button>
      </div>
    </div>
  );
}