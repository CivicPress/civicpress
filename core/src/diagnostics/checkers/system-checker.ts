/**
 * System Resource Diagnostic Checker
 *
 * Checks system resource usage, process health, and Node.js compatibility.
 */

import { BaseDiagnosticChecker } from '../base-checker.js';
import { Logger } from '../../utils/logger.js';
import {
  CheckResult,
  DiagnosticIssue,
  FixResult,
  FixOptions,
  DiagnosticOptions,
} from '../types.js';
import * as os from 'os';
import * as process from 'process';

export class SystemDiagnosticChecker extends BaseDiagnosticChecker {
  name = 'system';
  component = 'system';
  critical = false; // System resource issues are warnings, not critical

  constructor(logger?: Logger) {
    super(logger);
  }

  /**
   * Run all system diagnostic checks
   */
  async check(options?: DiagnosticOptions): Promise<CheckResult> {
    const checks: CheckResult[] = [];
    const issues: DiagnosticIssue[] = [];

    try {
      // Check 1: Node.js version
      const nodeVersionCheck = await this.checkNodeVersion();
      checks.push(nodeVersionCheck);
      if (
        nodeVersionCheck.status === 'error' ||
        nodeVersionCheck.status === 'warning'
      ) {
        issues.push(
          this.createIssue(
            nodeVersionCheck.status === 'error' ? 'high' : 'medium',
            'Node.js version compatibility issues',
            {
              autoFixable: false,
              recommendations: [
                'Upgrade Node.js to a supported version',
                'Check Node.js version requirements in documentation',
              ],
              details: nodeVersionCheck.details,
            }
          )
        );
      }

      // Check 2: Memory usage
      const memoryCheck = await this.checkMemoryUsage();
      checks.push(memoryCheck);
      if (memoryCheck.status === 'error' || memoryCheck.status === 'warning') {
        const details = memoryCheck.details as any;
        const usagePercent = details?.usagePercent || 'unknown';
        const totalGB = details?.totalGB || 'unknown';
        const usedGB = details?.usedGB || 'unknown';
        const freeGB = details?.freeGB || 'unknown';
        const processRssGB = details?.processRssGB || 'unknown';
        const heapUsagePercent = details?.heapUsagePercent || 'unknown';

        // Build more specific issue message
        let issueMessage = `Memory usage issues (${usagePercent} system, ${heapUsagePercent} heap)`;
        if (details?.heapUsedMB && details?.heapTotalMB) {
          issueMessage += ` - Process heap: ${details.heapUsedMB}MB / ${details.heapTotalMB}MB`;
        }

        // Build more specific recommendations based on the issue
        const recommendations: string[] = [];
        if (parseFloat(usagePercent) > 80) {
          recommendations.push(
            `System memory is ${usagePercent} used (${usedGB}GB / ${totalGB}GB total, ${freeGB}GB free)`
          );
          recommendations.push('Close unnecessary applications or processes');
          recommendations.push('Consider adding more RAM if consistently high');
        }
        if (parseFloat(heapUsagePercent) > 80) {
          recommendations.push(`Process heap is ${heapUsagePercent} used`);
          recommendations.push('Review large data processing operations');
          recommendations.push(
            'Check for memory leaks in long-running processes'
          );
          recommendations.push(
            'Consider increasing Node.js heap size with --max-old-space-size'
          );
        }
        if (parseFloat(processRssGB) > 1) {
          recommendations.push(
            `Process RSS is ${processRssGB}GB - monitor for memory leaks`
          );
        }
        if (recommendations.length === 0) {
          recommendations.push('Monitor memory usage over time');
        }

        issues.push(
          this.createIssue(
            memoryCheck.status === 'error' ? 'high' : 'medium',
            issueMessage,
            {
              autoFixable: false,
              recommendations,
              details: {
                ...memoryCheck.details,
                systemMemory: {
                  totalGB,
                  usedGB,
                  freeGB,
                  usagePercent,
                },
                processMemory: {
                  rssGB: processRssGB,
                  heapUsagePercent,
                  heapUsedMB: details?.heapUsedMB,
                  heapTotalMB: details?.heapTotalMB,
                },
              },
            }
          )
        );

        // Also store the issue in the check's details so extractIssues can find it
        if (!memoryCheck.details) {
          memoryCheck.details = {};
        }
        if (!Array.isArray(memoryCheck.details.issues)) {
          memoryCheck.details.issues = [];
        }
        memoryCheck.details.issues.push(issues[issues.length - 1]);
      }

      // Check 3: CPU usage (if available)
      const cpuCheck = await this.checkCPUUsage();
      checks.push(cpuCheck);
      if (cpuCheck.status === 'warning') {
        const details = cpuCheck.details as any;
        const cpuCount = details?.cpuCount || 'unknown';
        const load1Min = details?.load1Min || 'unknown';
        const load5Min = details?.load5Min || 'unknown';
        const load15Min = details?.load15Min || 'unknown';
        const loadPercent1Min = details?.loadPercent1Min || 'unknown';
        const loadPercent5Min = details?.loadPercent5Min || 'unknown';

        // Build more specific issue message
        let issueMessage = `CPU load average is elevated`;
        if (loadPercent1Min !== 'unknown') {
          issueMessage += ` (${loadPercent1Min} of ${cpuCount} cores)`;
        }

        // Build more specific recommendations
        const recommendations: string[] = [];
        if (
          loadPercent1Min !== 'unknown' &&
          parseFloat(loadPercent1Min) > 100
        ) {
          recommendations.push(
            `Load average is ${load1Min} (${loadPercent1Min} of ${cpuCount} cores) - system may be overloaded`
          );
          recommendations.push('Check for CPU-intensive processes');
          recommendations.push('Consider reducing concurrent operations');
        } else if (
          loadPercent1Min !== 'unknown' &&
          parseFloat(loadPercent1Min) > 80
        ) {
          recommendations.push(
            `Load average is ${load1Min} (${loadPercent1Min} of ${cpuCount} cores)`
          );
          recommendations.push(
            'Note: Load average includes I/O wait, not just CPU usage'
          );
          recommendations.push(
            'If actual CPU usage is low, this may indicate I/O bottlenecks'
          );
          recommendations.push(
            'Monitor during peak times to identify patterns'
          );
        } else {
          recommendations.push('Monitor CPU usage during peak times');
        }

        issues.push(
          this.createIssue('low', issueMessage, {
            autoFixable: false,
            recommendations,
            details: {
              ...cpuCheck.details,
              loadAverage: {
                '1min': load1Min,
                '5min': load5Min,
                '15min': load15Min,
                '1minPercent': loadPercent1Min,
                '5minPercent': loadPercent5Min,
                cpuCount,
              },
              note: 'Load average represents processes waiting for CPU or I/O, not just CPU usage percentage',
            },
          })
        );

        // Also store the issue in the check's details so extractIssues can find it
        if (!cpuCheck.details) {
          cpuCheck.details = {};
        }
        if (!Array.isArray(cpuCheck.details.issues)) {
          cpuCheck.details.issues = [];
        }
        cpuCheck.details.issues.push(issues[issues.length - 1]);
      }

      // Check 4: Process limits
      const limitsCheck = await this.checkProcessLimits();
      checks.push(limitsCheck);
      if (limitsCheck.status === 'warning') {
        issues.push(
          this.createIssue('low', 'Process limit warnings', {
            autoFixable: false,
            recommendations: [
              'Review process limits',
              'Increase limits if needed',
            ],
            details: limitsCheck.details,
          })
        );
      }

      // Check 5: Platform compatibility
      const platformCheck = await this.checkPlatform();
      checks.push(platformCheck);
      if (platformCheck.status === 'warning') {
        issues.push(
          this.createIssue('low', 'Platform compatibility warnings', {
            autoFixable: false,
            recommendations: [
              'Verify platform support',
              'Check for platform-specific issues',
            ],
            details: platformCheck.details,
          })
        );
      }

      // Determine overall status
      const hasErrors = checks.some((c) => c.status === 'error');
      const hasWarnings = checks.some((c) => c.status === 'warning');

      if (hasErrors) {
        return this.createErrorResult(
          'System diagnostic found critical issues',
          undefined,
          {
            checks,
            issues,
          }
        );
      }

      if (hasWarnings) {
        return this.createWarningResult('System diagnostic found warnings', {
          checks,
          issues,
        });
      }

      return this.createSuccessResult('All system checks passed', {
        checks,
        issues: [],
      });
    } catch (error: any) {
      this.logger.error('System diagnostic check failed', {
        error: error.message,
        stack: error.stack,
      });
      return this.createErrorResult('System diagnostic check failed', error, {
        checks,
        issues,
      });
    }
  }

