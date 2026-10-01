// src/pages/Shifts/tabs/SettingsTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import axios from 'axios';
import { Save, Building2, Shield, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useShift } from '../../../contexts/ShiftContext';
import styles from './SettingsTab.module.css';

const SettingsTab = () => {
  const { activeOrganization } = useAuth();
  const { refresh: refreshShiftContext } = useShift();
  const orgId = activeOrganization?.id;

  const [branches, setBranches] = useState([]);
  const [drafts, setDrafts] = useState({});
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
        }
      );
      await refreshShiftContext();
      toast.success('Shift settings saved');
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
          <strong>Shifts are opt-in per branch.</strong> Turning shifts on for a
          branch requires cashiers to open a shift before ringing sales.
        </div>
      </div>

      <div className={styles.table}>
        <div className={styles.tableHead}>
          <span>Branch</span>
          <span className={styles.colToggle}>Shifts enabled</span>
          <span className={styles.colThreshold}>Variance threshold</span>
          <span className={styles.colAction} />
        </div>

        {branches.map((branch) => {
          const draft = drafts[branch.id] || {
            shiftsEnabled: false,
            varianceThreshold: 50,
          };
          const saving = savingId === branch.id;

          return (
            <div key={branch.id} className={styles.tableRow}>
              <div className={styles.branchCell}>
                <Building2 size={14} />
                <div>
                  <div className={styles.branchName}>{branch.name}</div>
                  <div className={styles.branchCode}>{branch.code}</div>
                </div>
              </div>

              <div className={styles.colToggle}>
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

              <div className={styles.colThreshold}>
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

              <div className={styles.colAction}>
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

        {branches.length === 0 && (
          <div className={styles.emptyRow}>No branches in this organization.</div>
        )}
      </div>
    </div>
  );
};

export default SettingsTab;