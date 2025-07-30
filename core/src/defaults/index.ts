// Default configuration exports
// These will be implemented when the core module is properly set up

export interface DefaultConfigs {
  roles: any;
  hooks: any;
  workflows: any;
  notifications: any;
}

/**
 * Placeholder for default configuration loading
 * Will be implemented when core module is properly configured
 */
export function loadDefaultConfigs(): DefaultConfigs {
  // TODO: Implement when core module is properly set up
  return {
    roles: {},
    hooks: {},
    workflows: {},
    notifications: {},
  };
}

export default {
  loadDefaultConfigs,
};
