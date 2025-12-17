/**
 * Composable for diagnostic operations
 */

export interface DiagnosticIssue {
  id: string;
  component: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  autoFixable: boolean;
  fix?: {
    description: string;
    command?: string;
    estimatedDuration?: number;
  };
  recommendations?: readonly string[] | string[];
  details?: any;
}

export interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'warning' | 'error';
  message?: string;
  details?: any;
}

export interface ComponentResult {
  component: string;
  status: 'healthy' | 'warning' | 'error';
  duration: number;
  checks: DiagnosticCheck[];
  issues: DiagnosticIssue[];
  recommendations?: string[];
}

export interface DiagnosticReport {
  runId: string;
  timestamp: string;
  overallStatus: 'healthy' | 'warning' | 'error';
  duration: number;
  summary: {
    totalChecks: number;
    passed: number;
    warnings: number;
    errors: number;
  };
  components: ComponentResult[];
  issues: DiagnosticIssue[];
  recommendations: string[];
}

export interface FixResult {
  issueId: string;
  success: boolean;
  message: string;
  backupId?: string;
  rollbackAvailable?: boolean;
  duration?: number;
  error?: any;
}

export const useDiagnostics = () => {
  const { $civicApi } = useNuxtApp();

  const report = ref<DiagnosticReport | null>(null);
  const componentResult = ref<ComponentResult | null>(null);
  const loading = ref(false);
  const fixing = ref(false);
  const error = ref<string | null>(null);
  const lastRun = ref<Date | null>(null);

  /**
   * Run all diagnostic checks
   */
  const runAll = async (options?: {
    component?: string;
    format?: 'json' | 'yaml';
    timeout?: number;
    maxConcurrency?: number;
  }) => {
    loading.value = true;
    error.value = null;

    try {
      const params = new URLSearchParams();
      if (options?.component) params.set('component', options.component);
      if (options?.format) params.set('format', options.format);
      if (options?.timeout) params.set('timeout', String(options.timeout));
      if (options?.maxConcurrency)
        params.set('maxConcurrency', String(options.maxConcurrency));

      const response = (await $civicApi(
        `/api/v1/diagnose${params.toString() ? `?${params.toString()}` : ''}`
      )) as { success: boolean; data: DiagnosticReport };

      if (response.success && response.data) {
        if (options?.component) {
          // Single component result
          componentResult.value = response.data as any;
        } else {
          // Full report
          report.value = response.data;
        }
        lastRun.value = new Date();
        return response.data;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to run diagnostics';
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * Run diagnostics for a specific component
   */
  const runComponent = async (
    component: string,
    options?: {
      format?: 'json' | 'yaml';
      timeout?: number;
      maxConcurrency?: number;
    }
  ) => {
    return runAll({ ...options, component });
  };

  /**
   * Attempt to auto-fix issues
   */
  const autoFix = async (
    issues: readonly DiagnosticIssue[] | DiagnosticIssue[],
    options?: {
      force?: boolean;
      dryRun?: boolean;
    }
  ): Promise<FixResult[]> => {
    fixing.value = true;
    error.value = null;

    try {
      const params = new URLSearchParams();
      params.set('fix', 'true');
      if (options?.force) params.set('force', 'true');
      if (options?.dryRun) params.set('dryRun', 'true');

      // Get fixable issues
      const fixableIssues = issues.filter((i) => i.autoFixable);
      if (fixableIssues.length === 0) {
        return [];
      }

      // Run diagnostics with fix flag
      const response = (await $civicApi(
        `/api/v1/diagnose?${params.toString()}`
      )) as {
        success: boolean;
        data: DiagnosticReport & { fixResults?: FixResult[] };
      };

      if (response.success && response.data) {
        // The API should return fix results in the response
        // If not, we'll need to parse them from the report
        const fixResults =
          (response.data as any).fixResults ||
          (response.data as any).autoFixResults ||
          [];

        // Refresh the report after fixes
        await runAll();

        return fixResults;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to auto-fix issues';
      throw err;
    } finally {
      fixing.value = false;
    }
  };

  /**
   * Get severity color for UI (returns Nuxt UI compatible colors)
   */
  const getSeverityColor = (
    severity: DiagnosticIssue['severity']
  ): 'error' | 'primary' | 'neutral' => {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'error';
      case 'medium':
        return 'primary';
      case 'low':
      default:
        return 'neutral';
    }
  };

  /**
   * Get status color for UI (returns Nuxt UI compatible colors)
   */
  const getStatusColor = (
    status: 'healthy' | 'warning' | 'error'
  ): 'error' | 'primary' | 'neutral' => {
    switch (status) {
      case 'healthy':
        return 'primary';
      case 'warning':
        return 'primary';
      case 'error':
        return 'error';
      default:
        return 'neutral';
    }
  };

  /**
   * Get status icon for UI
   */
  const getStatusIcon = (status: 'healthy' | 'warning' | 'error') => {
    switch (status) {
      case 'healthy':
        return 'i-lucide-check-circle';
      case 'warning':
        return 'i-lucide-alert-triangle';
      case 'error':
        return 'i-lucide-x-circle';
      default:
        return 'i-lucide-circle';
    }
  };

  /**
   * Get check status icon
   */
  const getCheckIcon = (status: DiagnosticCheck['status']) => {
    switch (status) {
      case 'pass':
        return 'i-lucide-check';
      case 'warning':
        return 'i-lucide-alert-triangle';
      case 'error':
        return 'i-lucide-x';
      default:
        return 'i-lucide-circle';
    }
  };

  /**
   * Get check status color (returns Nuxt UI compatible colors)
   */
  const getCheckColor = (
    status: DiagnosticCheck['status']
  ): 'error' | 'primary' | 'neutral' => {
    switch (status) {
      case 'pass':
        return 'primary';
      case 'warning':
        return 'primary';
      case 'error':
        return 'error';
      default:
        return 'neutral';
    }
  };

  return {
    report: readonly(report),
    componentResult: readonly(componentResult),
    loading: readonly(loading),
    fixing: readonly(fixing),
    error: readonly(error),
    lastRun: readonly(lastRun),
    runAll,
    runComponent,
    autoFix,
    getSeverityColor,
    getStatusColor,
    getStatusIcon,
    getCheckIcon,
    getCheckColor,
  };
};
