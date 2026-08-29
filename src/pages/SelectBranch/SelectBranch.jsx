import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  MapPin, 
  Check, 
  ChevronRight, 
  ArrowLeft, 
  Store,
  LogOut,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { showToast } from '../../components/Common/Toast';
import styles from './SelectBranch.module.css';

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

export default function SelectBranchPage() {
  const navigate = useNavigate();
  const { 
    user, 
    activeOrganization, 
    setActiveBranch,
    setBranches,  // ADD THIS
    isLoading, 
    logout 
  } = useAuth();

  const [branchesState, setBranchesState] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!activeOrganization) {
      navigate('/select-org');
      return;
    }

    const fetchBranches = async () => {
      try {
        setLoading(true);
        setError('');
        
        const response = await axios.get(
          `/organizations/${activeOrganization.id}/branches/my`
        );
        
        const branchList = response.data.branches || [];
        setBranchesState(branchList);
        setBranches(branchList);  // ADD THIS - save to auth context
        
        const defaultBranch = branchList.find(b => b.isDefault === true);
        if (defaultBranch) {
          setSelectedId(defaultBranch.id);
        } else if (branchList.length > 0) {
          const activeBranch = branchList.find(b => b.isActive !== false);
          if (activeBranch) {
            setSelectedId(activeBranch.id);
          }
        }
        
        setLoading(false);
      } catch (err) {
        const message = getErrorMessage(err, 'Failed to load branches');
        setError(message);
        showToast.error(message);
        setLoading(false);
      }
    };

    fetchBranches();
  }, [activeOrganization, navigate, setBranches]);

  const handleSelect = useCallback(async (branch) => {
    if (!branch.isActive) {
      showToast.error('This branch is inactive');
      return;
    }

    setSelectedId(branch.id);
    setRedirecting(true);
    
    try {
      setActiveBranch(branch);
      showToast.success(`Selected ${branch.name}`);
      navigate('/pos');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to select branch');
      showToast.error(message);
      setRedirecting(false);
    }
  }, [setActiveBranch, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleBack = () => {
    navigate('/select-org');
  };

  const getStatusBadge = (branch) => {
    if (branch.isDefault) {
      return <span className={styles.badgeDefault}>Default</span>;
    }
    if (branch.isActive === false) {
      return <span className={styles.badgeInactive}>Inactive</span>;
    }
    return null;
  };

  if (loading || isLoading || redirecting) {
    return (
      <div className={styles.page}>
        <div className={styles.glowAmber} />
        <div className={styles.glowMoss} />
        <div className={styles.loadingCard}>
          <div className={styles.spinner} />
          <p>{redirecting ? 'Loading branch...' : 'Loading branches...'}</p>
        </div>
      </div>
    );
  }

  const initial = user?.firstName?.charAt(0).toUpperCase() || 
                  user?.name?.charAt(0).toUpperCase() || '?';

  return (
    <div className={styles.page}>
      <div className={styles.glowAmber} />
      <div className={styles.glowMoss} />

      <div className={styles.glassCard}>
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

        <div className={styles.header}>
          <button className={styles.backButton} onClick={handleBack}>
            <ArrowLeft size={20} />
          </button>
          <div className={styles.headerContent}>
            <div className={styles.iconWrapper}>
              <MapPin size={24} />
            </div>
            <h1 className={styles.title}>Select Branch</h1>
            {activeOrganization && (
              <p className={styles.subtitle}>
                {activeOrganization.name} — Choose your branch
              </p>
            )}
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

        <div className={styles.list}>
          {branchesState.length === 0 ? (
            <div className={styles.emptyState}>
              <Store size={48} />
              <h3>No branches found</h3>
              <p>You don't have access to any branches in this organization.</p>
            </div>
          ) : (
            branchesState.map((branch) => (
              <button
                key={branch.id}
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
            ))
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.logoutButton} onClick={handleLogout}>
            <LogOut size={15} />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}