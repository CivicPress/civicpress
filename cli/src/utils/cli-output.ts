import { Logger } from '@civicpress/core';
import chalk from 'chalk';

export interface CliOutputOptions {
  silent?: boolean;
  json?: boolean;
  noColor?: boolean;
  verbose?: boolean;
}

export interface CliSuccessOutput<T = any> {
  success: true;
  data: T;
  message?: string;
  meta?: {
    operation?: string;
    duration?: number;
    [key: string]: any;
  };
}

export interface CliErrorOutput {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: any;
  };
}

export class CliOutput {
  private static instance: CliOutput;
  private logger: Logger;
  private options: CliOutputOptions;

  private constructor() {
    this.logger = new Logger();
    this.options = {};
  }

  static getInstance(): CliOutput {
    if (!CliOutput.instance) {
      CliOutput.instance = new CliOutput();
    }
    return CliOutput.instance;
  }

  setOptions(options: CliOutputOptions): void {
    this.options = { ...this.options, ...options };
  }

  // Success output with structured formatting
  success<T>(
    data: T,
    message?: string,
    meta?: CliSuccessOutput<T>['meta']
  ): void {
    if (this.options.silent) return;

    const output: CliSuccessOutput<T> = {
      success: true,
      data,
      ...(message && { message }),
      ...(meta && { meta }),
    };

    if (this.options.json) {
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    // Human-readable output
    if (message) {
      console.log(chalk.green(`✅ ${message}`));
    }

    if (meta?.operation) {
      this.logger.info(`CLI operation completed: ${meta.operation}`, {
        operation: meta.operation,
        duration: meta.duration,
        ...meta,
      });
    }
  }

  // Error output with structured formatting
  error(
    message: string,
    code?: string,
    details?: any,
    operation?: string
  ): void {
    if (this.options.silent) return;

    const output: CliErrorOutput = {
      success: false,
      error: {
        message,
        ...(code && { code }),
        ...(details && { details }),
      },
    };

    if (this.options.json) {
      console.error(JSON.stringify(output, null, 2));
      return;
    }

    // Human-readable error output
    console.error(chalk.red(`❌ ${message}`));
    if (code) {
      console.error(chalk.gray(`   Code: ${code}`));
    }
    if (details) {
      console.error(
        chalk.gray(`   Details: ${JSON.stringify(details, null, 2)}`)
      );
    }

    // Log error
    this.logger.error(`CLI operation failed: ${message}`, {
      operation,
      code,
      details,
    });
  }

  // Info output
  info(message: string, operation?: string): void {
    if (this.options.silent) return;

    if (this.options.json) {
      // In JSON mode, info messages are logged but not output
      this.logger.info(`CLI info: ${message}`, { operation });
      return;
    }

    console.log(chalk.blue(`ℹ️  ${message}`));
    this.logger.info(`CLI info: ${message}`, { operation });
  }

  // Warning output
  warn(message: string, operation?: string): void {
    if (this.options.silent) return;

    if (this.options.json) {
      // In JSON mode, warnings are logged but not output
      this.logger.warn(`CLI warning: ${message}`, { operation });
      return;
    }

    console.log(chalk.yellow(`⚠️  ${message}`));
    this.logger.warn(`CLI warning: ${message}`, { operation });
  }

  // Debug output (only in verbose mode)
  debug(message: string, data?: any, operation?: string): void {
    if (this.options.silent || !this.options.verbose) return;

    if (this.options.json) {
      // In JSON mode, debug is logged but not output
      this.logger.debug(`CLI debug: ${message}`, { operation, ...data });
      return;
    }

    console.log(chalk.gray(`🔍 ${message}`));
    if (data) {
      console.log(chalk.gray(`   ${JSON.stringify(data, null, 2)}`));
    }
    this.logger.debug(`CLI debug: ${message}`, { operation, ...data });
  }

  // Progress output
  progress(message: string, operation?: string): void {
    if (this.options.silent) return;

    if (this.options.json) {
      // In JSON mode, progress is logged but not output
      this.logger.info(`CLI progress: ${message}`, { operation });
      return;
    }

    console.log(chalk.cyan(`🔄 ${message}`));
    this.logger.info(`CLI progress: ${message}`, { operation });
  }

  // Table output (for structured data)
  table<T extends Record<string, any>>(
    data: T[],
    headers?: (keyof T)[],
    operation?: string
  ): void {
    if (this.options.silent) return;

    if (this.options.json) {
      this.success(data, undefined, { operation, format: 'table' });
      return;
    }

    // Simple table formatting for CLI
    if (data.length === 0) {
      console.log(chalk.gray('No data to display'));
      return;
    }

    const keys = headers || Object.keys(data[0]);
    const maxWidths = keys.map((key) => {
      const keyStr = String(key);
      const maxDataWidth = Math.max(
        keyStr.length,
        ...data.map((row) => String(row[key]).length)
      );
      return Math.min(maxDataWidth, 50); // Cap at 50 chars
    });

    // Header
    const headerRow = keys
      .map((key, i) => String(key).padEnd(maxWidths[i]))
      .join('  ');
    console.log(chalk.bold(headerRow));

    // Separator
    console.log(chalk.gray('─'.repeat(headerRow.length)));

    // Data rows
    data.forEach((row) => {
      const dataRow = keys
        .map((key, i) => String(row[key]).padEnd(maxWidths[i]))
        .join('  ');
      console.log(dataRow);
    });

    this.logger.info(`CLI table displayed: ${data.length} rows`, { operation });
  }

  // List output (for simple lists)
  list(items: string[], title?: string, operation?: string): void {
    if (this.options.silent) return;

    if (this.options.json) {
      this.success(items, title, { operation, format: 'list' });
      return;
    }

    if (title) {
      console.log(chalk.bold(title));
    }

    items.forEach((item) => {
      console.log(chalk.gray(`  • ${item}`));
    });

    this.logger.info(`CLI list displayed: ${items.length} items`, {
      operation,
    });
  }

  // Raw output (for when you need direct console access)
  raw(message: string): void {
    if (this.options.silent) return;
    console.log(message);
  }

  // Start operation timing
  startOperation(operation: string): () => void {
    const startTime = Date.now();

    if (!this.options.silent && !this.options.json) {
      console.log(chalk.cyan(`🔄 Starting: ${operation}`));
    }

    return () => {
      const duration = Date.now() - startTime;
      this.logger.info(`CLI operation completed: ${operation}`, {
        operation,
        duration,
      });
    };
  }
}

// Export singleton instance
export const cliOutput = CliOutput.getInstance();

// Convenience functions
export function cliSuccess<T>(
  data: T,
  message?: string,
  meta?: CliSuccessOutput<T>['meta']
): void {
  cliOutput.success(data, message, meta);
}

export function cliError(
  message: string,
  code?: string,
  details?: any,
  operation?: string
): void {
  cliOutput.error(message, code, details, operation);
}

export function cliInfo(message: string, operation?: string): void {
  cliOutput.info(message, operation);
}

export function cliWarn(message: string, operation?: string): void {
  cliOutput.warn(message, operation);
}

export function cliDebug(
  message: string,
  data?: any,
  operation?: string
): void {
  cliOutput.debug(message, data, operation);
}

export function cliProgress(message: string, operation?: string): void {
  cliOutput.progress(message, operation);
}

export function cliTable<T extends Record<string, any>>(
  data: T[],
  headers?: (keyof T)[],
  operation?: string
): void {
  cliOutput.table(data, headers, operation);
}

export function cliList(
  items: string[],
  title?: string,
  operation?: string
): void {
  cliOutput.list(items, title, operation);
}

export function cliRaw(message: string): void {
  cliOutput.raw(message);
}

export function cliStartOperation(operation: string): () => void {
  return cliOutput.startOperation(operation);
}
