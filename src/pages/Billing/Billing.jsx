// Products/kxtill/src/pages/Billing/Billing.jsx
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { showToast } from '../../components/Common/Toast';
import {
  CreditCard,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Calendar,
  Clock,
  DollarSign,
  Mail,
  Phone,
  Building2,
  Package as PackageIcon,
  BarChart3,
  ShoppingCart,
  Users,
  Settings as SettingsIcon,
  Shield,
  MessageCircle,
  ExternalLink,
} from 'lucide-react';
import PaymentInstructions from './components/PaymentInstructions';
import PaymentHistory from './components/PaymentHistory';
import styles from './Billing.module.css';

// ============================================================
// HELPERS
// ============================================================
const fmtDate = (iso, withTime = false) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const opts = { year: 'numeric', month: 'short', day: 'numeric' };
  if (withTime) {
    opts.hour = '2-digit';
    opts.minute = '2-digit';
  }
  return d.toLocaleDateString(undefined, opts);
};

const fmtMoney = (amount, currency) => {
  if (amount === null || amount === undefined) return '—';
  return `${currency || 'KES'} ${Number(amount).toLocaleString()}`;
};

const STATUS_TONE = {
  TRIAL: 'info',
  ACTIVE: 'success',
  GRACE: 'warn',
  EXPIRED: 'danger',
  SUSPENDED: 'danger',
  CANCELLED: 'muted',
};

const accessIcon = (label) => {
  const l = String(label || '').toLowerCase();
  if (l.includes('pos') || l.includes('sale')) return ShoppingCart;
  if (l.includes('inventory') || l.includes('stock')) return PackageIcon;
  if (l.includes('report')) return BarChart3;
  if (l.includes('customer')) return Users;
  if (l.includes('setting')) return SettingsIcon;
  if (l.includes('staff') || l.includes('member')) return Shield;
  if (l.includes('branch')) return Building2;
  return CheckCircle;
};

const digitsOnly = (phone) => String(phone || '').replace(/\D/g, '');

const buildWhatsAppUrl = (phone, orgName) => {
  const digits = digitsOnly(phone);
  if (!digits) return null;
  const normalized = digits.startsWith('0')
    ? `254${digits.slice(1)}`
    : digits;
  const text = encodeURIComponent(
    `Hi, this is ${orgName || 'my shop'}. I'd like to talk about our KxTill billing.`
  );
  return `https://wa.me/${normalized}?text=${text}`;
};

// ============================================================
// SKELETON
// ============================================================
const Sk = ({ w, h = 12, r = 6, style }) => (
  <span
    className={styles.skeleton}
    style={{ width: w, height: h, borderRadius: r, ...style }}
  />
);

const BillingSkeleton = () => (
  <div className={styles.page}>
    <div className={styles.hero}>
      <div className={styles.heroLeft}>
        <div className={styles.skeletonIconSquare} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Sk w={200} h={20} />
          <Sk w={280} h={12} />
        </div>
      </div>
      <div className={styles.heroRight}>
        <Sk w={180} h={38} r={9} />
      </div>
    </div>

    <div className={styles.bento}>
      <div className={styles.planTile}>
        <Sk w={120} h={10} />
        <Sk w={180} h={26} style={{ marginTop: 12 }} />
        <Sk w={140} h={12} style={{ marginTop: 12 }} />
        <Sk w="100%" h={8} style={{ marginTop: 20 }} />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.statTile}>
          <Sk w={32} h={32} r={9} />
          <Sk w="60%" h={22} style={{ marginTop: 14 }} />
          <Sk w="40%" h={10} style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>

    <div className={styles.card}>
      <Sk w={160} h={14} />
      <Sk w="80%" h={12} style={{ marginTop: 14 }} />
      <Sk w="60%" h={12} style={{ marginTop: 8 }} />
    </div>

    <div className={styles.twoCol}>
      <div className={styles.card}>
        <Sk w={140} h={12} />
        <Sk w="100%" h={80} style={{ marginTop: 16 }} />
      </div>
      <div className={styles.card}>
        <Sk w={140} h={12} />
        <Sk w="100%" h={80} style={{ marginTop: 16 }} />
      </div>
    </div>
  </div>
);

