// Products/kxtill/src/pages/Settings/Settings.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useSettings } from '../../contexts/SettingsContext';
import BranchesTab from './tabs/BranchesTab';
import toast from 'react-hot-toast';
import {
  Settings as SettingsIcon,
  Store,
  Receipt,
  Sliders,
  Building2,
  Save,
  RefreshCw,
  AlertCircle,
  Check,
  Lock,
  Phone,
  Mail,
  MapPin,
  FileText,
  ShoppingBag,
} from 'lucide-react';
import styles from './Settings.module.css';

// ============================================================
// TABS — Notifications & Security removed (all dummy fields)
// Branch + Branches merged into one
// ============================================================
const TABS = [
  { id: 'store',    label: 'Store Info', icon: Store },
  { id: 'receipt',  label: 'Receipt',    icon: Receipt },
  { id: 'general',  label: 'General',    icon: Sliders },
  { id: 'branches', label: 'Branches',   icon: Building2 },
];

const CURRENCIES = ['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS'];
const TIMEZONES = [
  'Africa/Nairobi',
  'Africa/Kampala',
  'Africa/Dar_es_Salaam',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'UTC',
];
const PAYMENT_METHODS = [
  { value: 'CASH',  label: 'Cash' },
  { value: 'MPESA', label: 'M-Pesa' },
  { value: 'CARD',  label: 'Card' },
];
const RECEIPT_TEMPLATES = [
  { value: 'classic', label: 'Classic' },
  { value: 'modern',  label: 'Modern'  },
  { value: 'minimal', label: 'Minimal' },
];

// Editable keys — matches backend allow-list exactly.
const EDITABLE_KEYS = [
  'shopName', 'shopPhone', 'shopEmail', 'shopAddress', 'taxNumber',
  'receiptHeader', 'receiptFooter', 'receiptTemplate',
  'showTax', 'showCustomer', 'showCashier',
  'currency', 'timezone', 'decimalPlaces', 'defaultPaymentMethod',
  'allowBranchSwitch',
];

// ============================================================
// REUSABLE FIELDS
// ============================================================
const Field = ({ label, hint, icon: Icon, children }) => (
  <div className={styles.field}>
    <label className={styles.fieldLabel}>
      {Icon && <Icon size={12} className={styles.fieldLabelIcon} />}
      <span>{label}</span>
    </label>
    {children}
    {hint && <p className={styles.fieldHint}>{hint}</p>}
  </div>
);

const TextInput = ({ value, onChange, placeholder, type = 'text', disabled }) => (
  <input
    type={type}
    className={styles.input}
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    disabled={disabled}
  />
);



const Select = ({ value, onChange, options, disabled }) => (
  <select
    className={styles.select}
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
  >
    {options.map((opt) => {
      const val = typeof opt === 'string' ? opt : opt.value;
      const lbl = typeof opt === 'string' ? opt : opt.label;
      return (
        <option key={val} value={val}>
          {lbl}
        </option>
      );
    })}
  </select>
);

