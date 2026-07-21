import chalk from 'chalk';

export enum LogLevel {
  SILENT = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  VERBOSE = 5,
}

export interface LoggerOptions {
  level?: LogLevel;
  silent?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  json?: boolean;
  noColor?: boolean;
}

/**
 * Process-wide logger defaults, applied to EVERY Logger that was not given the
 * option explicitly.
 *
 * Why this exists: `--json` is a machine contract — stdout must be exactly one
 * parseable document — but a CLI process is full of `new Logger()` instances
 * created with no options at all, several of them at MODULE level (so they are
 * constructed while the entry point's imports are still being evaluated, long
 * before any flag has been parsed). Those loggers happily printed human lines
 * around the JSON payload: config/secret loading, permission checks, and so on.
 *
 * `CentralConfigManager.setLoggerOptions()` already existed and the CLI already
 * called it at startup "to prevent warnings during config loading" — but
 * nothing ever READ the value back, so it was dead state and the flags had no
 * effect outside the one logger it rebuilt. Routing it here gives it the effect
 * it was always supposed to have.
 *
 * Resolution is LAZY (checked per call, not captured in the constructor)
 * precisely because of those module-level instances: they exist before the
 * defaults are installed and would otherwise never see them.
 *
 * An explicit constructor option always wins, so a Logger deliberately built
 * with `{ json: false }` is never silenced by the global default.
 */
let globalLoggerDefaults: LoggerOptions = {};

export function setGlobalLoggerDefaults(options: LoggerOptions): void {
  globalLoggerDefaults = { ...options };
}

export function getGlobalLoggerDefaults(): LoggerOptions {
  return globalLoggerDefaults;
}

/** Test/reset hook — drops any installed process-wide defaults. */
export function resetGlobalLoggerDefaults(): void {
  globalLoggerDefaults = {};
}

export class Logger {
  private level: LogLevel;
  private json: boolean;
  private noColor: boolean;
  /** Whether each flag was given explicitly (explicit beats the global default). */
  private readonly explicit: { json: boolean; noColor: boolean };

  /** Effective JSON mode: explicit option, else the process-wide default. */
  private get jsonMode(): boolean {
    return this.explicit.json ? this.json : globalLoggerDefaults.json === true;
  }

  /** Effective colour suppression: explicit option, else the process default. */
  private get noColorMode(): boolean {
    return this.explicit.noColor
      ? this.noColor
      : globalLoggerDefaults.noColor === true;
  }

  constructor(options: LoggerOptions = {}) {
    this.explicit = {
      json: options.json !== undefined,
      noColor: options.noColor !== undefined,
    };
    // Determine log level from options
    if (options.silent) {
      this.level = LogLevel.SILENT;
    } else if (options.quiet) {
      this.level = LogLevel.ERROR;
    } else if (options.verbose) {
      this.level = LogLevel.VERBOSE;
    } else {
      this.level = options.level || LogLevel.INFO;
    }

    this.json = options.json || false;
    this.noColor = options.noColor || false;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.level;
  }

  private formatMessage(level: LogLevel, message: string, data?: unknown): string {
    if (this.jsonMode) {
      return JSON.stringify({
        level: LogLevel[level],
        message,
        timestamp: new Date().toISOString(),
        ...(data !== undefined && data !== null ? { data } : {}),
      });
    }

    if (this.noColorMode) {
      return message;
    }

    const levelColors: Record<LogLevel, (text: string) => string> = {
      [LogLevel.ERROR]: chalk.red,
      [LogLevel.WARN]: chalk.yellow,
      [LogLevel.INFO]: chalk.blue,
      [LogLevel.DEBUG]: chalk.gray,
      [LogLevel.VERBOSE]: chalk.gray,
      [LogLevel.SILENT]: chalk.white,
    };

    const color = levelColors[level] || chalk.white;
    return color(message);
  }

  error(message: string, data?: unknown): void {
    // Suppress all output in JSON mode to avoid polluting CLI JSON output
    if (this.jsonMode) {
      return;
    }
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage(LogLevel.ERROR, message, data));
    }
  }

  warn(message: string, data?: unknown): void {
    // Suppress warnings in JSON mode or silent mode to avoid polluting stdout
    if (this.jsonMode || this.level === LogLevel.SILENT) {
      return;
    }
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(LogLevel.WARN, message, data));
    }
  }

  info(message: string, data?: unknown): void {
    // Suppress all output in JSON mode to avoid polluting CLI JSON output
    if (this.jsonMode) {
      return;
    }
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage(LogLevel.INFO, message, data));
    }
  }

  debug(message: string, data?: unknown): void {
    // Suppress all output in JSON mode to avoid polluting CLI JSON output
    if (this.jsonMode) {
      return;
    }
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage(LogLevel.DEBUG, message, data));
    }
  }

  verbose(message: string, data?: unknown): void {
    // Suppress all output in JSON mode to avoid polluting CLI JSON output
    if (this.jsonMode) {
      return;
    }
    if (this.shouldLog(LogLevel.VERBOSE)) {
      console.log(this.formatMessage(LogLevel.VERBOSE, message, data));
    }
  }

  // Convenience methods for common patterns
  success(message: string, data?: unknown): void {
    // Suppress all output in JSON mode to avoid polluting CLI JSON output
    if (this.jsonMode) {
      return;
    }
    if (this.shouldLog(LogLevel.INFO)) {
      const formattedMessage = this.noColorMode ? message : chalk.green(message);
      console.log(this.formatMessage(LogLevel.INFO, formattedMessage, data));
    }
  }

  // Raw output (always shown unless silent)
  output(message: string): void {
    // Suppress all output in JSON mode to avoid polluting CLI JSON output
    if (this.jsonMode) {
      return;
    }
    if (this.level > LogLevel.SILENT) {
      console.log(message);
    }
  }

  // Error output (always shown unless silent)
  errorOutput(message: string): void {
    // Suppress all output in JSON mode to avoid polluting CLI JSON output
    if (this.jsonMode) {
      return;
    }
    if (this.level > LogLevel.SILENT) {
      console.error(message);
    }
  }

  // Get current log level
  getLevel(): LogLevel {
    return this.level;
  }

  // Check if silent mode is enabled
  isSilent(): boolean {
    return this.level === LogLevel.SILENT;
  }

  // Check if quiet mode is enabled
  isQuiet(): boolean {
    return this.level <= LogLevel.ERROR;
  }

  // Check if verbose mode is enabled
  isVerbose(): boolean {
    return this.level >= LogLevel.VERBOSE;
  }
}

// Global logger instance
let globalLogger: Logger | null = null;

export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}

export function setLogger(logger: Logger): void {
  globalLogger = logger;
}

export function createLogger(options: LoggerOptions): Logger {
  return new Logger(options);
}