// ============================================================
// PAGE
// ============================================================
export default function Billing() {

  const { activeOrganization } = useAuth();

  const [data, setData] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const orgId = activeOrganization?.id;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [billingRes, paymentsRes] = await Promise.all([
        axios.get(`/organizations/${orgId}/kxtill/billing`),
        axios.get(`/organizations/${orgId}/kxtill/billing/payments`),
      ]);
      setData(billingRes.data?.data || null);
      setPayments(paymentsRes.data?.data || []);
    } catch (err) {
      const s = err.response?.status;
      setError(
        s === 403
          ? "You don't have access to billing."
          : 'Failed to load billing information.'
      );
      showToast.error(
        err.response?.data?.error || 'Failed to load billing.'
      );
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!activeOrganization) {
    return (
      <div className={styles.page}>
        <div className={styles.centered}>
          <Building2 size={44} className={styles.centeredIcon} />
          <h2>No organization selected</h2>
          <p>Select an organization to view billing.</p>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return <BillingSkeleton />;
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <AlertTriangle size={32} className={styles.errorIcon} />
          <p className={styles.errorText}>{error}</p>
          <button className={styles.retryBtn} onClick={load}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const tone = STATUS_TONE[data.status] || 'muted';
  const isWarning =
    data.status === 'TRIAL' ||
    data.status === 'GRACE' ||
    data.status === 'EXPIRED';

  const showProgress =
    (data.status === 'TRIAL' || data.status === 'ACTIVE') &&
    data.phaseStartAt &&
    data.phaseEndsAt;

  const totalDays = showProgress
    ? Math.max(
        1,
        Math.round(
          (new Date(data.phaseEndsAt) - new Date(data.phaseStartAt)) /
            86400000
        )
      )
    : 0;
  const elapsed = showProgress
    ? Math.min(
        totalDays,
        Math.round(
          (Date.now() - new Date(data.phaseStartAt)) / 86400000
        )
      )
    : 0;
  const pct = showProgress
    ? Math.round((elapsed / totalDays) * 100)
    : 0;
  const progressTone =
    pct >= 85 ? 'danger' : pct >= 60 ? 'warn' : 'success';

  const amountDue = data.payment?.displayAmount;

  return (
    <div className={styles.page}>
      {/* ============ HERO ============ */}
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.heroIcon}>
            <CreditCard size={22} />
          </div>
          <div className={styles.heroTitle}>
            <h1>Billing &amp; Subscription</h1>
            <p>
              <span className={styles.heroOrg}>
                {activeOrganization.name}
              </span>
              <span className={styles.heroSep}>·</span>
              <span className={styles.heroStat}>
                {data.productName || 'KxTill'}
              </span>
            </p>
          </div>
        </div>
        <div className={styles.heroRight}>
          {data.payment?.contactPhone ? (
            <a
              href={buildWhatsAppUrl(
                data.payment.contactPhone,
                activeOrganization.name
              )}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.primaryBtn}
            >
              <MessageCircle size={14} />
              <span>Talk to us on WhatsApp</span>
            </a>
          ) : data.payment?.contactEmail ? (
            <a
              href={`mailto:${data.payment.contactEmail}?subject=${encodeURIComponent(
                `Billing — ${activeOrganization.name}`
              )}`}
              className={styles.primaryBtn}
            >
              <Mail size={14} />
              <span>Email about billing</span>
            </a>
          ) : null}
        </div>
      </div>

      {/* ============ STATUS BENTO ============ */}
      <div className={styles.bento}>
        <div className={styles.planTile}>
          <div className={styles.planHeader}>
            <span className={styles.planLabel}>Current plan</span>
            <span
              className={`${styles.statusBadge} ${styles[`tone_${tone}`]}`}
            >
              {data.status}
            </span>
          </div>
          <div className={styles.planName}>
            {data.plan?.name || 'Standard'}
          </div>
          {data.plan?.price > 0 && (
            <div className={styles.planPrice}>
              {fmtMoney(data.plan.price, data.plan.currency)}
              <span className={styles.planInterval}>
                {' / '}
                {data.plan.interval === 'YEARLY' ? 'year' : 'month'}
              </span>
            </div>
          )}

          {showProgress && (
            <div className={styles.progressWrap}>
              <div className={styles.progressTrack}>
                <div
                  className={`${styles.progressFill} ${
                    styles[`fill_${progressTone}`]
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className={styles.progressLabels}>
                <span>
                  Day {elapsed} of {totalDays}
                </span>
                <span>{data.remainingDays} days left</span>
              </div>
            </div>
          )}
        </div>

        <div className={styles.statTile}>
          <div className={`${styles.statTileIcon} ${styles.iconAccent}`}>
            <Calendar size={16} />
          </div>
          <div className={styles.statTileValue}>
            {fmtDate(data.phaseEndsAt)}
          </div>
          <div className={styles.statTileLabel}>
            {data.isTrial ? 'Trial ends' : 'Period ends'}
          </div>
        </div>

        <div className={styles.statTile}>
          <div
            className={`${styles.statTileIcon} ${
              data.remainingDays <= 7 ? styles.iconWarn : styles.iconOk
            }`}
          >
            <Clock size={16} />
          </div>
          <div
            className={`${styles.statTileValue} ${
              data.remainingDays <= 7 ? styles.warnText : ''
            }`}
          >
            {data.remainingDays ?? '—'}
          </div>
          <div className={styles.statTileLabel}>Days remaining</div>
        </div>

        <div className={styles.statTile}>
          <div className={`${styles.statTileIcon} ${styles.iconAccent}`}>
            <DollarSign size={16} />
          </div>
          <div className={styles.statTileValue} title={amountDue || ''}>
            {amountDue || '—'}
          </div>
          <div className={styles.statTileLabel}>Amount due</div>
        </div>
      </div>

      {/* ============ WHAT HAPPENS NEXT ============ */}
      {data.whatHappensNext?.title && (
        <div
          className={`${styles.card} ${
            isWarning ? styles.cardWarn : ''
          }`}
        >
          <div className={styles.cardHeader}>
            <div
              className={`${styles.cardIcon} ${
                isWarning ? styles.cardIconWarn : ''
              }`}
            >
              <AlertTriangle size={16} />
            </div>
            <div className={styles.cardHeaderText}>
              <div className={styles.cardLabel}>What happens next</div>
              <div className={styles.nextTitle}>
                {data.whatHappensNext.title}
              </div>
            </div>
          </div>
          <p className={styles.nextBody}>{data.whatHappensNext.body}</p>
        </div>
      )}

      {/* ============ YOUR ACCESS ============ */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardIcon}>
            <Shield size={16} />
          </div>
          <div className={styles.cardHeaderText}>
            <div className={styles.cardLabel}>Your access</div>
          </div>
        </div>

        <div className={styles.accessGrid}>
          <div className={styles.accessColumn}>
            <div className={styles.accessHead}>
              <CheckCircle size={14} className={styles.accessHeadOk} />
              <span>Included now</span>
            </div>
            <ul className={styles.accessList}>
              {(data.access?.included || []).map((item) => {
                const Icon = accessIcon(item);
                return (
                  <li key={item} className={styles.accessItem}>
                    <Icon size={13} className={styles.accessItemIcon} />
                    <span>{item}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className={styles.accessColumn}>
            <div className={styles.accessHead}>
              <XCircle size={14} className={styles.accessHeadBad} />
              <span>Not included</span>
            </div>
            {data.access?.restricted?.length > 0 ? (
              <ul className={styles.accessList}>
                {data.access.restricted.map((item) => (
                  <li
                    key={item}
                    className={`${styles.accessItem} ${styles.accessItemDim}`}
                  >
                    <XCircle
                      size={13}
                      className={styles.accessItemIconBad}
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.accessEmpty}>
                <CheckCircle size={16} className={styles.accessEmptyIcon} />
                <div>
                  <div className={styles.accessEmptyTitle}>
                    Everything is unlocked
                  </div>
                  <div className={styles.accessEmptyHint}>
                    No features are restricted on your current plan.
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={styles.accessColumn}>
            <div className={styles.accessHead}>
              <DollarSign size={14} className={styles.accessHeadNeutral} />
              <span>Your plan</span>
            </div>
            <ul className={styles.accessList}>
              <li className={styles.accessItem}>
                <CheckCircle size={13} className={styles.accessItemIcon} />
                <span>
                  Billed{' '}
                  {data.plan?.interval === 'YEARLY' ? 'yearly' : 'monthly'}
                </span>
              </li>
              <li className={styles.accessItem}>
                <CheckCircle size={13} className={styles.accessItemIcon} />
                <span>
                  {data.plan?.price
                    ? `${fmtMoney(data.plan.price, data.plan.currency)} per ${
                        data.plan.interval === 'YEARLY' ? 'year' : 'month'
                      }`
                    : 'Price set with us'}
                </span>
              </li>
              <li className={styles.accessItem}>
                <CheckCircle size={13} className={styles.accessItemIcon} />
                <span>
                  {data.isTrial ? 'On free trial' : 'Paid subscription'}
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* ============ HOW TO PAY + CONTACT ============ */}
      <div className={styles.twoCol}>
        <PaymentInstructions
          payment={data.payment}
          howToPay={data.howToPay}
        />

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}>
              <MessageCircle size={16} />
            </div>
            <div className={styles.cardHeaderText}>
              <div className={styles.cardLabel}>Talk to us</div>
            </div>
          </div>

          {data.payment?.contactPhone && (
            <div className={styles.contactRow}>
              <Phone size={14} className={styles.contactIcon} />
              <span className={styles.contactLabel}>Phone</span>
              <span className={styles.contactValue}>
                {data.payment.contactPhone}
              </span>
            </div>
          )}
          {data.payment?.contactEmail && (
            <div className={styles.contactRow}>
              <Mail size={14} className={styles.contactIcon} />
              <span className={styles.contactLabel}>Email</span>
              <span className={styles.contactValue}>
                {data.payment.contactEmail}
              </span>
            </div>
          )}

          <p className={styles.contactNote}>
            Questions about this plan or the amount due? Reach out to us on
WhatsApp and we'll confirm the details directly.
          </p>

          {data.payment?.contactPhone && (
            <a
              href={buildWhatsAppUrl(
                data.payment.contactPhone,
                activeOrganization.name
              )}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.whatsAppBtn}
            >
              <MessageCircle size={14} />
              <span>Open WhatsApp</span>
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>

      {/* ============ PAYMENT HISTORY ============ */}
      <PaymentHistory payments={payments} />
    </div>
  );
}