const Toggle = ({ checked, onChange, label, hint, disabled }) => (
  <div className={styles.toggleRow}>
    <div className={styles.toggleText}>
      <span className={styles.toggleLabel}>{label}</span>
      {hint && <span className={styles.toggleHint}>{hint}</span>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
    >
      <span className={styles.toggleKnob} />
    </button>
  </div>
);

// ============================================================
// PAGE
// ============================================================
const Settings = () => {
  const { activeOrganization } = useAuth();
  const { can, isOwner } = usePermissions();
  const {
    settings,
    loading,
    error,
    fetchSettings,
    updateSettings,
    resetSettings,
  } = useSettings();

  const canView   = isOwner || can('kxtill.settings.view');
  const canManage = isOwner;
  const readonly  = !canManage;

  const [activeTab, setActiveTab] = useState('store');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(settings ?? {});

  useEffect(() => {
    setDraft(settings ?? {});
  }, [settings]);

  const isDraftDirty = useMemo(() => {
    if (!draft || !settings) return false;
    return EDITABLE_KEYS.some((k) => draft[k] !== settings[k]);
  }, [draft, settings]);

  // ---------- handlers ----------
  const setField = (key, value) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (saving || !canManage || !isDraftDirty) return;
    setSaving(true);
    try {
      const payload = {
        ...draft,
        sessionTimeout: Number(draft.sessionTimeout) || 30,
        decimalPlaces:  Number(draft.decimalPlaces)  || 2,
      };
      await updateSettings(payload);
      toast.success('Settings saved');
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast.error(
        err.response?.data?.error ||
          err.response?.data?.message ||
          err.message ||
          'Failed to save settings'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => setDraft(settings ?? {});

  const handleResetToDefaults = async () => {
    if (
      !window.confirm(
        'Reset all settings to defaults? You will still need to save.'
      )
    ) {
      return;
    }
    const defaults = await resetSettings();
    if (defaults) setDraft(defaults);
    toast.success('Defaults loaded — click Save to apply');
  };

  // ============================================================
  // GUARDS
  // ============================================================
  if (!canView) {
    return (
      <div className={styles.page}>
        <div className={styles.noAccess}>
          <SettingsIcon size={48} className={styles.noAccessIcon} />
          <h2>Access Denied</h2>
          <p>You don't have permission to view KxTill settings.</p>
          <p className={styles.noAccessSub}>
            Contact your organization owner for access.
          </p>
        </div>
      </div>
    );
  }

  if (!activeOrganization?.id) {
    return (
      <div className={styles.page}>
        <div className={styles.noAccess}>
          <AlertCircle size={48} className={styles.noAccessIcon} />
          <h2>No organization selected</h2>
        </div>
      </div>
    );
  }

  if (loading && !settings) {
    return (
      <div className={styles.page}>
        <div className={styles.loaderWrapper}>
          <div className={styles.loader} />
        </div>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <AlertCircle size={32} className={styles.errorIcon} />
          <p className={styles.errorText}>{error}</p>
          <button
            className={styles.retryBtn}
            onClick={() => fetchSettings(true)}
          >
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className={styles.page}>
        <div className={styles.loaderWrapper}>
          <div className={styles.loader} />
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className={styles.page}>
      {/* ---------- HERO ---------- */}
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.heroIcon}>
            <SettingsIcon size={22} />
          </div>
          <div className={styles.heroTitle}>
            <h1>Settings</h1>
            <p>
              <span className={styles.heroOrg}>
                {activeOrganization?.name}
              </span>
              <span className={styles.heroSep}>·</span>
              <span className={styles.heroStat}>KxTill preferences</span>
            </p>
          </div>
        </div>

        <div className={styles.heroRight}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleResetToDefaults}
            disabled={saving || readonly}
            title="Reset all settings to defaults"
          >
            Defaults
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleSave}
            disabled={saving || !isDraftDirty || readonly}
            title={readonly ? 'Only the owner can save settings' : ''}
          >
            {saving ? (
              <span className={styles.spinnerSmall} />
            ) : (
              <Save size={14} />
            )}
            <span>{saving ? 'Saving…' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {readonly && (
        <div className={styles.readonlyBanner}>
          <Lock size={14} />
          <span>
            You have view-only access. Only the organization owner can change
            settings.
          </span>
        </div>
      )}

      {/* ---------- TABS ---------- */}
      <div className={styles.tabs}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              className={`${styles.tab} ${
                activeTab === tab.id ? styles.tabActive : ''
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ---------- PANELS ---------- */}
      <div className={styles.tabPanel}>
        {/* ============ STORE INFO (redesigned) ============ */}
        {activeTab === 'store' && (
          <div className={styles.panels}>
            {/* Identity section */}
            <section className={styles.section}>
              <header className={styles.sectionHeader}>
                <div className={styles.sectionIcon}>
                  <ShoppingBag size={16} />
                </div>
                <div className={styles.sectionHeaderText}>
                  <h2 className={styles.sectionTitle}>Identity</h2>
                  <p className={styles.sectionDesc}>
                    The name and contact details customers will see.
                  </p>
                </div>
              </header>

              <div className={styles.sectionBody}>
                <div className={styles.fieldGrid}>
                  <div className={styles.fieldWide}>
                    <Field label="Shop Name" icon={Store}>
                      <TextInput
                        value={draft.shopName}
                        onChange={(v) => setField('shopName', v)}
                        placeholder="e.g. Vi-Mini-Mart"
                        disabled={readonly}
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </section>

            {/* Contact section */}
            <section className={styles.section}>
              <header className={styles.sectionHeader}>
                <div className={styles.sectionIcon}>
                  <Phone size={16} />
                </div>
                <div className={styles.sectionHeaderText}>
                  <h2 className={styles.sectionTitle}>Contact</h2>
                  <p className={styles.sectionDesc}>
                    How customers reach you. Shown on receipts.
                  </p>
                </div>
              </header>

              <div className={styles.sectionBody}>
                <div className={styles.fieldGrid}>
                  <Field label="Phone" icon={Phone}>
                    <TextInput
                      value={draft.shopPhone}
                      onChange={(v) => setField('shopPhone', v)}
                      placeholder="e.g. 0712345678"
                      disabled={readonly}
                    />
                  </Field>
                  <Field label="Email" icon={Mail}>
                    <TextInput
                      type="email"
                      value={draft.shopEmail}
                      onChange={(v) => setField('shopEmail', v)}
                      placeholder="e.g. info@shop.co.ke"
                      disabled={readonly}
                    />
                  </Field>
                  <div className={styles.fieldWide}>
                    <Field label="Address" icon={MapPin}>
                      <TextInput
                        value={draft.shopAddress}
                        onChange={(v) => setField('shopAddress', v)}
                        placeholder="e.g. Nairobi, Kenya"
                        disabled={readonly}
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </section>

            {/* Compliance section */}
            <section className={styles.section}>
              <header className={styles.sectionHeader}>
                <div className={styles.sectionIcon}>
                  <FileText size={16} />
                </div>
                <div className={styles.sectionHeaderText}>
                  <h2 className={styles.sectionTitle}>Compliance</h2>
                  <p className={styles.sectionDesc}>
                    Tax and regulatory identifiers.
                  </p>
                </div>
              </header>

              <div className={styles.sectionBody}>
                <div className={styles.fieldGrid}>
                  <div className={styles.fieldWide}>
                    <Field
                      label="Tax Number (KRA PIN)"
                      icon={FileText}
                      hint="Printed on receipts where required by law."
                    >
                      <TextInput
                        value={draft.taxNumber}
                        onChange={(v) => setField('taxNumber', v)}
                        placeholder="e.g. P0012345678"
                        disabled={readonly}
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ============ RECEIPT (next turn) ============ */}
        {activeTab === 'receipt' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Receipt</h2>
              <p className={styles.sectionDesc}>
                Customize what appears on printed receipts.
              </p>
            </div>

            <div className={styles.grid2}>
              <Field label="Header Text" hint="Printed at the top of the receipt">
                <TextInput
                  value={draft.receiptHeader}
                  onChange={(v) => setField('receiptHeader', v)}
                  placeholder="e.g. Vi-Mini-Mart"
                  disabled={readonly}
                />
              </Field>
              <Field label="Footer Text" hint="Printed at the bottom">
                <TextInput
                  value={draft.receiptFooter}
                  onChange={(v) => setField('receiptFooter', v)}
                  placeholder="e.g. Thank you for shopping!"
                  disabled={readonly}
                />
              </Field>
              <Field label="Template" hint="Visual style of the printed receipt">
                <Select
                  value={draft.receiptTemplate ?? 'classic'}
                  onChange={(v) => setField('receiptTemplate', v)}
                  options={RECEIPT_TEMPLATES}
                  disabled={readonly}
                />
              </Field>
            </div>

            <div className={styles.toggleGroup}>
              <Toggle
                label="Show Tax Line"
                hint="Display VAT / tax breakdown on receipts"
                checked={!!draft.showTax}
                onChange={(v) => setField('showTax', v)}
                disabled={readonly}
              />
              <Toggle
                label="Show Customer Name"
                hint="Print customer name when known"
                checked={!!draft.showCustomer}
                onChange={(v) => setField('showCustomer', v)}
                disabled={readonly}
              />
              <Toggle
                label="Show Cashier Name"
                hint="Print the cashier who processed the sale"
                checked={!!draft.showCashier}
                onChange={(v) => setField('showCashier', v)}
                disabled={readonly}
              />
            </div>
          </div>
        )}

        {/* ============ GENERAL (next turn) ============ */}
        {activeTab === 'general' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>General</h2>
              <p className={styles.sectionDesc}>
                Currency, formatting, and payment defaults.
              </p>
            </div>

            <div className={styles.grid2}>
              <Field label="Currency">
                <Select
                  value={draft.currency}
                  onChange={(v) => setField('currency', v)}
                  options={CURRENCIES}
                  disabled={readonly}
                />
              </Field>
              <Field label="Timezone">
                <Select
                  value={draft.timezone}
                  onChange={(v) => setField('timezone', v)}
                  options={TIMEZONES}
                  disabled={readonly}
                />
              </Field>
              <Field label="Decimal Places" hint="How many decimals to show on prices">
                <Select
                  value={draft.decimalPlaces}
                  onChange={(v) => setField('decimalPlaces', Number(v))}
                  options={[
                    { value: 0, label: '0 — whole numbers' },
                    { value: 1, label: '1 decimal' },
                    { value: 2, label: '2 decimals' },
                  ]}
                  disabled={readonly}
                />
              </Field>
              <Field label="Default Payment Method">
                <Select
                  value={draft.defaultPaymentMethod}
                  onChange={(v) => setField('defaultPaymentMethod', v)}
                  options={PAYMENT_METHODS}
                  disabled={readonly}
                />
              </Field>
            </div>
          </div>
        )}

        {/* ============ BRANCHES (merged, next turn) ============ */}
        {activeTab === 'branches' && (
          <>
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Branch Behavior</h2>
                <p className={styles.sectionDesc}>
                  How users interact with branches.
                </p>
              </div>
              <div className={styles.toggleGroup}>
                <Toggle
                  label="Allow Branch Switching"
                  hint="Let users switch the active branch from the top bar"
                  checked={!!draft.allowBranchSwitch}
                  onChange={(v) => setField('allowBranchSwitch', v)}
                  disabled={readonly}
                />
              </div>
            </div>
            <BranchesTab />
          </>
        )}
      </div>

      {/* ---------- STICKY DIRTY BAR ---------- */}
      {isDraftDirty && (
        <div className={styles.dirtyBar}>
          <div className={styles.dirtyText}>
            <AlertCircle size={14} />
            You have unsaved changes
          </div>
          <div className={styles.dirtyActions}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={handleDiscard}
              disabled={saving}
            >
              Discard
            </button>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleSave}
              disabled={saving || readonly}
            >
              {saving ? (
                <span className={styles.spinnerSmall} />
              ) : (
                <Check size={14} />
              )}
              <span>{saving ? 'Saving…' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;