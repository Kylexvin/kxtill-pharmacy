// src/pages/Support/Support.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  LifeBuoy,
  Plus,
  Search,
  X,

  AlertCircle,

  Loader2,
  ArrowLeft,
  Send,
  Lock,
  MessageSquare,
  Clock,
  Tag,
  Filter,
} from 'lucide-react';
import styles from './Support.module.css';

// ============================================================
// TYPES (JSDoc only — no TS here)
// ============================================================

// status: OPEN | IN_PROGRESS | RESOLVED | CLOSED
// priority: LOW | MEDIUM | HIGH | URGENT

// ============================================================
// HELPERS
// ============================================================

function getErrorMessage(error, fallback = 'Something went wrong') {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function formatRelative(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatAbsolute(dateStr) {
  return new Date(dateStr).toLocaleString('en-KE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function userName(u) {
  if (!u) return 'Unknown';
  return `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Unknown';
}

// ============================================================
// BADGES
// ============================================================

function StatusPill({ status }) {
  const map = {
    OPEN: { label: 'Open', className: styles.statusOpen },
    IN_PROGRESS: { label: 'In progress', className: styles.statusProgress },
    RESOLVED: { label: 'Resolved', className: styles.statusResolved },
    CLOSED: { label: 'Closed', className: styles.statusClosed },
  };
  const cfg = map[status] || map.OPEN;
  return <span className={`${styles.pill} ${cfg.className}`}>{cfg.label}</span>;
}

function PriorityPill({ priority }) {
  const map = {
    LOW: { label: 'Low', className: styles.priorityLow },
    MEDIUM: { label: 'Medium', className: styles.priorityMedium },
    HIGH: { label: 'High', className: styles.priorityHigh },
    URGENT: { label: 'Urgent', className: styles.priorityUrgent },
  };
  const cfg = map[priority] || map.MEDIUM;
  return <span className={`${styles.pill} ${cfg.className}`}>{cfg.label}</span>;
}

// ============================================================
// SKELETON
// ============================================================

function SkeletonBlock({ className }) {
  return <div className={`${styles.skeleton} ${className || ''}`} />;
}

function ListSkeleton() {
  return (
    <div className={styles.page} aria-busy="true" aria-live="polite">
      <span className={styles.srOnly}>Loading support…</span>

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <SkeletonBlock className={styles.skeletonAvatar} />
          <div style={{ flex: 1 }}>
            <SkeletonBlock className={styles.skeletonTitle} />
            <SkeletonBlock className={styles.skeletonSubtitle} />
          </div>
        </div>
        <SkeletonBlock className={styles.skeletonButton} />
      </div>

      <div className={styles.filtersBar}>
        <SkeletonBlock className={styles.skeletonSearch} />
        <SkeletonBlock className={styles.skeletonFilter} />
        <SkeletonBlock className={styles.skeletonFilter} />
      </div>

      <div className={styles.ticketList}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`t-${i}`} className={styles.skeletonTicket}>
            <SkeletonBlock className={styles.skeletonLine} />
            <SkeletonBlock className={styles.skeletonLineShort} />
            <SkeletonBlock className={styles.skeletonLineTiny} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function Support() {
  const { activeOrganization, user } = useAuth();
  const { isOwner, can } = usePermissions();

  const orgId = activeOrganization?.id;
  const currentUserId = user?.id;

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  const mountedRef = useRef(true);

  const canViewAll = isOwner || can('support.tickets.view');
  const canCreate = isOwner || can('support.tickets.create');
  const canManage = isOwner || can('support.tickets.manage');

  const isInboxView = canViewAll;

  // ============================================================
  // LOAD
  // ============================================================

  const loadList = useCallback(async () => {
    if (!orgId) return;
    try {
      const [ticketsRes, categoriesRes] = await Promise.all([
        axios.get(`/organizations/${orgId}/support/tickets`, {
          params: { productKey: 'kxtill' },
        }),
        axios.get(`/organizations/${orgId}/support/categories`),
      ]);
      if (!mountedRef.current) return;
      setTickets(ticketsRes.data.items || []);
      setCategories(categoriesRes.data.categories || []);
    } catch (err) {
      if (mountedRef.current) {
        toast.error(getErrorMessage(err, 'Failed to load tickets'));
      }
    }
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    mountedRef.current = true;
    setLoading(true);
    loadList().finally(() => {
      if (mountedRef.current) setLoading(false);
    });
    return () => {
      mountedRef.current = false;
    };
  }, [orgId, loadList]);

  // ============================================================
  // DETAIL
  // ============================================================

  const openTicket = async (ticketId) => {
    if (!orgId) return;
    setLoadingDetail(true);
    try {
      const res = await axios.get(
        `/organizations/${orgId}/support/tickets/${ticketId}`,
      );
      setSelectedTicket(res.data.ticket || null);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load ticket'));
    } finally {
      setLoadingDetail(false);
    }
  };

  const refreshDetail = async (ticketId) => {
    if (!orgId) return;
    try {
      const res = await axios.get(
        `/organizations/${orgId}/support/tickets/${ticketId}`,
      );
      setSelectedTicket(res.data.ticket || null);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to refresh ticket'));
    }
  };

  // ============================================================
  // FILTER
  // ============================================================

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (categoryFilter !== 'ALL' && t.category?.id !== categoryFilter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    });
  }, [tickets, searchQuery, statusFilter, categoryFilter]);

  // ============================================================
  // PERMISSION GATE
  // ============================================================

  if (!canCreate && !canViewAll) {
    return (
      <div className={styles.page}>
        <div className={styles.noAccess}>
          <Lock size={40} />
          <h2>Support is not available</h2>
          <p>
            You don&apos;t have permission to view or create support tickets.
          </p>
        </div>
      </div>
    );
  }

  if (loading) return <ListSkeleton />;

  // ============================================================
  // DETAIL VIEW
  // ============================================================

  if (selectedTicket) {
    return (
      <TicketDetailView
        ticket={selectedTicket}
        loading={loadingDetail}
        canManage={canManage}
        orgId={orgId}
        currentUserId={currentUserId}
        onBack={() => setSelectedTicket(null)}
        onRefresh={() => refreshDetail(selectedTicket.id)}
        onRefreshList={loadList}
      />
    );
  }

  // ============================================================
  // LIST VIEW
  // ============================================================

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerAvatar}>
            <LifeBuoy size={22} />
          </div>
          <div>
            <div className={styles.headerTitleRow}>
              <h1 className={styles.headerTitle}>
                {isInboxView ? 'KxTill support inbox' : 'Help & Support'}
              </h1>
              <span className={styles.orgBadge}>
                {activeOrganization?.name}
              </span>
            </div>
            <p className={styles.headerSubtitle}>
              {isInboxView
                ? 'Tickets from your team'
                : 'Something not right? Let us know.'}
            </p>
          </div>
        </div>
        {canCreate && !isInboxView && (
          <button
            className={styles.primaryButton}
            onClick={() => setShowCreate(true)}
          >
            <Plus size={16} />
            Report an issue
          </button>
        )}
      </div>

      {/* FILTERS */}
      {tickets.length > 0 && (
        <div className={styles.filtersBar}>
          <div className={styles.searchWrap}>
            <Search size={15} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search tickets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className={styles.filterGroup}>
            <select
              className={styles.filterSelect}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All statuses</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
            <select
              className={styles.filterSelect}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="ALL">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* LIST */}
      {tickets.length === 0 ? (
        <div className={styles.friendlyEmpty}>
          <div className={styles.friendlyEmptyIcon}>
            <LifeBuoy size={28} />
          </div>
          <h3>No tickets yet</h3>
          <p>
            {isInboxView
              ? "When your team runs into an issue, it'll show up here."
              : 'Something not working? Open a ticket and your organization owner will get back to you.'}
          </p>
          {!isInboxView && canCreate && (
            <button
              className={styles.primaryButton}
              onClick={() => setShowCreate(true)}
            >
              <Plus size={16} />
              Report an issue
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <Filter size={32} className={styles.emptyIcon} />
          <h3>No tickets match your filters</h3>
          <p>Try adjusting the search or filters.</p>
        </div>
      ) : (
        <div className={styles.ticketList}>
          {filtered.map((t) => (
            <button
              key={t.id}
              className={styles.ticketCard}
              onClick={() => openTicket(t.id)}
            >
              <div className={styles.ticketCardTop}>
                <div className={styles.ticketCardBadges}>
                  <StatusPill status={t.status} />
                  <PriorityPill priority={t.priority} />
                </div>
                <span className={styles.ticketTime}>
                  <Clock size={11} />
                  {formatRelative(t.createdAt)}
                </span>
              </div>

              <div className={styles.ticketTitle}>{t.title}</div>
              <div className={styles.ticketDesc}>{t.description}</div>

              <div className={styles.ticketMeta}>
                <span className={styles.ticketMetaItem}>
                  <Tag size={11} />
                  {t.category?.name || 'Uncategorized'}
                </span>
                <span className={styles.ticketMetaItem}>
                  <MessageSquare size={11} />
                  {t._count?.messages || 0} message
                  {(t._count?.messages || 0) === 1 ? '' : 's'}
                </span>
                {isInboxView && (
                  <span className={styles.ticketMetaItem}>
                    by {userName(t.user)}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* CREATE MODAL */}
      {showCreate && (
        <CreateTicketModal
          categories={categories}
          orgId={orgId}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await loadList();
            toast.success('Ticket created');
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// CREATE TICKET MODAL
// ============================================================

function CreateTicketModal({ categories, orgId, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (categories.length > 0 && !categoryId) {
      const other = categories.find((c) => c.slug === 'other') || categories[0];
      setCategoryId(other.id);
    }
  }, [categories, categoryId]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title.trim() || title.trim().length < 3) {
      toast.error('Title must be at least 3 characters.');
      return;
    }
    if (!description.trim() || description.trim().length < 10) {
      toast.error('Description must be at least 10 characters.');
      return;
    }
    if (!categoryId) {
      toast.error('Choose a category.');
      return;
    }

    setSaving(true);
    try {
      await axios.post(`/organizations/${orgId}/support/tickets`, {
        title: title.trim(),
        description: description.trim(),
        categoryId,
        priority,
        productKey: 'kxtill',
      });
      onCreated();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create ticket'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            <Plus size={18} />
            Report an issue
          </h2>
          <button className={styles.modalClose} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary of the issue"
              autoFocus
              maxLength={120}
            />
          </div>

          <div className={styles.formGroup}>
            <label>What happened?</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue. What did you expect to happen?"
              rows={5}
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {categories.length === 0 ? (
                  <option value="">Loading…</option>
                ) : (
                  categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={saving}
            >
              {saving ? (
                <Loader2 size={15} className={styles.spinning} />
              ) : (
                <Send size={15} />
              )}
              {saving ? 'Creating…' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// TICKET DETAIL VIEW
// ============================================================

function TicketDetailView({
  ticket,
  loading,
  canManage,
  orgId,
  currentUserId,
  onBack,
  onRefresh,
  onRefreshList,
}) {
  const [reply, setReply] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const handleSend = async () => {
    if (!reply.trim() || reply.trim().length < 2) return;
    setSending(true);
    try {
      await axios.post(
        `/organizations/${orgId}/support/tickets/${ticket.id}/messages`,
        {
          message: reply.trim(),
          isInternal,
        },
      );
      setReply('');
      setIsInternal(false);
      onRefresh();
      toast.success('Reply sent');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to send reply'));
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (status) => {
    if (status === ticket.status) return;
    setUpdatingStatus(true);
    try {
      await axios.patch(
        `/organizations/${orgId}/support/tickets/${ticket.id}`,
        { status },
      );
      onRefresh();
      onRefreshList();
      toast.success('Status updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update status'));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handlePriorityChange = async (priority) => {
    if (priority === ticket.priority) return;
    setUpdatingStatus(true);
    try {
      await axios.patch(
        `/organizations/${orgId}/support/tickets/${ticket.id}`,
        { priority },
      );
      onRefresh();
      onRefreshList();
      toast.success('Priority updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update priority'));
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className={styles.page}>
      <button className={styles.backButton} onClick={onBack}>
        <ArrowLeft size={14} />
        Back to tickets
      </button>

      <div className={styles.detailHeader}>
        <div className={styles.detailHeaderMain}>
          <h1 className={styles.detailTitle}>{ticket.title}</h1>
          <div className={styles.detailBadges}>
            <StatusPill status={ticket.status} />
            <PriorityPill priority={ticket.priority} />
            {ticket.category && (
              <span className={styles.categoryPill}>
                <Tag size={11} />
                {ticket.category.name}
              </span>
            )}
          </div>
          <div className={styles.detailMeta}>
            Opened by {userName(ticket.user)} · {formatAbsolute(ticket.createdAt)}
          </div>
        </div>

        {canManage && (
          <div className={styles.detailControls}>
            <select
              className={styles.detailSelect}
              value={ticket.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={updatingStatus}
            >
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
            <select
              className={styles.detailSelect}
              value={ticket.priority}
              onChange={(e) => handlePriorityChange(e.target.value)}
              disabled={updatingStatus}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
        )}
      </div>

      <div className={styles.originalMessage}>
        <div className={styles.messageHeader}>
          <span className={styles.messageAuthor}>{userName(ticket.user)}</span>
          <span className={styles.messageTime}>
            {formatAbsolute(ticket.createdAt)}
          </span>
        </div>
        <div className={styles.messageBody}>{ticket.description}</div>
      </div>

      {loading ? (
        <div className={styles.detailLoading}>
          <Loader2 size={20} className={styles.spinning} />
          <span>Loading…</span>
        </div>
      ) : ticket.messages?.length === 0 ? (
        <div className={styles.emptyThread}>No replies yet.</div>
      ) : (
        <div className={styles.thread}>
          {(ticket.messages || []).map((m) => {
            const isMine = m.userId === currentUserId;
            return (
              <div
                key={m.id}
                className={`${styles.messageItem} ${
                  isMine ? styles.messageMine : ''
                } ${m.isInternal ? styles.messageInternal : ''}`}
              >
                <div className={styles.messageHeader}>
                  <span className={styles.messageAuthor}>
                    {userName(m.user)}
                    {m.isInternal && (
                      <span className={styles.internalTag}>Internal</span>
                    )}
                  </span>
                  <span className={styles.messageTime}>
                    {formatAbsolute(m.createdAt)}
                  </span>
                </div>
                <div className={styles.messageBody}>{m.message}</div>
              </div>
            );
          })}
        </div>
      )}

      {ticket.status !== 'CLOSED' ? (
        <div className={styles.replyBox}>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write a reply…"
            rows={3}
            className={styles.replyInput}
          />
          <div className={styles.replyActions}>
            {canManage && (
              <label className={styles.internalToggle}>
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                />
                Internal note
              </label>
            )}
            <button
              className={styles.submitButton}
              onClick={handleSend}
              disabled={sending || reply.trim().length < 2}
            >
              {sending ? (
                <Loader2 size={15} className={styles.spinning} />
              ) : (
                <Send size={15} />
              )}
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.closedBanner}>
          <AlertCircle size={14} />
          This ticket is closed. Reopen it from the status selector above if
          needed.
        </div>
      )}
    </div>
  );
}