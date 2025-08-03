/**
 * Central Icon Registry for CivicPress
 *
 * This composable provides a centralized, type-safe way to manage all icons
 * used throughout the application. It ensures consistency and makes it easy
 * to update icons across the entire app.
 */

export const useIcons = () => {
  const ICONS = {
    // Record Types - Semantic icons for different document types
    bylaw: 'i-lucide-gavel',
    policy: 'i-lucide-file-text',
    resolution: 'i-lucide-vote',
    ordinance: 'i-lucide-scroll-text',
    proclamation: 'i-lucide-megaphone',
    regulation: 'i-lucide-clipboard-list',
    directive: 'i-lucide-file-check',
    guideline: 'i-lucide-book-open',

    // Actions - Common user actions
    edit: 'i-lucide-edit',
    delete: 'i-lucide-trash-2',
    add: 'i-lucide-plus',
    save: 'i-lucide-save',
    cancel: 'i-lucide-x',
    search: 'i-lucide-search',
    filter: 'i-lucide-filter',
    refresh: 'i-lucide-refresh-cw',
    generate: 'i-lucide-refresh-cw',
    view: 'i-lucide-eye',
    hide: 'i-lucide-eye-off',
    download: 'i-lucide-download',
    upload: 'i-lucide-upload',
    copy: 'i-lucide-copy',
    share: 'i-lucide-share',

    // Navigation - UI navigation elements
    chevronRight: 'i-lucide-chevron-right',
    chevronLeft: 'i-lucide-chevron-left',
    arrowRight: 'i-lucide-arrow-right',
    arrowLeft: 'i-lucide-arrow-left',
    home: 'i-lucide-home',
    back: 'i-lucide-arrow-left',
    forward: 'i-lucide-arrow-right',
    menu: 'i-lucide-menu',
    close: 'i-lucide-x',

    // Status - System and record statuses
    loading: 'i-lucide-loader-2',
    error: 'i-lucide-alert-circle',
    warning: 'i-lucide-alert-triangle',
    success: 'i-lucide-check-circle',
    info: 'i-lucide-info',

    // Record Status - Specific status icons
    draft: 'i-lucide-edit',
    proposed: 'i-lucide-clock',
    pending: 'i-lucide-clock',
    underReview: 'i-lucide-search',
    approved: 'i-lucide-check-circle',
    published: 'i-lucide-check-circle',
    active: 'i-lucide-check-circle',
    archived: 'i-lucide-archive',
    rejected: 'i-lucide-x-circle',
    expired: 'i-lucide-clock',

    // UI Elements - Common interface elements
    user: 'i-lucide-user',
    users: 'i-lucide-users',
    settings: 'i-lucide-settings',
    profile: 'i-lucide-user',
    file: 'i-lucide-file-text',
    folder: 'i-lucide-folder',
    calendar: 'i-lucide-calendar',
    clock: 'i-lucide-clock',
    time: 'i-lucide-clock',
    date: 'i-lucide-calendar',
    mapPin: 'i-lucide-map-pin',
    location: 'i-lucide-map-pin',
    globe: 'i-lucide-globe',
    building: 'i-lucide-building-2',
    organization: 'i-lucide-building-2',
    lock: 'i-lucide-lock',
    unlock: 'i-lucide-unlock',
    key: 'i-lucide-key',
    shield: 'i-lucide-shield',
    badge: 'i-lucide-badge',
    badgeCheck: 'i-lucide-badge-check',

    // Authentication
    logIn: 'i-lucide-log-in',
    logOut: 'i-lucide-log-out',
    userPlus: 'i-lucide-user-plus',
    userX: 'i-lucide-user-x',
    userCheck: 'i-lucide-user-check',
    userMinus: 'i-lucide-user-minus',

    // Data & Information
    list: 'i-lucide-list',
    grid: 'i-lucide-grid',
    table: 'i-lucide-table',
    database: 'i-lucide-database',
    chart: 'i-lucide-bar-chart',
    analytics: 'i-lucide-trending-up',
    stats: 'i-lucide-bar-chart',
    metrics: 'i-lucide-trending-up',

    // Communication
    message: 'i-lucide-message-square',
    mail: 'i-lucide-mail',
    notification: 'i-lucide-bell',
    help: 'i-lucide-help-circle',
    question: 'i-lucide-help-circle',

    // Tools & Utilities
    tool: 'i-lucide-tool',
    wrench: 'i-lucide-wrench',
    cog: 'i-lucide-settings',
    gear: 'i-lucide-settings',
    config: 'i-lucide-settings',
    preferences: 'i-lucide-settings',

    // Content & Media
    image: 'i-lucide-image',
    video: 'i-lucide-video',
    audio: 'i-lucide-headphones',
    document: 'i-lucide-file-text',
    pdf: 'i-lucide-file-text',
    word: 'i-lucide-file-text',
    excel: 'i-lucide-file-text',
    powerpoint: 'i-lucide-file-text',

    // Workflow & Process
    workflow: 'i-lucide-git-branch',
    process: 'i-lucide-git-commit',
    approval: 'i-lucide-check-circle',
    review: 'i-lucide-search',
    sign: 'i-lucide-pen-tool',
    stamp: 'i-lucide-stamp',

    // Security & Permissions
    security: 'i-lucide-shield',
    permission: 'i-lucide-key',
    role: 'i-lucide-user-check',
    admin: 'i-lucide-shield',
    moderator: 'i-lucide-user-check',

    // Feedback & Interaction
    like: 'i-lucide-thumbs-up',
    dislike: 'i-lucide-thumbs-down',
    star: 'i-lucide-star',
    heart: 'i-lucide-heart',
    bookmark: 'i-lucide-bookmark',
    flag: 'i-lucide-flag',

    // System & Technical
    system: 'i-lucide-server',
    api: 'i-lucide-code',
    terminal: 'i-lucide-terminal',
    command: 'i-lucide-terminal',

    // Time & History
    history: 'i-lucide-history',
    timeline: 'i-lucide-clock',
    schedule: 'i-lucide-calendar',
    reminder: 'i-lucide-bell',
    timer: 'i-lucide-timer',

    // Business & Government
    government: 'i-lucide-building-2',
    council: 'i-lucide-users',
    mayor: 'i-lucide-user',
    official: 'i-lucide-user-check',
    citizen: 'i-lucide-user',
    public: 'i-lucide-users',

    // Civic & Legal
    legal: 'i-lucide-gavel',
    court: 'i-lucide-building-2',
    judge: 'i-lucide-user',
    lawyer: 'i-lucide-user',
    contract: 'i-lucide-file-text',
    agreement: 'i-lucide-file-text',
    policy: 'i-lucide-file-text',
    regulation: 'i-lucide-clipboard-list',

    // Development & Debug
    debug: 'i-lucide-bug',
    test: 'i-lucide-flask',
    development: 'i-lucide-code',
    staging: 'i-lucide-server',
    production: 'i-lucide-server',
    environment: 'i-lucide-server',

    // Performance & Monitoring
    performance: 'i-lucide-zap',
    slow: 'i-lucide-turtle',
    monitor: 'i-lucide-activity',
    health: 'i-lucide-heart',

    // Miscellaneous
    lightbulb: 'i-lucide-lightbulb',
    sparkles: 'i-lucide-sparkles',
    trophy: 'i-lucide-trophy',
    award: 'i-lucide-award',
    medal: 'i-lucide-medal',
    crown: 'i-lucide-crown',
  } as const;

  // Type for icon names
  type IconName = keyof typeof ICONS;

  /**
   * Get icon name by key - NON-REACTIVE to avoid loops
   */
  const getIcon = (name: IconName): string => {
    return ICONS[name] || 'i-lucide-help-circle'; // Fallback icon
  };

  /**
   * Check if icon exists
   */
  const hasIcon = (name: string): name is IconName => {
    return name in ICONS;
  };

  /**
   * Get all available icon names
   */
  const getAvailableIcons = (): IconName[] => {
    return Object.keys(ICONS) as IconName[];
  };

  return {
    ICONS,
    getIcon,
    hasIcon,
    getAvailableIcons,
  };
};

// Export types for use in other files
export type IconName = keyof ReturnType<typeof useIcons>['ICONS'];
