import { Logger, LogLevel, LoggerOptions } from './logger.js';

export interface CoreOutputOptions extends LoggerOptions {
  operation?: string;
  context?: Record<string, any>;
}

export interface CoreSuccessOutput<T = any> {
  success: true;
  data: T;
  message?: string;
  meta?: {
    operation?: string;
    duration?: number;
    context?: Record<string, any>;
    [key: string]: any;
  };
}

export interface CoreErrorOutput {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: any;
    context?: Record<string, any>;
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
    if (message) {
      this.logger.success(message);
    }

    if (meta?.operation) {
      this.logger.info(`Core operation completed: ${meta.operation}`, {
        operation: meta.operation,
        duration: meta.duration,
        context: meta.context,
        ...meta,
      });
    }
  }

  // Error output with structured formatting
  error(
    message: string,
    code?: string,
    details?: any,
    context?: Record<string, any>
  ): void {
    const output: CoreErrorOutput = {
      success: false,
      error: {
        message,
        ...(code && { code }),
        ...(details && { details }),
        ...(context && { context }),
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
  info(message: string, context?: Record<string, any>): void {
    this.logger.info(message, {
      context,
      operation: this.options.operation,
    });
  }

  // Warning output
  warn(message: string, context?: Record<string, any>): void {
    this.logger.warn(message, {
      context,
      operation: this.options.operation,
    });
  }

  // Debug output
  debug(message: string, data?: any, context?: Record<string, any>): void {
    this.logger.debug(message, {
      ...data,
      context,
      operation: this.options.operation,
    });
  }

  // Progress output
  progress(message: string, context?: Record<string, any>): void {
    this.logger.info(`🔄 ${message}`, {
      context,
      operation: this.options.operation,
    });
  }

  // Start operation timing
  startOperation(operation: string): () => void {
    const startTime = Date.now();

    this.logger.info(`🔄 Starting: ${operation}`, {
      operation,
    });

    return () => {
      const duration = Date.now() - startTime;
      this.logger.info(`✅ Completed: ${operation}`, {
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

export function coreError(
  message: string,
  code?: string,
  details?: any,
  context?: Record<string, any>
): void {
  coreOutput.error(message, code, details, context);
}

export function coreInfo(message: string, context?: Record<string, any>): void {
  coreOutput.info(message, context);
}

export function coreWarn(message: string, context?: Record<string, any>): void {
  coreOutput.warn(message, context);
}

export function coreDebug(
  message: string,
  data?: any,
  context?: Record<string, any>
): void {
  coreOutput.debug(message, data, context);
}

export function coreProgress(
  message: string,
  context?: Record<string, any>
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