  /**
   * Check Node.js version compatibility
   */
  private async checkNodeVersion(): Promise<CheckResult> {
    try {
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);

      // Minimum required: Node.js 18.x
      // Recommended: Node.js 20.x or higher
      const minVersion = 18;
      const recommendedVersion = 20;

      if (majorVersion < minVersion) {
        return this.createErrorResult('Node.js version is too old', undefined, {
          current: nodeVersion,
          minimum: `${minVersion}.x`,
          recommendation: `Upgrade to Node.js ${minVersion}.x or higher`,
        });
      }

      if (majorVersion < recommendedVersion) {
        return this.createWarningResult(
          'Node.js version is below recommended',
          {
            current: nodeVersion,
            recommended: `${recommendedVersion}.x`,
            recommendation: `Consider upgrading to Node.js ${recommendedVersion}.x or higher`,
          }
        );
      }

      return this.createSuccessResult('Node.js version is compatible', {
        version: nodeVersion,
        major: majorVersion,
      });
    } catch (error: any) {
      return this.createWarningResult('Failed to check Node.js version', {
        error: error.message,
      });
    }
  }

  /**
   * Check memory usage
   */
  private async checkMemoryUsage(): Promise<CheckResult> {
    try {
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const memoryUsagePercent = (usedMemory / totalMemory) * 100;

      // Get process memory usage
      const processMemory = process.memoryUsage();
      const processHeapUsed = processMemory.heapUsed;
      const processHeapTotal = processMemory.heapTotal;
      const processRss = processMemory.rss;

      const totalGB = totalMemory / (1024 * 1024 * 1024);
      const freeGB = freeMemory / (1024 * 1024 * 1024);
      const usedGB = usedMemory / (1024 * 1024 * 1024);
      const processRssGB = processRss / (1024 * 1024 * 1024);

      // Thresholds consider both percentage AND absolute free memory, scaled by total RAM:
      // For systems with large RAM (>32GB), we use percentage-based free memory thresholds
      // - >95% = critical (regardless of free memory)
      // - >90% with <2GB free = critical (all systems)
      // - >85% with <1GB free = error (all systems)
      // - >80% with <500MB free = error (all systems)
      // - >90% with >=2GB free = warning (all systems)
      // - >85% with <10% free = warning (systems >=32GB RAM)
      // - >85% with >=1GB free = warning (systems <32GB RAM)
      // - >80% with <10% free = low warning (systems >=32GB RAM)
      // - >80% with >=500MB free = low warning (systems <16GB RAM)
      // - >80% with >=2GB free = low warning (systems 16-32GB RAM)
      // - Otherwise healthy (even if >70%, if there's plenty of free memory)

      // Calculate free memory threshold based on total RAM
      // For large systems (>=32GB), use 10% of total RAM as threshold
      // For smaller systems, use fixed thresholds
      const freeMemoryPercent = (freeGB / totalGB) * 100;
      const lowWarningFreeThreshold =
        totalGB >= 32 ? totalGB * 0.1 : totalGB >= 16 ? 2 : 0.5;
      const warningFreeThreshold = totalGB >= 32 ? totalGB * 0.1 : 1;

      if (memoryUsagePercent > 95) {
        return this.createErrorResult(
          'System memory usage is critical',
          undefined,
          {
            totalGB: totalGB.toFixed(2),
            freeGB: freeGB.toFixed(2),
            usedGB: usedGB.toFixed(2),
            usagePercent: memoryUsagePercent.toFixed(1) + '%',
            processRssGB: processRssGB.toFixed(2),
            recommendation: 'Free up system memory immediately',
          }
        );
      }

      if (memoryUsagePercent > 90 && freeGB < 2) {
        return this.createErrorResult(
          'System memory usage is critical',
          undefined,
          {
            totalGB: totalGB.toFixed(2),
            freeGB: freeGB.toFixed(2),
            usedGB: usedGB.toFixed(2),
            usagePercent: memoryUsagePercent.toFixed(1) + '%',
            processRssGB: processRssGB.toFixed(2),
            recommendation:
              'Free up system memory immediately - less than 2GB free',
          }
        );
      }

      if (memoryUsagePercent > 85 && freeGB < 1) {
        return this.createErrorResult(
          'System memory usage is high',
          undefined,
          {
            totalGB: totalGB.toFixed(2),
            freeGB: freeGB.toFixed(2),
            usedGB: usedGB.toFixed(2),
            usagePercent: memoryUsagePercent.toFixed(1) + '%',
            processRssGB: processRssGB.toFixed(2),
            recommendation: 'Free up system memory soon - less than 1GB free',
          }
        );
      }

      if (memoryUsagePercent > 80 && freeGB < 0.5) {
        return this.createErrorResult(
          'System memory usage is high',
          undefined,
          {
            totalGB: totalGB.toFixed(2),
            freeGB: freeGB.toFixed(2),
            usedGB: usedGB.toFixed(2),
            usagePercent: memoryUsagePercent.toFixed(1) + '%',
            processRssGB: processRssGB.toFixed(2),
            recommendation: 'Free up system memory - less than 500MB free',
          }
        );
      }

      if (memoryUsagePercent > 90 && freeGB >= 2) {
        return this.createWarningResult(
          'System memory usage is high but sufficient free memory available',
          {
            totalGB: totalGB.toFixed(2),
            freeGB: freeGB.toFixed(2),
            usedGB: usedGB.toFixed(2),
            usagePercent: memoryUsagePercent.toFixed(1) + '%',
            processRssGB: processRssGB.toFixed(2),
            recommendation:
              'Monitor memory usage - sufficient free memory available',
          }
        );
      }

      // Only warn if usage is high AND free memory is below threshold
      // For large systems, we're more lenient - only warn if free memory is actually low
      if (memoryUsagePercent > 85 && freeGB < warningFreeThreshold) {
        return this.createWarningResult('System memory usage is elevated', {
          totalGB: totalGB.toFixed(2),
          freeGB: freeGB.toFixed(2),
          usedGB: usedGB.toFixed(2),
          usagePercent: memoryUsagePercent.toFixed(1) + '%',
          processRssGB: processRssGB.toFixed(2),
          recommendation: 'Monitor memory usage - free memory is getting low',
        });
      }

      if (memoryUsagePercent > 80 && freeGB < lowWarningFreeThreshold) {
        return this.createWarningResult('System memory usage is elevated', {
          totalGB: totalGB.toFixed(2),
          freeGB: freeGB.toFixed(2),
          usedGB: usedGB.toFixed(2),
          usagePercent: memoryUsagePercent.toFixed(1) + '%',
          processRssGB: processRssGB.toFixed(2),
          recommendation: 'Monitor memory usage - free memory is getting low',
        });
      }

      // Check process memory (heap usage)
      const heapUsagePercent =
        processHeapTotal > 0 ? (processHeapUsed / processHeapTotal) * 100 : 0;

      if (heapUsagePercent > 90) {
        return this.createWarningResult('Process heap usage is high', {
          heapUsedMB: (processHeapUsed / (1024 * 1024)).toFixed(2),
          heapTotalMB: (processHeapTotal / (1024 * 1024)).toFixed(2),
          heapUsagePercent: heapUsagePercent.toFixed(1) + '%',
          recommendation: 'Monitor process memory usage',
        });
      }

      return this.createSuccessResult('Memory usage is healthy', {
        totalGB: totalGB.toFixed(2),
        freeGB: freeGB.toFixed(2),
        usedGB: usedGB.toFixed(2),
        usagePercent: memoryUsagePercent.toFixed(1) + '%',
        processRssGB: processRssGB.toFixed(2),
        heapUsagePercent: heapUsagePercent.toFixed(1) + '%',
      });
    } catch (error: any) {
      return this.createWarningResult('Failed to check memory usage', {
        error: error.message,
      });
    }
  }

  /**
   * Check CPU usage (limited - can only check load average on Unix)
   */
  private async checkCPUUsage(): Promise<CheckResult> {
    try {
      const cpus = os.cpus();
      const cpuCount = cpus.length;
      const loadAvg = os.loadavg();

      if (loadAvg.length === 0) {
        return this.createSuccessResult(
          'CPU check skipped: load average not available on this platform'
        );
      }

      // Calculate load average as percentage of CPU cores
      const load1Min = loadAvg[0];
      const load5Min = loadAvg[1];
      const load15Min = loadAvg[2];

      const loadPercent1Min = (load1Min / cpuCount) * 100;
      const loadPercent5Min = (load5Min / cpuCount) * 100;
      const loadPercent15Min = (load15Min / cpuCount) * 100;

      // Thresholds:
      // - Load average > 2.0 per core (>200%) = warning (severely overloaded)
      // - Load average > 1.5 per core (>150%) = warning (overloaded)
      // - Load average > 1.0 per core (>100%) = low warning (fully utilized)
      // Note: Load average of 1.0 per core is normal, but >1.0 indicates processes waiting
      // Also note: Load average includes I/O wait, so high load doesn't always mean high CPU usage

      if (loadPercent1Min > 200 || loadPercent5Min > 200) {
        return this.createWarningResult('System CPU load is very high', {
          cpuCount,
          load1Min: load1Min.toFixed(2),
          load5Min: load5Min.toFixed(2),
          load15Min: load15Min.toFixed(2),
          loadPercent1Min: loadPercent1Min.toFixed(1) + '%',
          loadPercent5Min: loadPercent5Min.toFixed(1) + '%',
          loadPercent15Min: loadPercent15Min.toFixed(1) + '%',
          recommendation:
            'System is severely overloaded - check for CPU-intensive processes',
        });
      }

      if (loadPercent1Min > 150 || loadPercent5Min > 150) {
        return this.createWarningResult('System CPU load is high', {
          cpuCount,
          load1Min: load1Min.toFixed(2),
          load5Min: load5Min.toFixed(2),
          load15Min: load15Min.toFixed(2),
          loadPercent1Min: loadPercent1Min.toFixed(1) + '%',
          loadPercent5Min: loadPercent5Min.toFixed(1) + '%',
          loadPercent15Min: loadPercent15Min.toFixed(1) + '%',
          recommendation:
            'System is overloaded - monitor CPU usage and consider scaling',
        });
      }

      if (loadPercent1Min > 100 || loadPercent5Min > 100) {
        return this.createWarningResult('System CPU load is elevated', {
          cpuCount,
          load1Min: load1Min.toFixed(2),
          load5Min: load5Min.toFixed(2),
          load15Min: load15Min.toFixed(2),
          loadPercent1Min: loadPercent1Min.toFixed(1) + '%',
          loadPercent5Min: loadPercent5Min.toFixed(1) + '%',
          loadPercent15Min: loadPercent15Min.toFixed(1) + '%',
          recommendation:
            'Load average indicates processes waiting - may be normal if I/O bound',
        });
      }

      return this.createSuccessResult('CPU usage is healthy', {
        cpuCount,
        load1Min: load1Min.toFixed(2),
        load5Min: load5Min.toFixed(2),
        load15Min: load15Min.toFixed(2),
      });
    } catch (error: any) {
      return this.createWarningResult('Failed to check CPU usage', {
        error: error.message,
      });
    }
  }

  /**
   * Check process resource limits
   */
  private async checkProcessLimits(): Promise<CheckResult> {
    try {
      // Get process resource usage (if available)
      const usage = process.resourceUsage?.();

      if (!usage) {
        return this.createSuccessResult(
          'Process limits check skipped: not available on this platform'
        );
      }

      const maxRss = usage.maxRSS || 0;
      const maxRssMB = maxRss / (1024 * 1024);

      // Check if we're approaching any limits
      // Note: Actual limits depend on system configuration
      if (maxRssMB > 2048) {
        return this.createWarningResult('Process memory usage is high', {
          maxRssMB: maxRssMB.toFixed(2),
          recommendation: 'Monitor process memory usage',
        });
      }

      return this.createSuccessResult('Process limits are healthy', {
        maxRssMB: maxRssMB.toFixed(2),
      });
    } catch (error: any) {
      return this.createWarningResult('Failed to check process limits', {
        error: error.message,
      });
    }
  }

  /**
   * Check platform compatibility
   */
  private async checkPlatform(): Promise<CheckResult> {
    try {
      const platform = process.platform;
      const arch = process.arch;
      const osType = os.type();
      const osRelease = os.release();

      // Check for known compatibility issues
      const supportedPlatforms = ['darwin', 'linux', 'win32'];
      if (!supportedPlatforms.includes(platform)) {
        return this.createWarningResult('Platform may not be fully supported', {
          platform,
          arch,
          osType,
          osRelease,
          recommendation: 'Verify platform compatibility',
        });
      }

      return this.createSuccessResult('Platform is supported', {
        platform,
        arch,
        osType,
        osRelease,
      });
    } catch (error: any) {
      return this.createWarningResult('Failed to check platform', {
        error: error.message,
      });
    }
  }

  /**
   * Auto-fix system issues (limited - most require manual intervention)
   */
  async autoFix(
    issues: DiagnosticIssue[],
    options?: FixOptions
  ): Promise<FixResult[]> {
    const results: FixResult[] = [];

    for (const issue of issues) {
      const startTime = Date.now();

      // Most system issues cannot be auto-fixed
      results.push(
        this.createFixResult(
          issue.id,
          false,
          'Auto-fix not available for system resource issues',
          {
            duration: Date.now() - startTime,
          }
        )
      );
    }

    return results;
  }
}
