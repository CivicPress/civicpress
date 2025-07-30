export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  data?: any;
  error?: Error;
}

export class NotificationLogger {
  private logLevel: LogLevel = LogLevel.INFO;
  private logEntries: LogEntry[] = [];
  private maxEntries: number = 1000;

  constructor(logLevel: LogLevel = LogLevel.INFO) {
    this.logLevel = logLevel;
  }

  /**
   * Set log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Log info message
   */
  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, data?: any): void {
    this.log(LogLevel.ERROR, message, data, error);
  }

  /**
   * Internal log method
   */
  private log(
    level: LogLevel,
    message: string,
    data?: any,
    error?: Error
  ): void {
    if (level < this.logLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      data,
      error,
    };

    this.logEntries.push(entry);

    // Rotate log if too large
    if (this.logEntries.length > this.maxEntries) {
      this.logEntries = this.logEntries.slice(-this.maxEntries / 2);
    }

    // Output to console
    this.outputToConsole(entry);
  }

  /**
   * Output log entry to console
   */
  private outputToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const levelStr = LogLevel[entry.level];
    const prefix = `[${timestamp}] [${levelStr}]`;

    if (entry.error) {
      console.error(`${prefix} ${entry.message}`, entry.error, entry.data);
    } else if (entry.data) {
      console.log(`${prefix} ${entry.message}`, entry.data);
    } else {
      console.log(`${prefix} ${entry.message}`);
    }
  }

  /**
   * Get log entries
   */
  getLogEntries(level?: LogLevel, limit?: number): LogEntry[] {
    let entries = this.logEntries;

    if (level !== undefined) {
      entries = entries.filter((entry) => entry.level >= level);
    }

    if (limit !== undefined) {
      entries = entries.slice(-limit);
    }

    return entries;
  }

  /**
   * Get log statistics
   */
  getLogStatistics(): {
    total: number;
    byLevel: Record<string, number>;
    errors: number;
  } {
    const byLevel: Record<string, number> = {};
    let errors = 0;

    this.logEntries.forEach((entry) => {
      const levelStr = LogLevel[entry.level];
      byLevel[levelStr] = (byLevel[levelStr] || 0) + 1;

      if (entry.level === LogLevel.ERROR) {
        errors++;
      }
    });

    return {
      total: this.logEntries.length,
      byLevel,
      errors,
    };
  }

  /**
   * Clear log entries
   */
  clearLog(): void {
    this.logEntries = [];
  }

  /**
   * Export log entries
   */
  exportLog(): string {
    return this.logEntries.map((entry) => JSON.stringify(entry)).join('\n');
  }
}
