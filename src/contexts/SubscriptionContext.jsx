// src/contexts/SubscriptionContext.jsx

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { useAuth } from "./AuthContext";
import {
  getCachedSubscription,
  setCachedSubscription,
} from "../db/sqlite";

const SubscriptionContext = createContext(null);

const GRACE_FALLBACK_DAYS = 2;

function safeTs(d) {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Locally derive subscription state from cached payload + local clock.
 * Works offline. Never trusts the payload's status alone — recomputes.
 */
function deriveState(cached) {
  if (!cached) {
    return {
      status: "UNKNOWN",
      canRead: false,
      canWrite: false,
      remainingDays: null,
      phaseEndsAt: null,
      graceEndsAt: null,
      isOfflineDerived: false,
      raw: null,
    };
  }

  const now = Date.now();
  const status = cached.status;
  const trialEndTs = safeTs(cached.trialEnd);
  const periodEndTs = safeTs(cached.currentPeriodEnd);
  const graceEndTs = safeTs(cached.graceEnd);

  let derived = status;
  let isOfflineDerived = false;

  // TRIAL expired?
  if (status === "TRIAL" && trialEndTs && now > trialEndTs) {
    const effectiveGraceEnd =
      graceEndTs || trialEndTs + GRACE_FALLBACK_DAYS * 86400000;
    if (now > effectiveGraceEnd) {
      derived = "EXPIRED";
    } else {
      derived = "GRACE";
    }
    isOfflineDerived = true;
  }

  // ACTIVE expired?
  if (status === "ACTIVE" && periodEndTs && now > periodEndTs) {
    const effectiveGraceEnd =
      graceEndTs || periodEndTs + GRACE_FALLBACK_DAYS * 86400000;
    if (now > effectiveGraceEnd) {
      derived = "EXPIRED";
    } else {
      derived = "GRACE";
    }
    isOfflineDerived = true;
  }

  // GRACE expired?
  if (status === "GRACE" && graceEndTs && now > graceEndTs) {
    derived = "EXPIRED";
    isOfflineDerived = true;
  }

  // eslint-disable-next-line no-unused-vars
  const canRead = derived !== "EXPIRED" || false;
  // Our server middleware blocks reads on EXPIRED too, so mirror it:
  const finalCanRead = derived === "TRIAL" || derived === "ACTIVE" || derived === "GRACE";
  const canWrite = derived === "TRIAL" || derived === "ACTIVE";

  let remainingDays = null;
  if (derived === "TRIAL" && trialEndTs) {
    remainingDays = Math.max(0, Math.ceil((trialEndTs - now) / 86400000));
  } else if (derived === "ACTIVE" && periodEndTs) {
    remainingDays = Math.max(0, Math.ceil((periodEndTs - now) / 86400000));
  } else if (derived === "GRACE" && graceEndTs) {
    remainingDays = Math.max(0, Math.ceil((graceEndTs - now) / 86400000));
  }

  const phaseEndsAt =
    derived === "TRIAL" ? cached.trialEnd :
    derived === "ACTIVE" ? cached.currentPeriodEnd :
    derived === "GRACE" ? cached.graceEnd :
    null;

  return {
    status: derived,
    canRead: finalCanRead,
    canWrite,
    remainingDays,
    phaseEndsAt,
    graceEndsAt: cached.graceEnd || null,
    isOfflineDerived,
    raw: cached,
  };
}

export function SubscriptionProvider({ children }) {
  const { activeOrganization } = useAuth();
  const [state, setState] = useState(() => deriveState(null));
  const [lastFetchAt, setLastFetchAt] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!activeOrganization?.id) {
      setState(deriveState(null));
      return;
    }

    // 1. Instant: load cached and derive
    try {
      const cached = await getCachedSubscription(activeOrganization.id);
      if (mountedRef.current) setState(deriveState(cached));
    } catch (err) {
      console.warn("cache read failed", err);
    }

    // 2. Try server
    try {
      const { data } = await axios.get(
        `/organizations/${activeOrganization.id}/kxtill/billing`
      );
      const fresh = data.data;
      await setCachedSubscription(activeOrganization.id, fresh);
      if (mountedRef.current) {
        setState(deriveState(fresh));
        setLastFetchAt(new Date().toISOString());
        setFetchError(null);
      }
    } catch (err) {
      // Offline or error — keep cached state, don't wipe.
      if (mountedRef.current) {
        setFetchError(
          err.response?.data?.error || err.message || "offline"
        );
      }
    }
  }, [activeOrganization?.id]);

  // Initial load + re-run when org changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll every 5 min while tab is visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Refresh on tab focus
  useEffect(() => {
    const onFocus = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Refresh every minute for remainingDays countdown accuracy when state is TIME-sensitive
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <SubscriptionContext.Provider
      value={{
        ...state,
        refresh,
        lastFetchAt,
        fetchError,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export const useSubscription = () => {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used inside SubscriptionProvider");
  return ctx;
};