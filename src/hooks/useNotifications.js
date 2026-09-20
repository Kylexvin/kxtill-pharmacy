// src/hooks/useNotifications.js
import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const POLL_MS = 60000;

export function useNotifications({ productKey, organizationId, limit = 20 } = {}) {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const params = { limit };
      if (productKey) params.productKey = productKey;
      if (organizationId) params.organizationId = organizationId;

      const [listRes, countRes] = await Promise.all([
        axios.get('/notifications', { params }),
        axios.get('/notifications/unread/count', {
          params: productKey ? { productKey } : {},
        }),
      ]);

      if (!mountedRef.current) return;
      setItems(listRes.data.items || []);
      setUnreadCount(countRes.data.unreadCount || 0);
    } catch (err) {
      if (err.response?.status !== 401) {
        console.warn('notifications fetch failed:', err.message);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [productKey, organizationId, limit]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchAll();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const markAsRead = useCallback(async (id) => {
    try {
      await axios.patch(`/notifications/${id}/read`);
      if (!mountedRef.current) return;
      setItems((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, readAt: new Date().toISOString() } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.warn('mark read failed:', err.message);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await axios.patch('/notifications/read/all');
      if (!mountedRef.current) return;
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || now })));
      setUnreadCount(0);
    } catch (err) {
      console.warn('mark all read failed:', err.message);
    }
  }, []);

  return {
    items,
    unreadCount,
    loading,
    refresh: fetchAll,
    markAsRead,
    markAllAsRead,
  };
}