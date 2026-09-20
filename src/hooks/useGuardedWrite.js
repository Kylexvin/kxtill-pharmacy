import { useCallback } from "react";
import { useSubscription } from "../contexts/SubscriptionContext";
import { showToast } from "../components/Common/Toast";

function messageFor(status) {
  switch (status) {
    case "EXPIRED":
      return "Your subscription has expired. Contact KxByte to renew.";
    case "SUSPENDED":
      return "Your account is suspended. Contact KxByte.";
    case "CANCELLED":
      return "Your subscription is cancelled. Contact KxByte to reactivate.";
    case "GRACE":
      return "Read-only mode. Renew to restore write access.";
    case "UNKNOWN":
      return "We can't verify your subscription. Connect to the internet.";
    default:
      return "Action not allowed.";
  }
}

export function useGuardedWrite() {
  const { canWrite, status } = useSubscription();

  return useCallback(
    (fn) =>
      async (...args) => {
        if (!canWrite) {
          showToast.error(messageFor(status));
          return null;
        }
        try {
          return await fn(...args);
        } catch (err) {
          // Let the axios interceptor handle subscription blocks (already toasted)
          if (err?.isSubscriptionBlock) return null;
          throw err;
        }
      },
    [canWrite, status]
  );
}