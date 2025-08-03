import type { Role } from '~/types/user';

export const useUserRoles = () => {
  const { $civicApi } = useNuxtApp();

  // Reactive state
  const roles = ref<Role[]>([]);
  const loading = ref(false);
  const error = ref('');

  // Fetch roles from API
  const fetchRoles = async () => {
    try {
      loading.value = true;
      error.value = '';

      const response = (await $civicApi('/api/config/roles')) as any;

      if (response.success) {
        roles.value = response.data.roles || [];
      } else {
        error.value = response.error || 'Failed to fetch roles';
        console.error('Failed to fetch roles:', response.error);
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch roles';
      console.error('Error fetching roles:', err);
    } finally {
      loading.value = false;
    }
  };

  // Get role display name
  const getRoleDisplayName = (roleKey: string): string => {
    const role = roles.value.find((r) => r.key === roleKey);
    return role?.name || roleKey;
  };

  // Get role description
  const getRoleDescription = (roleKey: string): string => {
    const role = roles.value.find((r) => r.key === roleKey);
    return role?.description || '';
  };

  // Get role color for badges
  const getRoleColor = (roleKey: string): string => {
    const colorMap: Record<string, string> = {
      admin: 'error',
      clerk: 'primary',
      public: 'neutral',
    };
    return colorMap[roleKey] || 'neutral';
  };

  // Get role icon
  const getRoleIcon = (roleKey: string): string => {
    const iconMap: Record<string, string> = {
      admin: 'i-lucide-shield',
      clerk: 'i-lucide-user-check',
      public: 'i-lucide-user',
    };
    return iconMap[roleKey] || 'i-lucide-user';
  };

  // Get roles as options for select menus
  const roleOptions = computed(() => {
    return roles.value.map((role) => ({
      label: role.name,
      value: role.key,
      icon: getRoleIcon(role.key),
      description: role.description,
    }));
  });

  // Get role by key
  const getRoleByKey = (roleKey: string): Role | undefined => {
    return roles.value.find((r) => r.key === roleKey);
  };

  // Check if user has permission
  const hasPermission = (
    userRole: string,
    requiredPermission: string
  ): boolean => {
    const role = getRoleByKey(userRole);
    if (!role) return false;

    // Admin has all permissions
    if (role.permissions.includes('*')) return true;

    return role.permissions.includes(requiredPermission);
  };

  // Get available status transitions for a role
  const getStatusTransitions = (roleKey: string): string[] => {
    const role = getRoleByKey(roleKey);
    return role?.status_transitions || [];
  };

  return {
    // State
    roles: readonly(roles),
    loading: readonly(loading),
    error: readonly(error),

    // Actions
    fetchRoles,

    // Utilities
    getRoleDisplayName,
    getRoleDescription,
    getRoleColor,
    getRoleIcon,
    getRoleByKey,
    hasPermission,
    getStatusTransitions,

    // Computed
    roleOptions,
  };
};
