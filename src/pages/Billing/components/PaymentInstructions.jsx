// Products/kxtill/src/pages/Billing/components/PaymentInstructions.jsx
import { useState } from 'react';
import { Copy, Check, Wallet } from 'lucide-react';
import { showToast } from '../../../components/Common/Toast';
import styles from '../Billing.module.css';

const PaymentInstructions = ({ payment, howToPay }) => {
  const [copiedKey, setCopiedKey] = useState(null);

  const copy = async (value, key) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      showToast.error('Copy failed');
    }
  };

  if (!payment) return null;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardIcon}>
          <Wallet size={16} />
        </div>
        <div className={styles.cardHeaderText}>
          <div className={styles.cardLabel}>How to pay</div>
        </div>
      </div>

      {payment.amountIsCustom && (
        <div className={styles.customNote}>
          The amount due is confirmed by the shop owner. If this looks
          wrong, message them before paying.
        </div>
      )}

      <div className={styles.payList}>
        <PayRow
          label="Paybill"
          value={payment.paybill}
          copied={copiedKey === 'paybill'}
          onCopy={() => copy(payment.paybill, 'paybill')}
        />
        <PayRow
          label="Account number"
          value={payment.accountNumber}
          copied={copiedKey === 'account'}
          onCopy={() => copy(payment.accountNumber, 'account')}
        />
        <PayRow
          label="Buy Goods Till"
          value={payment.tillNumber}
          copied={copiedKey === 'till'}
          onCopy={() => copy(payment.tillNumber, 'till')}
        />
        <PayRow
          label="M-Pesa number"
          value={payment.mpesaPhone}
          copied={copiedKey === 'phone'}
          onCopy={() => copy(payment.mpesaPhone, 'phone')}
        />
        {payment.bankName && (
          <PayRow
            label="Bank"
            value={`${payment.bankName} · ${payment.bankAccount} · ${payment.bankAccountName}`}
          />
        )}
      </div>

      {howToPay?.steps?.length > 0 && (
        <div className={styles.stepsBlock}>
          <div className={styles.stepsLabel}>Steps</div>
          <ol className={styles.steps}>
            {howToPay.steps.map((step, i) => (
              <li key={i}>
                <span className={styles.stepNum}>{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {howToPay?.alternatives?.length > 0 && (
        <div className={styles.stepsBlock}>
          <div className={styles.stepsLabel}>Alternatives</div>
          <ul className={styles.altList}>
            {howToPay.alternatives.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const PayRow = ({ label, value, copied, onCopy }) => {
  if (!value) return null;
  return (
    <div className={styles.payRow}>
      <span className={styles.payLabel}>{label}</span>
      <div className={styles.payValueWrap}>
        <span className={styles.payValue}>{value}</span>
        {onCopy && (
          <button
            type="button"
            className={styles.copyBtn}
            onClick={onCopy}
            aria-label={`Copy ${label}`}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default PaymentInstructions;