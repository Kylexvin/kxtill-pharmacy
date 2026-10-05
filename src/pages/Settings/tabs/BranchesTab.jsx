// src/pages/Settings/tabs/BranchesTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Building2, Save, RefreshCw, AlertCircle, Shield,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useShift } from '../../../contexts/ShiftContext';
import styles from './BranchesTab.module.css';

const BranchesTab = () => {
  const { activeOrganization } = useAuth();
  const { refresh: refreshShiftContext } = useShift();
  const orgId = activeOrganization?.id;

  const [branches, setBranches] = useState([]);
  const [drafts, setDrafts] = useState({}); // branchId -> { shiftsEnabled, varianceThreshold, creditEnabled }
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const branchesRes = await axios.get(
        `/organizations/${orgId}/kxtill/branches`
      );
      const list = branchesRes.data?.branches || [];
      setBranches(list);

      const settingsResults = await Promise.all(
        list.map((b) =>
          axios
            .get(`/organizations/${orgId}/kxtill/branches/${b.id}/settings`)
            .then((r) => ({ id: b.id, setting: r.data?.setting }))
            .catch(() => ({ id: b.id, setting: null }))
        )
      );

      const nextDrafts = {};
      for (const { id, setting } of settingsResults) {
        nextDrafts[id] = {
          shiftsEnabled: setting?.shiftsEnabled ?? false,
          varianceThreshold: Number(setting?.varianceThreshold ?? 50),
          creditEnabled: setting?.creditEnabled ?? false,
        };
      }
      setDrafts(nextDrafts);
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to load branches'
      );
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (branchId, key, value) => {
    setDrafts((prev) => ({
      ...prev,
      [branchId]: { ...prev[branchId], [key]: value },
    }));
  };

  const handleSave = async (branchId) => {
    const draft = drafts[branchId];
    if (!draft) return;

    const threshold = Number(draft.varianceThreshold);
    if (!Number.isFinite(threshold) || threshold < 0) {
      toast.error('Variance threshold must be a non-negative number');
      return;
    }

    setSavingId(branchId);
    try {
      await axios.patch(
        `/organizations/${orgId}/kxtill/branches/${branchId}/settings`,
        {
          shiftsEnabled: !!draft.shiftsEnabled,
          varianceThreshold: threshold,
          creditEnabled: !!draft.creditEnabled,
        }
      );
      await refreshShiftContext();
      toast.success('Branch settings saved');
    } catch (err) {
      toast.error(
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to save settings'
      );
    } finally {
      setSavingId(null);
    }
  };

  if (!orgId) {
    return (
      <div className={styles.empty}>
        <AlertCircle size={32} />
        <p>No organization selected</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.loaderWrapper}>
        <div className={styles.loader} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <AlertCircle size={32} />
        <p>{error}</p>
        <button className={styles.retryBtn} onClick={load}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.infoBanner}>
        <Shield size={16} />
        <div>
          <strong>Per-branch toggles.</strong> Shifts and credit (deni) are
          opt-in per branch. Variance threshold controls when a shift close is
          flagged for review.
        </div>
      </div>

      {branches.length === 0 ? (
        <div className={styles.emptyState}>
          No branches in this organization.
        </div>
      ) : (
        <div className={styles.branchList}>
          {branches.map((branch) => {
            const draft = drafts[branch.id] || {
              shiftsEnabled: false,
              varianceThreshold: 50,
              creditEnabled: false,
            };
            const saving = savingId === branch.id;

            return (
              <div key={branch.id} className={styles.branchCard}>
                <div className={styles.branchHeader}>
                  <Building2 size={16} />
                  <div>
                    <div className={styles.branchName}>{branch.name}</div>
                    <div className={styles.branchCode}>{branch.code}</div>
                  </div>
                </div>

                <div className={styles.branchBody}>
                  {/* Shifts toggle */}
                  <div className={styles.settingRow}>
                    <div className={styles.settingInfo}>
                      <div className={styles.settingLabel}>Shifts</div>
                      <div className={styles.settingHint}>
                        Require cashiers to open a shift before ringing sales
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!draft.shiftsEnabled}
                      className={`${styles.toggle} ${
                        draft.shiftsEnabled ? styles.toggleOn : ''
                      }`}
                      onClick={() =>
                        setField(branch.id, 'shiftsEnabled', !draft.shiftsEnabled)
                      }
                      disabled={saving}
                    >
                      <span className={styles.toggleKnob} />
                    </button>
                  </div>

                  {/* Credit toggle */}
                  <div className={styles.settingRow}>
                    <div className={styles.settingInfo}>
                      <div className={styles.settingLabel}>Credit (Deni)</div>
                      <div className={styles.settingHint}>
                        Allow credit sales and track customer balances
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!draft.creditEnabled}
                      className={`${styles.toggle} ${
                        draft.creditEnabled ? styles.toggleOn : ''
                      }`}
                      onClick={() =>
                        setField(branch.id, 'creditEnabled', !draft.creditEnabled)
                      }
                      disabled={saving}
                    >
                      <span className={styles.toggleKnob} />
                    </button>
                  </div>

                  {/* Variance threshold */}
                  <div className={styles.settingRow}>
                    <div className={styles.settingInfo}>
                      <div className={styles.settingLabel}>Variance threshold</div>
                      <div className={styles.settingHint}>
                        Cash variance above this flags the shift for review
                      </div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className={styles.input}
                      value={draft.varianceThreshold}
                      onChange={(e) =>
                        setField(branch.id, 'varianceThreshold', e.target.value)
                      }
                      disabled={saving}
                    />
                  </div>
                </div>

                <div className={styles.branchFooter}>
                  <button
                    type="button"
                    className={styles.saveBtn}
                    onClick={() => handleSave(branch.id)}
                    disabled={saving}
                  >
                    <Save size={13} />
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BranchesTab;