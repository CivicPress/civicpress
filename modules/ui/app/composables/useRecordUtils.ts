import type { CivicRecord } from '~/stores/records';

// Type definitions
export interface DateFormatOptions {
  includeTime?: boolean;
  format?: 'short' | 'long' | 'relative';
  locale?: string;
}

export interface RecordTypeConfig {
  icon: string;
  label: string;
  color?: string;
}

export interface RecordStatusConfig {
  label: string;
  color: string;
  icon?: string;
}

export const useRecordUtils = () => {
  // Status color mapping with validation
  const STATUS_COLORS: Record<string, string> = {
    draft: 'neutral',
    pending_review: 'primary',
    under_review: 'primary',
    approved: 'primary',
    published: 'primary',
    rejected: 'error',
    archived: 'neutral',
    expired: 'neutral',
    active: 'primary',
    proposed: 'primary',
  } as const;

  // Type icon mapping with validation
  const TYPE_ICONS: Record<string, string> = {
    bylaw: 'i-lucide-gavel',
    policy: 'i-lucide-file-text',
    resolution: 'i-lucide-vote',
    ordinance: 'i-lucide-scroll-text',
    proclamation: 'i-lucide-megaphone',
    regulation: 'i-lucide-clipboard-list',
    directive: 'i-lucide-file-check',
    guideline: 'i-lucide-book-open',
  } as const;

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
    pending_review: 'Pending Review',
    under_review: 'Under Review',
    approved: 'Approved',
    published: 'Published',
    rejected: 'Rejected',
    archived: 'Archived',
    expired: 'Expired',
    active: 'Active',
    proposed: 'Proposed',
  } as const;

  /**
   * Format date with flexible options for i18n support
   */
  const formatDate = (
    dateString: string,
    options: DateFormatOptions = {}
  ): string => {
    if (!dateString) return 'Unknown';

    try {
      const date = new Date(dateString);
      const locale = options.locale || 'en-US';

      switch (options.format) {
        case 'short':
          return date.toLocaleDateString(locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            ...(options.includeTime && {
              hour: '2-digit',
              minute: '2-digit',
            }),
          });

        case 'long':
          return date.toLocaleDateString(locale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            ...(options.includeTime && {
              hour: '2-digit',
              minute: '2-digit',
            }),
          });

        case 'relative':
          return getRelativeTimeString(date, locale);

        default:
          return date.toLocaleDateString(locale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            ...(options.includeTime && {
              hour: '2-digit',
              minute: '2-digit',
            }),
          });
      }
    } catch {
      return dateString;
    }
  };

  /**
   * Get relative time string (e.g., "2 days ago", "3 hours ago")
   */
  const getRelativeTimeString = (date: Date, locale: string): string => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return 'Just now';
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
      return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''} ago`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours !== 1 ? 's' : ''} ago`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
      return `${diffInDays} day${diffInDays !== 1 ? 's' : ''} ago`;
    }

    // Fall back to short date format for older dates
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
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
   * Get type icon with validation and fallback
   */
  const getTypeIcon = (type: string): string => {
    if (!type) return 'i-lucide-file';

    const normalizedType = type.toLowerCase();
    return TYPE_ICONS[normalizedType] || 'i-lucide-file';
  };

  /**
   * Get type label with validation and fallback
   */
  const getTypeLabel = (type: string): string => {
    if (!type) return 'Unknown';

    const normalizedType = type.toLowerCase();
    return (
      TYPE_LABELS[normalizedType] ||
      type.charAt(0).toUpperCase() + type.slice(1)
    );
  };

  /**
   * Get status label with validation and fallback
   */
  const getStatusLabel = (status: string): string => {
    if (!status) return 'Unknown';

    const normalizedStatus = status.toLowerCase().replace(/\s+/g, '_');
    return (
      STATUS_LABELS[normalizedStatus] ||
      status.charAt(0).toUpperCase() + status.slice(1)
    );
  };

  /**
   * Get complete type configuration
   */
  const getTypeConfig = (type: string): RecordTypeConfig => {
    const normalizedType = type?.toLowerCase() || '';
    return {
      icon: getTypeIcon(type),
      label: getTypeLabel(type),
      color: 'primary', // Default color, can be extended
    };
  };

  /**
   * Get complete status configuration
   */
  const getStatusConfig = (status: string): RecordStatusConfig => {
    const normalizedStatus = status?.toLowerCase().replace(/\s+/g, '_') || '';
    return {
      label: getStatusLabel(status),
      color: getStatusColor(status),
      icon: 'i-lucide-circle', // Default icon, can be extended
    };
  };

  /**
   * Validate if a record type is known
   */
  const isValidRecordType = (type: string): boolean => {
    if (!type) return false;
    const normalizedType = type.toLowerCase();
    return normalizedType in TYPE_ICONS;
  };

  /**
   * Validate if a record status is known
   */
  const isValidRecordStatus = (status: string): boolean => {
    if (!status) return false;
    const normalizedStatus = status.toLowerCase().replace(/\s+/g, '_');
    return normalizedStatus in STATUS_COLORS;
  };

  /**
   * Get all available record types
   */
  const getAvailableRecordTypes = (): Array<{
    value: string;
    label: string;
    icon: string;
  }> => {
    return Object.entries(TYPE_LABELS).map(([value, label]) => ({
      value,
      label,
      icon: TYPE_ICONS[value] || 'i-lucide-file',
    }));
  };

  /**
   * Get all available record statuses
   */
  const getAvailableRecordStatuses = (): Array<{
    value: string;
    label: string;
    color: string;
  }> => {
    return Object.entries(STATUS_LABELS).map(([value, label]) => ({
      value,
      label,
      color: STATUS_COLORS[value] || 'neutral',
    }));
  };

  return {
    // Date formatting
    formatDate,
    getRelativeTimeString,

    // Status utilities
    getStatusColor,
    getStatusLabel,
    getStatusConfig,
    isValidRecordStatus,
    getAvailableRecordStatuses,

    // Type utilities
    getTypeIcon,
    getTypeLabel,
    getTypeConfig,
    isValidRecordType,
    getAvailableRecordTypes,

    // Constants for direct access
    STATUS_COLORS,
    TYPE_ICONS,
    STATUS_LABELS,
    TYPE_LABELS,
  };
};
