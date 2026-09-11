// src/pages/Customers/components/CustomerModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { X, UserPlus, UserCog, AlertCircle } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';
import styles from './CustomerModal.module.css';

const CUSTOMER_TYPES = [
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'BUSINESS', label: 'Business' },
];

const SOURCES = [
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'OTHER', label: 'Other' },
];

const CustomerModal = ({
  isOpen,
  onClose,
  onCreated,
  onUpdated,
  mode = 'create',
  customer = null,
}) => {
  const { activeOrganization } = useAuth();
  const orgId = activeOrganization?.id;

  const isEdit = mode === 'edit';

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    customerType: 'INDIVIDUAL',
    source: 'WALK_IN',
    companyName: '',
    taxNumber: '',
    notes: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const nameInputRef = useRef(null);

  // Prefill / reset on open
  useEffect(() => {
    if (!isOpen) return;

    if (isEdit && customer) {
      setFormData({
        name: customer.name || '',
        phone: customer.phone || '',
        email: customer.email || '',
        customerType: customer.customerType || 'INDIVIDUAL',
        source: customer.source || 'WALK_IN',
        companyName: customer.companyName || '',
        taxNumber: customer.taxNumber || '',
        notes: customer.notes || '',
      });
    } else {
      setFormData({
        name: '',
        phone: '',
        email: '',
        customerType: 'INDIVIDUAL',
        source: 'WALK_IN',
        companyName: '',
        taxNumber: '',
        notes: '',
      });
    }
    setError('');
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }, [isOpen, isEdit, customer]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }

    if (!orgId) {
      setError('No organization selected');
      return;
    }

    const payload = {
      name: formData.name.trim(),
      customerType: formData.customerType,
      source: formData.source,
    };

    if (formData.phone.trim()) payload.phone = formData.phone.trim();
    if (formData.email.trim()) payload.email = formData.email.trim();
    if (formData.companyName.trim() && formData.customerType === 'BUSINESS') {
      payload.companyName = formData.companyName.trim();
    }
    if (formData.taxNumber.trim() && formData.customerType === 'BUSINESS') {
      payload.taxNumber = formData.taxNumber.trim();
    }
    if (formData.notes.trim()) payload.notes = formData.notes.trim();

    setSubmitting(true);
    setError('');

    try {
      let response;
      if (isEdit && customer?.id) {
        response = await axios.patch(
          `/organizations/${orgId}/kxtill/customers/${customer.id}`,
          payload,
          { timeout: 10000 }
        );
      } else {
        response = await axios.post(
          `/organizations/${orgId}/kxtill/customers`,
          payload,
          { timeout: 10000 }
        );
      }

      const saved = response.data?.customer || response.data;
      if (!saved?.id) throw new Error('Invalid response from server');

      if (isEdit) {
        onUpdated?.(saved);
      } else {
        toast.success(`${saved.name} added`);
        onCreated?.(saved);
      }
    } catch (err) {
      const status = err.response?.status;
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        (isEdit ? 'Failed to update customer' : 'Failed to create customer');

      if (status === 400) {
        setError(message);
      } else if (status === 403) {
        setError('You do not have permission to modify this customer');
      } else if (status === 404) {
        setError('Customer not found');
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const isBusiness = formData.customerType === 'BUSINESS';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>
            {isEdit ? <UserCog size={18} /> : <UserPlus size={18} />}
            <span>{isEdit ? 'Edit Customer' : 'Add Customer'}</span>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={submitting}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.body}>
          <div className={styles.formGrid}>
            <div className={styles.formGroupFull}>
              <label>Name *</label>
              <input
                ref={nameInputRef}
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Mary Jane"
                required
                disabled={submitting}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Phone</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="e.g. 0712345678"
                disabled={submitting}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="e.g. mary@example.com"
                disabled={submitting}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Customer Type</label>
              <select
                name="customerType"
                value={formData.customerType}
                onChange={handleChange}
                disabled={submitting}
              >
                {CUSTOMER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Source</label>
              <select
                name="source"
                value={formData.source}
                onChange={handleChange}
                disabled={submitting}
              >
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {isBusiness && (
              <>
                <div className={styles.formGroup}>
                  <label>Company Name</label>
                  <input
                    type="text"
                    name="companyName"
                    value={formData.companyName}
                    onChange={handleChange}
                    placeholder="e.g. Kamau Traders Ltd"
                    disabled={submitting}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Tax Number</label>
                  <input
                    type="text"
                    name="taxNumber"
                    value={formData.taxNumber}
                    onChange={handleChange}
                    placeholder="e.g. P0512345678"
                    disabled={submitting}
                  />
                </div>
              </>
            )}

            <div className={styles.formGroupFull}>
              <label>Notes</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Optional notes about this customer"
                rows={2}
                disabled={submitting}
              />
            </div>
          </div>

          {error && (
            <div className={styles.errorMessage}>
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={submitting || !formData.name.trim()}
            >
              {submitting
                ? isEdit
                  ? 'Saving...'
                  : 'Creating...'
                : isEdit
                  ? 'Save Changes'
                  : 'Add Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CustomerModal;