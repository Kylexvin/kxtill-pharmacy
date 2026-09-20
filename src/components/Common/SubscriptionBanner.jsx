// src/components/Common/SubscriptionBanner.jsx

import { useSubscription } from "../../contexts/SubscriptionContext";
import { useNavigate } from "react-router-dom";
import { Info, AlertTriangle, Lock, Ban, XCircle } from "lucide-react";
import styles from "./SubscriptionBanner.module.css";

const VISIBLE_STATUSES = ["TRIAL", "ACTIVE", "GRACE", "EXPIRED", "SUSPENDED", "CANCELLED"];

const CONFIG = {
  TRIAL: {
    icon: Info,
    bg: "rgba(64, 156, 255, 0.10)",
    border: "rgba(64, 156, 255, 0.30)",
    color: "#409cff",
    label: "Trial",
    message: (d) =>
      `${d.remainingDays ?? 0} day${d.remainingDays === 1 ? "" : "s"} left in your trial`,
    cta: null,
  },
  ACTIVE: {
    icon: AlertTriangle,
    bg: "rgba(255, 180, 0, 0.10)",
    border: "rgba(255, 180, 0, 0.35)",
    color: "#d9a300",
    label: "Renew soon",
    message: (d) =>
      `Ends in ${d.remainingDays ?? 0} day${d.remainingDays === 1 ? "" : "s"} — renew to avoid interruption`,
    cta: "Renew",
  },
  GRACE: {
    icon: AlertTriangle,
    bg: "rgba(255, 180, 0, 0.12)",
    border: "rgba(255, 180, 0, 0.45)",
    color: "#d9a300",
    label: "Read-only",
    message: (d) =>
      `Writes paused. Renew before ${
        d.phaseEndsAt ? new Date(d.phaseEndsAt).toLocaleDateString() : "grace ends"
      }`,
    cta: "Renew",
  },
  EXPIRED: {
    icon: Lock,
    bg: "rgba(239, 83, 80, 0.12)",
    border: "rgba(239, 83, 80, 0.45)",
    color: "#ef5350",
    label: "Expired",
    message: () => "Writes blocked until renewal",
    cta: "Renew",
  },
  SUSPENDED: {
    icon: Ban,
    bg: "rgba(255, 106, 43, 0.12)",
    border: "rgba(255, 106, 43, 0.45)",
    color: "#ff6a2b",
    label: "Suspended",
    message: () => "Contact KxByte to restore access",
    cta: "Contact",
  },
  CANCELLED: {
    icon: XCircle,
    bg: "rgba(140, 140, 140, 0.12)",
    border: "rgba(140, 140, 140, 0.45)",
    color: "#9a9a9a",
    label: "Cancelled",
    message: () => "Reactivate to restore access",
    cta: "Reactivate",
  },
};

export default function SubscriptionBanner() {
  const { status, remainingDays, phaseEndsAt, isOfflineDerived } = useSubscription();
  const navigate = useNavigate();

  if (!VISIBLE_STATUSES.includes(status)) return null;
  if (status === "ACTIVE" && (remainingDays === null || remainingDays > 5)) return null;

  const c = CONFIG[status];
  if (!c) return null;

  const Icon = c.icon;

  return (
    <div
      className={styles.banner}
      style={{
        background: c.bg,
        borderBottomColor: c.border,
        color: c.color,
      }}
    >
      <Icon size={16} className={styles.icon} />

      <div className={styles.body}>
        <span
          className={styles.label}
          style={{ background: c.border, color: c.color }}
        >
          {c.label}
        </span>
        <span className={styles.message}>
          {c.message({ remainingDays, phaseEndsAt })}
          {isOfflineDerived && (
            <span className={styles.offline}>(offline estimate)</span>
          )}
        </span>
      </div>

      {c.cta && (
        <button
          onClick={() => navigate("/billing")}
          className={styles.cta}
          style={{ borderColor: c.border, color: c.color }}
        >
          {c.cta}
        </button>
      )}
    </div>
  );
}