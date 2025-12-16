import { ref, readonly } from 'vue';

export interface RecordStatusConfig {
  label: string;
  color: string;
  icon: string;
}

export const useRecordUtils = () => {
  // Get icons from central registry
  const { getIcon } = useIcons();

  // Get translation functions at top level
  const { translateRecordType, translateStatus } = useConfigTranslations();

  // Status color mapping with validation
  const STATUS_COLORS: Record<string, string> = {
    draft: 'neutral',
    proposed: 'primary',
    pending_review: 'warning',
    under_review: 'warning',
    approved: 'success',
    published: 'success',
    active: 'success',
    archived: 'neutral',
    rejected: 'danger',
    expired: 'neutral',
  } as const;

  // Type icon mapping - now using central registry
  const getTypeIcon = (type: string): string => {
    // Map record types to icon registry keys
    const typeIconMap: Record<string, string> = {
      bylaw: 'bylaw',
      policy: 'policy',
      resolution: 'resolution',
      ordinance: 'ordinance',
      proclamation: 'proclamation',
      regulation: 'regulation',
      directive: 'directive',
      guideline: 'guideline',
    };

    const iconKey = typeIconMap[type];
    return iconKey ? getIcon(iconKey as any) : getIcon('file');
  };

  // Type label mapping
  const TYPE_LABELS: Record<string, string> = {
    bylaw: 'Bylaw',
    policy: 'Policy',
    resolution: 'Resolution',
    ordinance: 'Ordinance',
    proclamation: 'Proclamation',
    regulation: 'Regulation',
    directive: 'Directive',
    guideline: 'Guideline',
  } as const;

  // Status label mapping
  const STATUS_LABELS: Record<string, string> = {
    draft: 'Draft',
    proposed: 'Proposed',
    pending_review: 'Pending Review',
    under_review: 'Under Review',
    approved: 'Approved',
    published: 'Published',
    active: 'Active',
    archived: 'Archived',
    rejected: 'Rejected',
    expired: 'Expired',
  } as const;

  // Status icon mapping - now using central registry
  const getStatusIcon = (status: string): string => {
    const statusIconMap: Record<string, string> = {
      draft: 'draft',
      proposed: 'proposed',
      pending_review: 'pending',
      under_review: 'underReview',
      approved: 'approved',
      published: 'published',
      active: 'active',
      archived: 'archived',
      rejected: 'rejected',
      expired: 'expired',
    };

    const iconKey = statusIconMap[status];
    return iconKey ? getIcon(iconKey as any) : getIcon('info');
  };

  /**
   * Normalize date string from database format to ISO format with UTC indicator
   * Converts "YYYY-MM-DD HH:MM:SS" (SQLite format, UTC but no timezone) to "YYYY-MM-DDTHH:MM:SSZ"
   */
  const normalizeDateString = (date: string | Date): string | Date => {
    if (!date || typeof date === 'object') return date;

    // If already has timezone indicator (Z or +/- offset), return as is (already normalized)
    if (date.includes('Z') || /[+-]\d{2}:\d{2}$/.test(date)) {
      return date;
    }

    // If has 'T' separator but no timezone, add 'Z' (assume UTC)
    if (date.includes('T')) {
      return date + 'Z';
    }

    // Convert SQLite format "YYYY-MM-DD HH:MM:SS" to ISO "YYYY-MM-DDTHH:MM:SSZ"
    // This assumes dates from database are in UTC (which SQLite CURRENT_TIMESTAMP returns)
    return date.replace(' ', 'T') + 'Z';
  };

  /**
   * Format date with flexible options for i18n support
   */
  const formatDate = (
    date: string | Date,
    options: Intl.DateTimeFormatOptions = {}
  ): string => {
    if (!date) return '';

    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...options,
    };

    try {
      // Normalize date string to ensure UTC timezone is properly indicated
      const normalizedDate = normalizeDateString(date);
      const dateObj =
        typeof normalizedDate === 'string'
          ? new Date(normalizedDate)
          : normalizedDate;
      return new Intl.DateTimeFormat('en-US', defaultOptions).format(dateObj);
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  /**
   * Format relative time (e.g., "2 hours ago")
   */
  const formatRelativeTime = (date: string | Date): string => {
    if (!date) return '';

    try {
      // Normalize date string to ensure UTC timezone is properly indicated
      const normalizedDate = normalizeDateString(date);
      const dateObj =
        typeof normalizedDate === 'string'
          ? new Date(normalizedDate)
          : normalizedDate;
      const now = new Date();
      const diffInSeconds = Math.floor(
        (now.getTime() - dateObj.getTime()) / 1000
      );

      if (diffInSeconds < 60) {
        return 'Just now';
      } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
      } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
      } else if (diffInSeconds < 2592000) {
        const days = Math.floor(diffInSeconds / 86400);
        return `${days} day${days !== 1 ? 's' : ''} ago`;
      } else {
        return formatDate(dateObj);
      }
    } catch (error) {
      console.error('Error formatting relative time:', error);
      return '';
    }
  };

  /**
   * Get status color with validation and fallback
   */
  const getStatusColor = (status: string): string => {
    if (!status) return 'neutral';

    const normalizedStatus = status.toLowerCase().replace(/\s+/g, '_');
    return STATUS_COLORS[normalizedStatus] || 'neutral';
  };

  /**
   * Capitalize a string to Title Case (first letter uppercase, rest lowercase)
   */
  const toTitleCase = (str: string): string => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  /**
   * Get type label with validation and fallback
   */
  const getTypeLabel = (type: string): string => {
    if (!type) return '';

    const normalizedType = type.toLowerCase();
    const fallback = TYPE_LABELS[normalizedType] || toTitleCase(type);
    return translateRecordType(normalizedType, fallback);
  };

  /**
   * Get status label with validation and fallback
   */
  const getStatusLabel = (status: string): string => {
    if (!status) return '';

    const normalizedStatus = status.toLowerCase().replace(/\s+/g, '_');
    const fallback = STATUS_LABELS[normalizedStatus] || status;
    return translateStatus(normalizedStatus, fallback);
  };

  /**
   * Get complete status configuration
   */
  const getStatusConfig = (status: string): RecordStatusConfig => {
    return {
      label: getStatusLabel(status),
      color: getStatusColor(status),
      icon: getStatusIcon(status), // Use the new getStatusIcon
    };
  };

  /**
   * Validate record type
   */
  const isValidRecordType = (type: string): boolean => {
    if (!type) return false;
    const normalizedType = type.toLowerCase();
    return normalizedType in TYPE_LABELS;
  };

  /**
   * Validate record status
   */
  const isValidRecordStatus = (status: string): boolean => {
    if (!status) return false;
    const normalizedStatus = status.toLowerCase().replace(/\s+/g, '_');
    return normalizedStatus in STATUS_LABELS;
  };

  /**
   * Get available record types as options
   */
  const getAvailableRecordTypes = () => {
    return Object.entries(TYPE_LABELS).map(([value, label]) => ({
      value,
      label,
      icon: getTypeIcon(value),
    }));
  };

  /**
   * Get available record statuses as options
   */
  const getAvailableRecordStatuses = () => {
    return Object.entries(STATUS_LABELS).map(([value, label]) => ({
      value,
      label,
      color: getStatusColor(value),
      icon: getStatusIcon(value),
    }));
  };

  return {
    // Date utilities
    formatDate,
    formatRelativeTime,

    // Type utilities
    getTypeIcon,
    getTypeLabel,
    isValidRecordType,
    getAvailableRecordTypes,

    // Status utilities
    getStatusColor,
    getStatusLabel,
    getStatusIcon,
    getStatusConfig,
    isValidRecordStatus,
    getAvailableRecordStatuses,
    toTitleCase,

    // Constants for direct access
    STATUS_COLORS,
    TYPE_LABELS,
    STATUS_LABELS,
  };
};
