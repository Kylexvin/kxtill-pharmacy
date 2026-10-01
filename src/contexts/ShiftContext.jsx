// src/contexts/ShiftContext.jsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

const ShiftContext = createContext(null);

export function ShiftProvider({ children }) {
  const { activeOrganization, activeBranch, accessToken, isOffline } = useAuth();

  const orgId = activeOrganization?.id || null;
  const branchId = activeBranch?.id || null;

  const [currentShift, setCurrentShift] = useState(null);
  const [shiftsEnabled, setShiftsEnabled] = useState(false);
  const [varianceThreshold, setVarianceThreshold] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchControllerRef = useRef(null);
  const isMountedRef = useRef(true);

  const fetchShiftState = useCallback(async () => {
    if (!orgId || !branchId || !accessToken) {
      setCurrentShift(null);
      setShiftsEnabled(false);
      setVarianceThreshold(50);
      setError(null);
      return;
    }

    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const [shiftRes, settingRes] = await Promise.allSettled([
        axios.get(`/organizations/${orgId}/kxtill/shifts/current`, {
          signal: controller.signal,
          timeout: 10000,
        }),
        axios.get(
          `/organizations/${orgId}/kxtill/branches/${branchId}/settings`,
          { signal: controller.signal, timeout: 10000 }
        ),
      ]);

      if (controller.signal.aborted || !isMountedRef.current) return;

      if (shiftRes.status === 'fulfilled') {
        setCurrentShift(shiftRes.value.data?.shift || null);
      } else {
        setCurrentShift(null);
      }

      if (settingRes.status === 'fulfilled') {
        const s = settingRes.value.data?.setting || {};
        setShiftsEnabled(!!s.shiftsEnabled);
        setVarianceThreshold(Number(s.varianceThreshold ?? 50));
      } else {
        setShiftsEnabled(false);
        setVarianceThreshold(50);
      }

      if (
        shiftRes.status === 'rejected' &&
        settingRes.status === 'rejected'
      ) {
        const err = shiftRes.reason || settingRes.reason;
        if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
          setError(
            err?.response?.data?.error ||
              err?.response?.data?.message ||
              'Failed to load shift state'
          );
        }
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      if (isMountedRef.current) {
        setError(
          err.response?.data?.error ||
            err.response?.data?.message ||
            'Failed to load shift state'
        );
      }
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [orgId, branchId, accessToken]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      fetchControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!orgId || !branchId || !accessToken) {
      setCurrentShift(null);
      setShiftsEnabled(false);
      setVarianceThreshold(50);
      return;
    }
    fetchShiftState();
  }, [orgId, branchId, accessToken, fetchShiftState]);

  const refresh = useCallback(async () => {
    await fetchShiftState();
  }, [fetchShiftState]);

  // -------- guard: unsynced sales block close --------
  const assertNoPendingSales = useCallback(async () => {
    if (!branchId) return;
    const { getPendingSalesCount, getFailedSalesCount } = await import(
      '../db/sqlite'
    );
    const [pending, failed] = await Promise.all([
      getPendingSalesCount(branchId),
      getFailedSalesCount(branchId),
    ]);
    const unsynced = pending + failed;
    if (unsynced > 0) {
      throw new Error(
        `Cannot close shift — ${unsynced} sale${
          unsynced > 1 ? 's' : ''
        } pending sync. Sync first, then close.`
      );
    }
  }, [branchId]);

  // -------- open --------
  const openShift = useCallback(
    async (openingFloat, tillId = null) => {
      if (!orgId || !branchId) {
        throw new Error('No active organization or branch');
      }
      const res = await axios.post(
        `/organizations/${orgId}/kxtill/shifts/open`,
        { branchId, openingFloat, tillId }
      );
      const shift = res.data?.shift || null;
      if (isMountedRef.current) setCurrentShift(shift);
      return shift;
    },
    [orgId, branchId]
  );

  // -------- close --------
  const closeShift = useCallback(
    async (declaredCash) => {
      if (!orgId || !currentShift?.id) {
        throw new Error('No open shift');
      }
      await assertNoPendingSales();
      const res = await axios.post(
        `/organizations/${orgId}/kxtill/shifts/${currentShift.id}/close`,
        { declaredCash }
      );
      const shift = res.data?.shift || null;
      if (isMountedRef.current) setCurrentShift(null);
      return shift;
    },
    [orgId, currentShift, assertNoPendingSales]
  );

  // -------- cancel --------
  const cancelShift = useCallback(async () => {
    if (!orgId || !currentShift?.id) {
      throw new Error('No open shift');
    }
    await assertNoPendingSales();
    const res = await axios.post(
      `/organizations/${orgId}/kxtill/shifts/${currentShift.id}/cancel`
    );
    if (isMountedRef.current) setCurrentShift(null);
    return res.data?.shift || null;
  }, [orgId, currentShift, assertNoPendingSales]);

  // -------- handover: request --------
  const requestHandover = useCallback(
    async (note = null) => {
      if (!orgId || !currentShift?.id) {
        throw new Error('No open shift');
      }
      const res = await axios.post(
        `/organizations/${orgId}/kxtill/shifts/${currentShift.id}/handover/request`,
        { note }
      );
      const shift = res.data?.shift || null;
      if (isMountedRef.current) setCurrentShift(shift);
      return shift;
    },
    [orgId, currentShift]
  );

  // -------- handover: resolve --------
  const resolveHandover = useCallback(
    async (declaredCash, note = null) => {
      if (!orgId || !currentShift?.id) {
        throw new Error('No open shift');
      }
      await assertNoPendingSales();
      const res = await axios.post(
        `/organizations/${orgId}/kxtill/shifts/${currentShift.id}/handover/resolve`,
        { declaredCash, note }
      );
      const shift = res.data?.shift || null;
      if (isMountedRef.current) setCurrentShift(null);
      return shift;
    },
    [orgId, currentShift, assertNoPendingSales]
  );

  // -------- handover: reject --------
  const rejectHandover = useCallback(
    async (note = null) => {
      if (!orgId || !currentShift?.id) {
        throw new Error('No open shift');
      }
      const res = await axios.post(
        `/organizations/${orgId}/kxtill/shifts/${currentShift.id}/handover/reject`,
        { note }
      );
      const shift = res.data?.shift || null;
      if (isMountedRef.current) setCurrentShift(shift);
      return shift;
    },
    [orgId, currentShift]
  );

  const hasOpenShift = !!currentShift;

  const value = useMemo(
    () => ({
      currentShift,
      shiftsEnabled,
      varianceThreshold,
      loading,
      error,
      isOffline,
      hasOpenShift,
      refresh,
      openShift,
      closeShift,
      cancelShift,
      requestHandover,
      resolveHandover,
      rejectHandover,
    }),
    [
      currentShift,
      shiftsEnabled,
      varianceThreshold,
      loading,
      error,
      isOffline,
      hasOpenShift,
      refresh,
      openShift,
      closeShift,
      cancelShift,
      requestHandover,
      resolveHandover,
      rejectHandover,
    ]
  );

  return (
    <ShiftContext.Provider value={value}>{children}</ShiftContext.Provider>
  );
}

export function useShift() {
  const ctx = useContext(ShiftContext);
  if (!ctx) {
    throw new Error('useShift must be used within a ShiftProvider');
  }
  return ctx;
}

export default ShiftContext;