// src/pages/Dashboard/components/OnboardingView.jsx
import React, { useState } from 'react';
import {
  X,
  Check,
  ChevronRight,
  Store,
  Package,
  ShoppingCart,
  Sparkles,
} from 'lucide-react';
import styles from '../Dashboard.module.css';

// ============================================================
// STEP CONFIG — order matters; first incomplete = active
// ============================================================
const STEP_CONFIG = [
  {
    key: 'storeInfo',
    label: 'Add your shop details',
    hint: 'Name, phone, tax number',
    cta: 'Open Settings',
    route: '/settings',
    icon: Store,
  },
  {
    key: 'product',
    label: 'Add your first product',
    hint: "We'll help you set the stock too",
    cta: 'Open Inventory',
    route: '/inventory',
    icon: Package,
  },
  {
    key: 'firstSale',
    label: 'Make your first sale',
    hint: "The moment you're officially in business",
    cta: 'Open POS',
    route: '/pos',
    icon: ShoppingCart,
  },
];

const OnboardingView = ({ state, ownerName, shopName, onNavigate, onDismiss }) => {
  const [dismissing, setDismissing] = useState(false);

  const steps = state?.steps || {};
  const completedCount = state?.completedCount ?? 0;
  const totalCount = state?.totalCount ?? STEP_CONFIG.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // First non-complete step
  const activeKey = STEP_CONFIG.find((s) => !steps[s.key]?.done)?.key || null;

  const handleStep = (step) => {
    if (steps[step.key]?.done) return;
    onNavigate(step.route);
  };

  const handleDismiss = async () => {
    if (dismissing) return;
    setDismissing(true);
    try {
      await onDismiss();
    } finally {
      setDismissing(false);
    }
  };

  return (
    <div className={styles.onboardingShell}>
      <div className={styles.onboardingCard}>
        {/* Header */}
        <header className={styles.onboardingHeader}>
          <div className={styles.onboardingHeaderLeft}>
            <div className={styles.onboardingIcon}>
              <Sparkles size={20} />
            </div>
            <div>
              <h1 className={styles.onboardingTitle}>
                Welcome{ownerName ? `, ${ownerName}` : ''} 👋
              </h1>
              <p className={styles.onboardingSub}>
                {shopName
                  ? `Set up ${shopName} in ${totalCount} quick steps.`
                  : `Set up your shop in ${totalCount} quick steps.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            className={styles.onboardingCloseBtn}
            onClick={handleDismiss}
            disabled={dismissing}
            title="Dismiss"
          >
            <X size={16} />
          </button>
        </header>

        {/* Progress */}
        <div className={styles.onboardingProgress}>
          <div className={styles.onboardingProgressTrack}>
            <div
              className={styles.onboardingProgressFill}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className={styles.onboardingProgressLabel}>
            {completedCount} of {totalCount}
          </span>
        </div>

        {/* Steps */}
        <div className={styles.onboardingSteps}>
          {STEP_CONFIG.map((step) => {
            const done = !!steps[step.key]?.done;
            const active = !done && step.key === activeKey;
            const Icon = step.icon;

            return (
              <button
                key={step.key}
                type="button"
                className={`${styles.onboardingStep} ${
                  done ? styles.onboardingStepDone : ''
                } ${active ? styles.onboardingStepActive : ''}`}
                onClick={() => handleStep(step)}
                disabled={done}
              >
                <div className={styles.onboardingStepMarker}>
                  {done ? (
                    <Check size={14} />
                  ) : (
                    <Icon size={14} />
                  )}
                </div>

                <div className={styles.onboardingStepBody}>
                  <div className={styles.onboardingStepLabel}>
                    {step.label}
                  </div>
                  <div className={styles.onboardingStepHint}>{step.hint}</div>
                </div>

                {!done && (
                  <div className={styles.onboardingStepCta}>
                    <span>{step.cta}</span>
                    <ChevronRight size={14} />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <footer className={styles.onboardingFooter}>
          <span>You can hide this checklist anytime — nothing is lost.</span>
        </footer>
      </div>
    </div>
  );
};

export default OnboardingView;