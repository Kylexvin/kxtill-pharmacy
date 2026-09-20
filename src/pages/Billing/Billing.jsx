// Products/kxtill/src/pages/Billing/Billing.jsx

import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../../contexts/AuthContext";
import { showToast } from "../../components/Common/Toast";
import styles from "./Billing.module.css";

const TONE = {
  TRIAL: "blue",
  ACTIVE: "green",
  GRACE: "yellow",
  EXPIRED: "red",
  SUSPENDED: "orange",
  CANCELLED: "gray",
};

const BADGE_BG = {
  blue: "rgba(64, 156, 255, 0.15)",
  green: "rgba(52, 199, 89, 0.15)",
  yellow: "rgba(255, 180, 0, 0.15)",
  red: "rgba(239, 83, 80, 0.15)",
  orange: "rgba(255, 106, 43, 0.15)",
  gray: "rgba(140, 140, 140, 0.15)",
};

const BADGE_FG = {
  blue: "#409cff",
  green: "#34c759",
  yellow: "#d9a300",
  red: "#ef5350",
  orange: "#ff6a2b",
  gray: "#9a9a9a",
};

function fmt(dateStr, withTime = false) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const opts = { year: "numeric", month: "short", day: "numeric" };
  if (withTime) {
    opts.hour = "2-digit";
    opts.minute = "2-digit";
  }
  return d.toLocaleDateString(undefined, opts);
}

function fmtMoney(amount, currency) {
  if (amount === null || amount === undefined) return "—";
  return `${currency || "KES"} ${Number(amount).toLocaleString()}`;
}

