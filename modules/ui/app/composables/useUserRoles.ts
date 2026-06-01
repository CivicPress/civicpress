import type { Role } from '~/types/user';
import { extractErrorMessage, type ApiResponse } from '~/utils/api-response';

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

      // Roles endpoint has two response shapes; both surface a `roles` field
       // (either Role[] or Record<string, RoleSpec>). Keep the payload loose
       // and narrow per-shape inside the handler.
       const response = (await $civicApi(
         '/api/v1/config/roles'
       )) as ApiResponse<{ roles?: unknown }>;

      if (response.success) {
        // Loosen to a plain record for the per-shape narrowing below.
        const data = response.data as
          | { roles?: unknown }
          | undefined;

        // Handle legacy format: { data: { roles: Role[] } }
        if (Array.isArray(data?.roles)) {
          roles.value = data.roles as Role[];
          return;
        }

        // Handle new metadata format from configuration service
        // Expect shape: { _metadata, default_role, roles: { [key]: { name:{value}, description:{value}, permissions:{value:[]}, status_transitions:{value:Object} } } }
        if (
          data &&
          data.roles &&
          typeof data.roles === 'object' &&
          !Array.isArray(data.roles)
        ) {
          const rolesMap = data.roles as Record<string, Record<string, unknown> | undefined>;
          const result: Role[] = [];
          for (const key of Object.keys(rolesMap)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = (rolesMap[key] || {}) as Record<string, any>;
            const name = r?.name?.value ?? r?.name ?? key;
            const description = r?.description?.value ?? r?.description ?? '';
            const permissions = Array.isArray(r?.permissions)
              ? r.permissions
              : Array.isArray(r?.permissions?.value)
                ? r.permissions.value
                : [];
            // Flatten status transitions object into a unique array of destination statuses (optional UI use)
            const stVal = r?.status_transitions?.value ?? r?.status_transitions;
            const statusTransitions =
              stVal && typeof stVal === 'object' && !Array.isArray(stVal)
                ? Array.from(new Set(Object.values(stVal).flat()))
                : Array.isArray(stVal)
                  ? stVal
                  : [];

            result.push({
              key,
              name,
              description,
              permissions,
              status_transitions: statusTransitions,
              color: 'primary',
              icon: 'i-lucide-user',
            } as Role);
          }
          roles.value = result;
          return;
        }

        // Fallback: unknown shape
        error.value = 'Unexpected roles format from API';
        roles.value = [];
      } else {
        error.value = extractErrorMessage(response) || 'Failed to fetch roles';
        console.error('Failed to fetch roles:', response.error);
      }
    } catch (err: unknown) {
      error.value = (err instanceof Error ? err.message : '') || 'Failed to fetch roles';
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (role as any)?.status_transitions || [];
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
