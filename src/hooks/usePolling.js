// src/hooks/usePolling.js
import { useEffect, useRef } from 'react';

/**
 * Polling hook that pauses when the browser tab is hidden.
 *
 * Why this exists:
 *   Plain setInterval keeps firing while the user is on another tab,
 *   burning network requests for data they aren't looking at.
 *   This hook stops the timer when the tab is hidden and resumes
 *   (with an immediate catch-up call) when it becomes visible again.
 *
 * Usage:
 *   usePolling(fetchData, 60_000, [orgId, branchId]);
 *
 * Behavior:
 *   - Calls `callback` immediately on mount.
 *   - Then calls it every `intervalMs` while the tab is visible.
 *   - Skips ticks while hidden.
 *   - Immediately calls once when the tab becomes visible again.
 *   - Cleans up on unmount or when any dep changes.
 *
 * Callback is captured via ref so you don't need to memoize it —
 * only the `intervalMs` and `deps` need to be stable.
 */
export function usePolling(callback, intervalMs, deps = []) {
  const callbackRef = useRef(callback);

  // Keep the ref current without re-running the effect
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!intervalMs || intervalMs <= 0) return;

    let intervalId = null;
    let isMounted = true;

    const tick = () => {
      if (!isMounted) return;
      if (document.visibilityState === 'visible') {
        callbackRef.current();
      }
    };

    const start = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(tick, intervalMs);
    };

    const stop = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Catch up immediately when returning to the tab
        tick();
        start();
      } else {
        stop();
      }
    };

    // Initial run + timer start
    tick();
    start();

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
}

export default usePolling;