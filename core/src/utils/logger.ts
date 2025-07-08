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

export class Logger {
  private level: LogLevel;
  private json: boolean;
  private noColor: boolean;

  constructor(options: LoggerOptions = {}) {
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

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    if (this.json) {
      return JSON.stringify({
        level: LogLevel[level],
        message,
        timestamp: new Date().toISOString(),
        ...(data && { data }),
      });
    }

    if (this.noColor) {
      return message;
    }

    const levelColors: Record<LogLevel, any> = {
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

  error(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage(LogLevel.ERROR, message, data));
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(LogLevel.WARN, message, data));
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage(LogLevel.INFO, message, data));
    }
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage(LogLevel.DEBUG, message, data));
    }
  }

  verbose(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.VERBOSE)) {
      console.log(this.formatMessage(LogLevel.VERBOSE, message, data));
    }
  }

  // Convenience methods for common patterns
  success(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const formattedMessage = this.noColor ? message : chalk.green(message);
      console.log(this.formatMessage(LogLevel.INFO, formattedMessage, data));
    }
  }

  // Raw output (always shown unless silent)
  output(message: string): void {
    if (this.level > LogLevel.SILENT) {
      console.log(message);
    }
  }

  // Error output (always shown unless silent)
  errorOutput(message: string): void {
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
