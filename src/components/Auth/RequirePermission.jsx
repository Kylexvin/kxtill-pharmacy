// src/components/Auth/RequirePermission.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { usePermissions } from '../../contexts/PermissionsContext';
import styles from './RequirePermission.module.css';

const RequirePermission = ({
  ownerOnly = false,
  permission,
  anyOf,
  allOf,
  redirectTo = '/pos',
  silent = false,
  children,
}) => {
  const { can, canAny, canAll, isOwner } = usePermissions();

  let allowed = true;

  if (ownerOnly) {
    allowed = isOwner;
  } else if (permission) {
    allowed = can(permission);
  } else if (Array.isArray(anyOf) && anyOf.length > 0) {
    allowed = canAny(anyOf);
  } else if (Array.isArray(allOf) && allOf.length > 0) {
    allowed = canAll(allOf);
  }

  if (allowed) return children;
  if (silent) return null;
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <Shield size={40} className={styles.icon} />
        <h2 className={styles.title}>Access Denied</h2>
        <p className={styles.text}>
          You don't have permission to view this page.
        </p>
        <p className={styles.sub}>
          Contact your organization owner if you believe this is a mistake.
        </p>
      </div>
    </div>
  );
};

export default RequirePermission;