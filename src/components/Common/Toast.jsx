import React from 'react';
import toast, { Toaster as HotToaster } from 'react-hot-toast';
import { CheckCircle, AlertCircle, Loader } from 'lucide-react';

// Toast wrapper component to be placed in root
export const Toaster = () => {
  return (
    <HotToaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: '#333',
          color: '#fff',
          borderRadius: '8px',
          padding: '16px',
        },
        success: {
          style: {
            background: '#22c55e',
            color: '#fff',
          },
          icon: <CheckCircle size={20} />,
        },
        error: {
          style: {
            background: '#ef4444',
            color: '#fff',
          },
          icon: <AlertCircle size={20} />,
        },
        loading: {
          style: {
            background: '#3b82f6',
            color: '#fff',
          },
          icon: <Loader size={20} className="animate-spin" />,
        },
      }}
    />
  );
};

// Toast helper functions
export const showToast = {
  success: (message) => toast.success(message),
  error: (message) => toast.error(message),
  loading: (message) => toast.loading(message),
  dismiss: (toastId) => toast.dismiss(toastId),
  custom: (message, options = {}) => toast(message, options),
};

export default toast;