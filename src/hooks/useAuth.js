import { useAuthStore } from '../stores/auth.store';

export const useAuth = () => {
  const {
    user,
    accessToken,
    refreshToken,
    organizations,
    activeOrganization,
    activeBranch,
    isLoading,
    error,
    login,
    logout,
    setActiveOrganization,
    setActiveBranch,
    clearError,
  } = useAuthStore();

  return {
    user,
    accessToken,
    refreshToken,
    organizations,
    activeOrganization,
    activeBranch,
    isLoading,
    error,
    login,
    logout,
    setActiveOrganization,
    setActiveBranch,
    clearError,
    isAuthenticated: !!accessToken,
  };
};