export default function Billing() {
  const { activeOrganization } = useAuth();
  const [data, setData] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  useEffect(() => {
    if (!activeOrganization?.id) return;
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [billingRes, paymentsRes] = await Promise.all([
          axios.get(`/organizations/${activeOrganization.id}/kxtill/billing`),
          axios.get(
            `/organizations/${activeOrganization.id}/kxtill/billing/payments`
          ),
        ]);
        if (!mounted) return;
        setData(billingRes.data.data);
        setPayments(paymentsRes.data.data || []);
      } catch (err) {
        if (!mounted) return;
        const s = err.response?.status;
        setError(
          s === 403
            ? "You don't have access to billing."
            : "Failed to load billing."
        );
        showToast.error(
          err.response?.data?.error || "Failed to load billing."
        );
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [activeOrganization?.id]);

  const copy = async (value, key) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      showToast.error("Copy failed");
    }
  };

  if (!activeOrganization) {
    return (
      <div className={styles.centered}>
        <p>Select an organization first.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.centered}>
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.centered}>
        <p>{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const tone = TONE[data.status] || "gray";
 
  const isWarning =
    data.status === "TRIAL" || data.status === "GRACE" || data.status === "EXPIRED";

  const showProgress =
    (data.status === "TRIAL" || data.status === "ACTIVE") &&
    data.phaseStartAt &&
    data.phaseEndsAt;

  const totalDays = showProgress
    ? Math.max(
        1,
        Math.round(
          (new Date(data.phaseEndsAt) - new Date(data.phaseStartAt)) / 86400000
        )
      )
    : 0;
  const elapsed = showProgress
    ? Math.min(
        totalDays,
        Math.round((Date.now() - new Date(data.phaseStartAt)) / 86400000)
      )
    : 0;
  const pct = showProgress ? Math.round((elapsed / totalDays) * 100) : 0;
  const barColor =
    pct >= 85 ? "#ef5350" : pct >= 60 ? "#d9a300" : "#34c759";

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Billing &amp; Subscription</h1>
        <p className={styles.subtitle}>
          {data.productName} for {activeOrganization.name}
        </p>
      </div>

      {/* ============ STATUS CARD ============ */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <div className={styles.cardLabel}>Current plan</div>
            <div className={styles.cardValue}>
              {data.plan?.name || "Standard"}
            </div>
            {data.plan?.price > 0 && (
              <div className={styles.cardSub}>
                {fmtMoney(data.plan.price, data.plan.currency)} /{" "}
                {data.plan.interval === "YEARLY" ? "year" : "month"}
              </div>
            )}
          </div>
          <Badge color={tone}>{data.status}</Badge>
        </div>

        {showProgress && (
          <div className={styles.progressWrap}>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${pct}%`, background: barColor }}
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

        <div className={styles.grid}>
          <KV
            label={data.isTrial ? "Trial started" : "Current period started"}
            value={fmt(data.phaseStartAt)}
          />
          <KV
            label={data.isTrial ? "Trial ends" : "Current period ends"}
            value={fmt(data.phaseEndsAt)}
          />
          {data.graceEnd && (
            <KV label="Grace ends" value={fmt(data.graceEnd)} />
          )}
          {!showProgress && data.remainingDays !== undefined && (
            <KV label="Days remaining" value={data.remainingDays ?? "—"} />
          )}
        </div>
      </div>

      {/* ============ WHAT HAPPENS NEXT ============ */}
      {data.whatHappensNext?.title && (
        <div
          className={`${styles.card} ${
            isWarning ? styles.cardWarn : ""
          }`}
        >
          <div className={styles.cardLabel}>What happens next</div>
          <div className={styles.nextTitle}>
            {data.whatHappensNext.title}
          </div>
          <p className={styles.nextBody}>{data.whatHappensNext.body}</p>
        </div>
      )}

      {/* ============ ACCESS ============ */}
      <div className={styles.card}>
        <div className={styles.cardLabel}>Your access</div>
        <div className={styles.accessGrid}>
          <div>
            <div className={styles.accessHead}>
              <span className={styles.dotGreen} /> Included now
            </div>
            <ul className={styles.accessList}>
              {data.access?.included?.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          {data.access?.restricted?.length > 0 && (
            <div>
              <div className={styles.accessHead}>
                <span className={styles.dotRed} /> Currently blocked
              </div>
              <ul className={styles.accessList}>
                {data.access.restricted.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ============ PAYMENT ============ */}
      <div className={styles.card}>
        <div className={styles.cardLabel}>How to pay</div>

        <div className={styles.amountBlock}>
          <div className={styles.amountLabel}>Amount due</div>
          <div className={styles.amountValue}>
            {data.payment?.displayAmount || "—"}
          </div>
          {data.payment?.amountIsCustom && (
            <div className={styles.amountNote}>
              Pricing is tailored to your usage. Contact us to confirm.
            </div>
          )}
        </div>

        <div className={styles.payGrid}>
          <PayRow
            label="Paybill"
            value={data.payment?.paybill}
            copied={copiedField === "paybill"}
            onCopy={() => copy(data.payment.paybill, "paybill")}
          />
          <PayRow
            label="Account number"
            value={data.payment?.accountNumber}
            copied={copiedField === "account"}
            onCopy={() => copy(data.payment.accountNumber, "account")}
          />
          {data.payment?.tillNumber && (
            <PayRow
              label="Buy Goods Till"
              value={data.payment.tillNumber}
              copied={copiedField === "till"}
              onCopy={() => copy(data.payment.tillNumber, "till")}
            />
          )}
          {data.payment?.mpesaPhone && (
            <PayRow
              label="M-Pesa number"
              value={data.payment.mpesaPhone}
              copied={copiedField === "phone"}
              onCopy={() => copy(data.payment.mpesaPhone, "phone")}
            />
          )}
          {data.payment?.bankName && (
            <PayRow
              label="Bank"
              value={`${data.payment.bankName} · ${data.payment.bankAccount} · ${data.payment.bankAccountName}`}
            />
          )}
        </div>

        {data.howToPay?.steps?.length > 0 && (
          <>
            <div className={styles.stepsLabel}>Steps</div>
            <ol className={styles.steps}>
              {data.howToPay.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </>
        )}

        {data.howToPay?.alternatives?.length > 0 && (
          <div className={styles.alternatives}>
            <div className={styles.stepsLabel}>Alternatives</div>
            <ul className={styles.accessList}>
              {data.howToPay.alternatives.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ============ PAYMENT HISTORY ============ */}
      <div className={styles.card}>
        <div className={styles.cardLabel}>Payment history</div>
        {payments.length === 0 ? (
          <div className={styles.empty}>No payments yet.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Period</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{fmt(p.paidAt || p.createdAt)}</td>
                  <td>{fmtMoney(p.amount, p.currency)}</td>
                  <td>{p.method || "—"}</td>
                  <td className={styles.mono}>{p.reference || "—"}</td>
                  <td>
                    {p.periodStart && p.periodEnd
                      ? `${fmt(p.periodStart)} → ${fmt(p.periodEnd)}`
                      : "—"}
                  </td>
                  <td>
                    <Badge
                      color={
                        p.status === "COMPLETED"
                          ? "green"
                          : p.status === "PENDING"
                          ? "yellow"
                          : "gray"
                      }
                    >
                      {p.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ============ CONTACT ============ */}
      <div className={styles.card}>
        <div className={styles.cardLabel}>Need help?</div>
        <div className={styles.contactRow}>
          <span>Email</span>
          <strong>{data.payment?.contactEmail}</strong>
        </div>
        {data.payment?.contactPhone && (
          <div className={styles.contactRow}>
            <span>Phone</span>
            <strong>{data.payment.contactPhone}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// INLINE COMPONENTS
// ============================================================

function KV({ label, value }) {
  return (
    <div className={styles.kv}>
      <div className={styles.kvLabel}>{label}</div>
      <div className={styles.kvValue}>{value}</div>
    </div>
  );
}

function Badge({ color = "gray", children }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        background: BADGE_BG[color] || BADGE_BG.gray,
        color: BADGE_FG[color] || BADGE_FG.gray,
      }}
    >
      {children}
    </span>
  );
}

function PayRow({ label, value, copied, onCopy }) {
  if (!value) return null;
  return (
    <div className={styles.payRow}>
      <div className={styles.payLabel}>{label}</div>
      <div className={styles.payValueWrap}>
        <span className={styles.payValue}>{value}</span>
        {onCopy && (
          <button
            type="button"
            className={styles.copyBtn}
            onClick={onCopy}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        border: "3px solid var(--border, #2a2a2e)",
        borderTopColor: "var(--accent, #ff6b2b)",
        borderRadius: "50%",
        animation: "billingSpin 0.8s linear infinite",
      }}
    >
      <style>{`@keyframes billingSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}