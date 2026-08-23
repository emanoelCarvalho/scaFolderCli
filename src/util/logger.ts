import pc from 'picocolors';

export const LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  success(message: string): void;
  /** Raw line, never prefixed or filtered by level (except `silent`). */
  print(message: string): void;
}

export interface ConsoleLoggerOptions {
  level?: LogLevel;
}

/**
 * Diagnostics go to stderr so that stdout stays usable for machine-readable
 * output (`--json`), which keeps the CLI pipe-friendly.
 */
export class ConsoleLogger implements Logger {
  private level: LogLevel;

  constructor(options: ConsoleLoggerOptions = {}) {
    this.level = options.level ?? 'info';
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private enabled(level: Exclude<LogLevel, 'silent'>): boolean {
    return LEVEL_WEIGHT[this.level] >= LEVEL_WEIGHT[level];
  }

  debug(message: string): void {
    if (this.enabled('debug')) console.error(pc.dim(`  ${message}`));
  }

  info(message: string): void {
    if (this.enabled('info')) console.error(message);
  }

  warn(message: string): void {
    if (this.enabled('warn')) console.error(`${pc.yellow('warn')} ${message}`);
  }

  error(message: string): void {
    if (this.enabled('error')) console.error(`${pc.red('error')} ${message}`);
  }

  success(message: string): void {
    if (this.enabled('info')) console.error(`${pc.green('✔')} ${message}`);
  }

  print(message: string): void {
    if (this.level !== 'silent') console.log(message);
  }
}

/** Collects output instead of writing it. Used by tests and dry runs. */
export class MemoryLogger implements Logger {
  readonly lines: string[] = [];

  debug(message: string): void {
    this.lines.push(`debug: ${message}`);
  }
  info(message: string): void {
    this.lines.push(`info: ${message}`);
  }
  warn(message: string): void {
    this.lines.push(`warn: ${message}`);
  }
  error(message: string): void {
    this.lines.push(`error: ${message}`);
  }
  success(message: string): void {
    this.lines.push(`success: ${message}`);
  }
  print(message: string): void {
    this.lines.push(message);
  }
}

export const SILENT_LOGGER: Logger = new MemoryLogger();
