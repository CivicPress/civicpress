import type { RolesConfig } from '../role-manager.js';

/**
 * Built-in fallback role configuration used when no `roles.yml` is present.
 *
 * Extracted from `RoleManager.getDefaultConfig()` to keep the main file under
 * the master plan §5 LoC ceiling. This is a pure data factory — no I/O, no
 * side effects.
 */
export function getDefaultRolesConfig(): RolesConfig {
  return {
    default_role: 'public',
    roles: {
      admin: {
        name: 'Administrator',
        description: 'Full system access with all permissions',
        permissions: [
          'system:admin',
          'records:create',
          'records:edit',
          'records:delete',
          'records:view',
          'records:archive',
          'workflows:manage',
          'templates:manage',
          'hooks:manage',
          'users:manage',
          'system:configure',
          'broadcast-box:devices:view',
          'broadcast-box:devices:enroll',
          'broadcast-box:devices:manage',
          'broadcast-box:sessions:view',
          'broadcast-box:sessions:create',
          'broadcast-box:sessions:manage',
          'broadcast-box:admin',
          'geography:manage',
        ],
        record_types: {
          can_create: [
            'bylaw',
            'policy',
            'resolution',
            'proclamation',
            'ordinance',
          ],
          can_edit: [
            'bylaw',
            'policy',
            'resolution',
            'proclamation',
            'ordinance',
          ],
          can_delete: [
            'bylaw',
            'policy',
            'resolution',
            'proclamation',
            'ordinance',
          ],
          can_view: [
            'bylaw',
            'policy',
            'resolution',
            'proclamation',
            'ordinance',
          ],
        },
        status_transitions: {
          draft: ['proposed', 'archived'],
          proposed: ['reviewed', 'archived'],
          reviewed: ['approved', 'archived'],
          approved: ['archived'],
          any: ['archived'],
        },
      },
      mayor: {
        name: 'Mayor',
        description: 'Executive authority with approval powers',
        permissions: [
          'records:create',
          'records:edit',
          'records:view',
          'records:archive',
          'workflows:approve',
          'templates:view',
        ],
        record_types: {
          can_create: ['bylaw', 'policy', 'resolution', 'proclamation'],
          can_edit: ['bylaw', 'policy', 'resolution', 'proclamation'],
          can_view: [
            'bylaw',
            'policy',
            'resolution',
            'proclamation',
            'ordinance',
          ],
        },
        status_transitions: {
          reviewed: ['approved'],
          approved: ['archived'],
          any: ['archived'],
        },
      },
      council: {
        name: 'City Council',
        description: 'Legislative body with voting and approval powers',
        permissions: [
          'records:create',
          'records:edit',
          'records:view',
          'records:archive',
          'workflows:vote',
          'templates:view',
        ],
        record_types: {
          can_create: ['bylaw', 'policy', 'resolution'],
          can_edit: ['bylaw', 'policy', 'resolution'],
          can_view: [
            'bylaw',
            'policy',
            'resolution',
            'proclamation',
            'ordinance',
          ],
        },
        status_transitions: {
          proposed: ['reviewed'],
          reviewed: ['approved'],
          approved: ['archived'],
          any: ['archived'],
        },
      },
      clerk: {
        name: 'City Clerk',
        description: 'Administrative support with document management',
        permissions: [
          'records:create',
          'records:edit',
          'records:view',
          'templates:view',
          'broadcast-box:devices:view',
          'broadcast-box:sessions:view',
          'broadcast-box:sessions:create',
          'broadcast-box:sessions:manage',
          'geography:manage',
        ],
        record_types: {
          can_create: ['bylaw', 'policy', 'resolution'],
          can_edit: ['bylaw', 'policy', 'resolution'],
          can_view: [
            'bylaw',
            'policy',
            'resolution',
            'proclamation',
            'ordinance',
          ],
        },
        status_transitions: {
          draft: ['proposed'],
        },
      },
      legal_dept: {
        name: 'Legal Department',
        description: 'Legal review and compliance',
        permissions: [
          'records:edit',
          'records:view',
          'workflows:review',
          'templates:view',
        ],
        record_types: {
          can_edit: ['bylaw', 'policy', 'resolution'],
          can_view: [
            'bylaw',
            'policy',
            'resolution',
            'proclamation',
            'ordinance',
          ],
        },
        status_transitions: {
          proposed: ['reviewed'],
        },
      },
      public: {
        name: 'Public',
        description: 'Read-only access to published records',
        permissions: ['records:view'],
        record_types: {
          can_view: [
            'bylaw',
            'policy',
            'resolution',
            'proclamation',
            'ordinance',
          ],
        },
        status_transitions: {},
      },
    },
    permissions: {
      'system:admin': {
        description: 'Full system administration access',
        level: 'system',
      },
      'system:configure': {
        description: 'Configure system settings',
        level: 'system',
      },
      'records:create': {
        description: 'Create new records',
        level: 'record',
      },
      'records:edit': {
        description: 'Edit existing records',
        level: 'record',
      },
      'records:delete': {
        description: 'Delete records',
        level: 'record',
      },
      'records:view': {
        description: 'View records',
        level: 'record',
      },
      'records:archive': {
        description: 'Archive records',
        level: 'record',
      },
      'workflows:manage': {
        description: 'Manage workflow configurations',
        level: 'workflow',
      },
      'workflows:approve': {
        description: 'Approve workflow transitions',
        level: 'workflow',
      },
      'workflows:vote': {
        description: 'Vote on workflow transitions',
        level: 'workflow',
      },
      'workflows:review': {
        description: 'Review workflow transitions',
        level: 'workflow',
      },
      'templates:manage': {
        description: 'Manage templates',
        level: 'template',
      },
      'templates:view': {
        description: 'View templates',
        level: 'template',
      },
      'hooks:manage': {
        description: 'Manage hooks and automation',
        level: 'hook',
      },
      'users:manage': {
        description: 'Manage users and roles',
        level: 'user',
      },
      'broadcast-box:devices:view': {
        description: 'View broadcast-box devices',
        level: 'system',
      },
      'broadcast-box:devices:enroll': {
        description: 'Enroll / re-pair broadcast-box devices',
        level: 'system',
      },
      'broadcast-box:devices:manage': {
        description: 'Update, delete, and command broadcast-box devices',
        level: 'system',
      },
      'broadcast-box:sessions:view': {
        description: 'View broadcast-box recording sessions',
        level: 'system',
      },
      'broadcast-box:sessions:create': {
        description: 'Start broadcast-box recording sessions',
        level: 'system',
      },
      'broadcast-box:sessions:manage': {
        description: 'Stop and delete broadcast-box recording sessions',
        level: 'system',
      },
      'broadcast-box:admin': {
        description: 'Broadcast-box administration (e.g. reset rate limits)',
        level: 'system',
      },
    },
    role_hierarchy: {
      admin: [],
      mayor: ['council'],
      council: ['clerk'],
      clerk: ['legal_dept'],
      legal_dept: ['public'],
      public: [],
    },
  };
}
