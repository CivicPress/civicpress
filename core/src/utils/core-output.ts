import { Logger, LogLevel, LoggerOptions } from './logger.js';

export interface CoreOutputOptions extends LoggerOptions {
  operation?: string;
  context?: Record<string, unknown>;
}

export interface CoreSuccessOutput<T = unknown> {
  success: true;
  data: T;
  message?: string;
  meta?: {
    operation?: string;
    duration?: number;
    context?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface CoreErrorOutput {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: unknown;
    context?: Record<string, unknown>;
  };
}

export class CoreOutput {
  private static instance: CoreOutput;
  private logger: Logger;
  private options: CoreOutputOptions;

  private constructor() {
    this.logger = new Logger();
    this.options = {};
  }

  static getInstance(): CoreOutput {
    if (!CoreOutput.instance) {
      CoreOutput.instance = new CoreOutput();
    }
    return CoreOutput.instance;
  }

  setOptions(options: CoreOutputOptions): void {
    this.options = { ...this.options, ...options };
    // Update the logger with the new options
    this.logger = new Logger(options);
  }

  // Success output with structured formatting
  success<T>(
    data: T,
    message?: string,
    meta?: CoreSuccessOutput<T>['meta']
  ): void {
    const output: CoreSuccessOutput<T> = {
      success: true,
      data,
      ...(message && { message }),
      ...(meta && { meta }),
    };

    if (this.options.json) {
      this.logger.output(JSON.stringify(output, null, 2));
      return;
    }

    // Human-readable output
    // Only log message if no lifecycle operation is tracking this (avoid duplicates)
    // Lifecycle operations (coreStartOperation) already log completion with ✅
    if (message && !meta?.operation) {
      this.logger.success(message);
    }

    // Don't log "Core operation completed" - lifecycle operations already handle this
  }

  // Error output with structured formatting
  error(
    message: string,
    code?: string,
    details?: unknown,
    context?: Record<string, unknown>
  ): void {
    const output: CoreErrorOutput = {
      success: false,
      error: {
        message,
        ...(code ? { code } : {}),
        ...(details !== undefined ? { details } : {}),
        ...(context ? { context } : {}),
      },
    };

    if (this.options.json) {
      this.logger.errorOutput(JSON.stringify(output, null, 2));
      return;
    }

    // Human-readable error output
    this.logger.error(message, {
      code,
      details,
      context,
      operation: this.options.operation,
    });
  }

  // Info output
  info(message: string, context?: Record<string, unknown>): void {
    this.logger.info(message, {
      context,
      operation: this.options.operation,
    });
  }

  // Warning output
  warn(message: string, context?: Record<string, unknown>): void {
    this.logger.warn(message, {
      context,
      operation: this.options.operation,
    });
  }

  // Debug output
  debug(
    message: string,
    data?: unknown,
    context?: Record<string, unknown>
  ): void {
    this.logger.debug(message, {
      ...(data && typeof data === 'object' ? data : { data }),
      context,
      operation: this.options.operation,
    });
  }

  // Progress output
  progress(message: string, context?: Record<string, unknown>): void {
    this.logger.info(`🔄 ${message}`, {
      context,
      operation: this.options.operation,
    });
  }

  // Start operation timing
  startOperation(operation: string): () => void {
    const startTime = Date.now();

    this.logger.info(`Starting: ${operation}`, {
      operation,
    });

    return () => {
      const duration = Date.now() - startTime;
      this.logger.info(`Finished: ${operation}`, {
        operation,
        duration,
      });
    };
  }

  // Raw output (for when you need direct console access)
  raw(message: string): void {
    this.logger.output(message);
  }

  // Error output (for when you need direct console access)
  errorRaw(message: string): void {
    this.logger.errorOutput(message);
  }

  // Get underlying logger for advanced usage
  getLogger(): Logger {
    return this.logger;
  }

  // Set log level
  setLevel(level: LogLevel): void {
    this.logger = new Logger({ ...this.options, level });
  }

  // Check if silent
  isSilent(): boolean {
    return this.logger.isSilent();
  }

  // Check if verbose
  isVerbose(): boolean {
    return this.logger.isVerbose();
  }
}

// Export singleton instance
export const coreOutput = CoreOutput.getInstance();

// Convenience functions
export function coreSuccess<T>(
  data: T,
  message?: string,
  meta?: CoreSuccessOutput<T>['meta']
): void {
  coreOutput.success(data, message, meta);
}

interface CivicPressLikeError extends Error {
  getOutputDetails(): {
    message: string;
    code?: string;
    details?: unknown;
    context?: Record<string, unknown>;
  };
}

function hasOutputDetails(error: Error): error is CivicPressLikeError {
  return (
    'getOutputDetails' in error &&
    typeof (error as { getOutputDetails?: unknown }).getOutputDetails ===
      'function'
  );
}

export function coreError(
  message: string | Error,
  code?: string,
  details?: unknown,
  context?: Record<string, unknown>
): void {
  // If first argument is a CivicPressError, extract details automatically
  if (message instanceof Error && hasOutputDetails(message)) {
    const outputDetails = message.getOutputDetails();
    coreOutput.error(
      outputDetails.message,
      outputDetails.code,
      outputDetails.details,
      outputDetails.context
    );
    return;
  }

  // Original behavior for backward compatibility
  coreOutput.error(
    typeof message === 'string' ? message : message.message || 'Unknown error',
    code,
    details,
    context
  );
}

export function coreInfo(
  message: string,
  context?: Record<string, unknown>
): void {
  coreOutput.info(message, context);
}

export function coreWarn(
  message: string,
  context?: Record<string, unknown>
): void {
  coreOutput.warn(message, context);
}

export function coreDebug(
  message: string,
  data?: unknown,
  context?: Record<string, unknown>
): void {
  coreOutput.debug(message, data, context);
}

export function coreProgress(
  message: string,
  context?: Record<string, unknown>
): void {
  coreOutput.progress(message, context);
}

export function coreRaw(message: string): void {
  coreOutput.raw(message);
}

export function coreErrorRaw(message: string): void {
  coreOutput.errorRaw(message);
}

export function coreStartOperation(operation: string): () => void {
  return coreOutput.startOperation(operation);
}
