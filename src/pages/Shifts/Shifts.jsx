// src/pages/Shifts/Shifts.jsx
import React, { useState, useMemo, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useShift } from '../../contexts/ShiftContext';
import { useSettings } from '../../contexts/SettingsContext';
import {
  Clock, AlertCircle, Shield, Play, Square, Settings2,
  History, AlertTriangle, ArrowRightLeft, Check, X,
} from 'lucide-react';
import { KXTILL } from '../../constants/permissions';
import ShiftModal from './components/ShiftModal';
import SettingsTab from './tabs/SettingsTab';
import HistoryTab from './tabs/HistoryTab';
import ReviewTab from './tabs/ReviewTab';
import styles from './Shifts.module.css';

const Shifts = () => {
  const { activeOrganization, activeBranch, user } = useAuth();
  const { can } = usePermissions();
  const { formatDateTime } = useSettings();
  const {
    currentShift,
    shiftsEnabled,
    varianceThreshold,
    loading,
    error,
    hasOpenShift,
    openShift,
    closeShift,
    requestHandover,
    resolveHandover,
    rejectHandover,
  } = useShift();

  const myUserId = user?.id;

  const canSettings = can(KXTILL.SHIFT.SETTINGS);
  const canResolveHandover = can(KXTILL.SHIFT.RESOLVE_HANDOVER);
  const canReview = can(KXTILL.SHIFT.RESOLVE_VARIANCE);

  const TABS = useMemo(() => {
    const tabs = [
      { id: 'home', label: 'Home', icon: Clock },
      { id: 'history', label: 'History', icon: History },
    ];
    if (canReview) tabs.push({ id: 'review', label: 'Review', icon: AlertTriangle });
    if (canSettings) tabs.push({ id: 'settings', label: 'Settings', icon: Settings2 });
    return tabs;
  }, [canReview, canSettings]);

  const [activeTab, setActiveTab] = useState('home');

  useEffect(() => {
    if (!shiftsEnabled && activeTab === 'home' && canSettings) {
      setActiveTab('settings');
    }
  }, [shiftsEnabled, activeTab, canSettings]);

  // ---- modal state ----
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [requestModal, setRequestModal] = useState(false);
  const [resolveModal, setResolveModal] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);

  const [openingFloat, setOpeningFloat] = useState('0');
  const [declaredCash, setDeclaredCash] = useState('');
  const [handoverNote, setHandoverNote] = useState('');
  const [resolveCash, setResolveCash] = useState('');
  const [resolveNote, setResolveNote] = useState('');
  const [rejectNote, setRejectNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [closedResult, setClosedResult] = useState(null);

  // ---- handlers ----
  const handleOpenShift = async () => {
    const floatNum = Number(openingFloat);
    if (!Number.isFinite(floatNum) || floatNum < 0) {
      toast.error('Opening float must be non-negative');
      return;
    }
    setSubmitting(true);
    try {
      await openShift(floatNum);
      toast.success('Shift opened');
      setOpenModal(false);
      setOpeningFloat('0');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Failed to open shift');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseShift = async () => {
    const declared = Number(declaredCash);
    if (!Number.isFinite(declared) || declared < 0) {
      toast.error('Declared cash must be non-negative');
      return;
    }
    setSubmitting(true);
    try {
      const closed = await closeShift(declared);
      setClosedResult(closed);
      toast.success(
        closed?.status === 'CLOSED_PENDING_REVIEW'
          ? 'Shift closed — flagged for review'
          : 'Shift closed'
      );
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Failed to close shift');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestHandover = async () => {
    setSubmitting(true);
    try {
      await requestHandover(handoverNote || null);
      toast.success('Handover requested');
      setRequestModal(false);
      setHandoverNote('');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Failed to request handover');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveHandover = async () => {
    const cash = Number(resolveCash);
    if (!Number.isFinite(cash) || cash < 0) {
      toast.error('Declared cash must be non-negative');
      return;
    }
    setSubmitting(true);
    try {
      await resolveHandover(cash, resolveNote || null);
      toast.success('Handover resolved');
      setResolveModal(false);
      setResolveCash('');
      setResolveNote('');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Failed to resolve handover');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectHandover = async () => {
    setSubmitting(true);
    try {
      await rejectHandover(rejectNote || null);
      toast.success('Handover rejected');
      setRejectModal(false);
      setRejectNote('');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Failed to reject handover');
    } finally {
      setSubmitting(false);
    }
  };

  if (!activeOrganization?.id) {
    return (
      <div className={styles.page}>
        <div className={styles.noAccess}>
          <AlertCircle size={48} />
          <h2>No organization selected</h2>
        </div>
      </div>
    );
  }

  const isMyShift = currentShift?.userId === myUserId;
  const handoverPending = !!currentShift?.handoverRequestedById;
  const handoverRequester = currentShift?.handoverRequestedBy;

  return (
    <div className={styles.page}>
      <div className={styles.headerCard}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <Clock size={20} />
          </div>
          <div>
            <h1 className={styles.title}>Shifts</h1>
            <p className={styles.subtitle}>
              {activeOrganization.name}
              {activeBranch?.name && (
                <>
                  <span> · </span>
                  <span>{activeBranch.name}</span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className={styles.tabs}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const disabled = tab.id === 'home' && !shiftsEnabled;
          return (
            <button
              key={tab.id}
              type="button"
              className={`${styles.tab} ${
                activeTab === tab.id ? styles.tabActive : ''
              } ${disabled ? styles.tabDisabled : ''}`}
              onClick={() => !disabled && setActiveTab(tab.id)}
              disabled={disabled}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ---------- HOME ---------- */}
      {activeTab === 'home' && (
        <>
          {loading && !currentShift ? (
            <div className={styles.loaderWrapper}>
              <div className={styles.loader} />
            </div>
          ) : error ? (
            <div className={styles.errorState}>
              <AlertCircle size={32} />
              <p>{error}</p>
            </div>
          ) : !shiftsEnabled ? (
            <div className={styles.notice}>
              <Shield size={20} />
              <div>
                <h3>Shifts are not enabled for this branch</h3>
                <p>Enable shifts in branch settings to start tracking cash drawers.</p>
              </div>
            </div>
          ) : hasOpenShift ? (
            <>
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>
                    <Play size={14} />
                    {isMyShift ? 'My Shift' : 'Current Shift'}
                  </h2>
                  <span className={styles.badgeOpen}>OPEN</span>
                </div>
                <div className={styles.kvGrid}>
                  <div className={styles.kv}>
                    <span className={styles.kvLabel}>Opened by</span>
                    <span className={styles.kvValue}>
                      {currentShift.user?.firstName} {currentShift.user?.lastName}
                      {isMyShift && ' (you)'}
                    </span>
                  </div>
                  <div className={styles.kv}>
                    <span className={styles.kvLabel}>Opened at</span>
                    <span className={styles.kvValue}>
                      {formatDateTime?.(currentShift.openedAt) ||
                        new Date(currentShift.openedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.kv}>
                    <span className={styles.kvLabel}>Opening float</span>
                    <span className={styles.kvValue}>
                      {Number(currentShift.openingFloat).toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.kv}>
                    <span className={styles.kvLabel}>Variance threshold</span>
                    <span className={styles.kvValue}>{varianceThreshold}</span>
                  </div>
                </div>

                {/* Action row */}
                <div className={styles.cardActions}>
                  {isMyShift && !handoverPending && (
                    <button
                      className={styles.primaryBtn}
                      onClick={() => {
                        setDeclaredCash('');
                        setClosedResult(null);
                        setCloseModal(true);
                      }}
                    >
                      <Square size={14} />
                      Close Shift
                    </button>
                  )}
                  {!isMyShift && !handoverPending && (
                    <button
                      className={styles.primaryBtn}
                      onClick={() => {
                        setHandoverNote('');
                        setRequestModal(true);
                      }}
                    >
                      <ArrowRightLeft size={14} />
                      Request Handover
                    </button>
                  )}
                  {handoverPending && canResolveHandover && (
                    <>
                      <button
                        className={styles.secondaryBtn}
                        onClick={() => {
                          setRejectNote('');
                          setRejectModal(true);
                        }}
                      >
                        <X size={14} />
                        Reject
                      </button>
                      <button
                        className={styles.primaryBtn}
                        onClick={() => {
                          setResolveCash('');
                          setResolveNote('');
                          setResolveModal(true);
                        }}
                      >
                        <Check size={14} />
                        Resolve
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Handover pending banner */}
              {handoverPending && (
                <div className={styles.handoverBanner}>
                  <ArrowRightLeft size={16} />
                  <div>
                    <div className={styles.handoverTitle}>
                      Handover requested by{' '}
                      {handoverRequester?.firstName} {handoverRequester?.lastName}
                    </div>
                    {currentShift.handoverNote && (
                      <div className={styles.handoverNote}>
                        “{currentShift.handoverNote}”
                      </div>
                    )}
                    {!canResolveHandover && (
                      <div className={styles.handoverNote}>
                        Waiting for a manager to resolve.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <Square size={14} />
                  No Open Shift
                </h2>
              </div>
              <p className={styles.emptyText}>
                Open a shift to start recording sales against a cash drawer.
              </p>
              <div className={styles.cardActions}>
                <button
                  className={styles.primaryBtn}
                  onClick={() => {
                    setOpeningFloat('0');
                    setOpenModal(true);
                  }}
                >
                  <Play size={14} />
                  Open Shift
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'history' && <HistoryTab />}
      {activeTab === 'review' && canReview && <ReviewTab />}
      {activeTab === 'settings' && canSettings && <SettingsTab />}

      {/* ---------- MODALS ---------- */}
      <ShiftModal
        open={openModal}
        title="Open Shift"
        submitLabel="Open Shift"
        submitting={submitting}
        onClose={() => setOpenModal(false)}
        onSubmit={handleOpenShift}
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Opening float</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className={styles.input}
            value={openingFloat}
            onChange={(e) => setOpeningFloat(e.target.value)}
            disabled={submitting}
            autoFocus
          />
          <p className={styles.fieldHint}>Cash in the drawer at the start.</p>
        </div>
      </ShiftModal>

      <ShiftModal
        open={closeModal}
        title={closedResult ? 'Shift Closed' : 'Close Shift'}
        submitLabel="Close Shift"
        submitting={submitting}
        disabled={!!closedResult}
        onClose={() => setCloseModal(false)}
        onSubmit={closedResult ? () => setCloseModal(false) : handleCloseShift}
      >
        {closedResult ? (
          <div className={styles.kvGrid}>
            <div className={styles.kv}>
              <span className={styles.kvLabel}>Expected</span>
              <span className={styles.kvValue}>
                {Number(closedResult.expectedCash).toLocaleString()}
              </span>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvLabel}>Declared</span>
              <span className={styles.kvValue}>
                {Number(closedResult.declaredCash).toLocaleString()}
              </span>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvLabel}>Variance</span>
              <span className={styles.kvValue}>
                {Number(closedResult.variance).toLocaleString()}
              </span>
            </div>
            <div className={styles.kv}>
              <span className={styles.kvLabel}>Status</span>
              <span className={styles.kvValue}>
                {closedResult.status === 'CLOSED_PENDING_REVIEW'
                  ? 'Pending review'
                  : 'Closed'}
              </span>
            </div>
          </div>
        ) : (
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Declared cash</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={styles.input}
              value={declaredCash}
              onChange={(e) => setDeclaredCash(e.target.value)}
              disabled={submitting}
              autoFocus
            />
            <p className={styles.fieldHint}>Count the drawer and enter the total.</p>
          </div>
        )}
      </ShiftModal>

      <ShiftModal
        open={requestModal}
        title="Request Handover"
        submitLabel="Request"
        submitting={submitting}
        onClose={() => setRequestModal(false)}
        onSubmit={handleRequestHandover}
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Note (optional)</label>
          <textarea
            className={styles.textarea}
            rows={3}
            value={handoverNote}
            onChange={(e) => setHandoverNote(e.target.value)}
            placeholder="Why are you handing over?"
            disabled={submitting}
            autoFocus
          />
        </div>
      </ShiftModal>

      <ShiftModal
        open={resolveModal}
        title="Resolve Handover"
        submitLabel="Resolve"
        submitting={submitting}
        onClose={() => setResolveModal(false)}
        onSubmit={handleResolveHandover}
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Declared cash</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className={styles.input}
            value={resolveCash}
            onChange={(e) => setResolveCash(e.target.value)}
            disabled={submitting}
            autoFocus
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Note (optional)</label>
          <textarea
            className={styles.textarea}
            rows={3}
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            disabled={submitting}
          />
        </div>
      </ShiftModal>

      <ShiftModal
        open={rejectModal}
        title="Reject Handover"
        submitLabel="Reject"
        submitting={submitting}
        onClose={() => setRejectModal(false)}
        onSubmit={handleRejectHandover}
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Note (optional)</label>
          <textarea
            className={styles.textarea}
            rows={3}
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Why are you rejecting?"
            disabled={submitting}
            autoFocus
          />
        </div>
      </ShiftModal>
    </div>
  );
};

export default Shifts;