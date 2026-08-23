/**
 * Error codes are stable, machine-readable identifiers. They are part of the
 * CLI contract: scripts may branch on them, so never repurpose an existing one.
 */
export type ScafolderErrorCode =
  | 'INVALID_CONFIG'
  | 'INVALID_COMBINATION'
  | 'INVALID_PROJECT_NAME'
  | 'TARGET_NOT_EMPTY'
  | 'TEMPLATE_NOT_FOUND'
  | 'GENERATOR_NOT_FOUND'
  | 'COMMAND_FAILED'
  | 'CANCELLED'
  | 'UNSUPPORTED_ENVIRONMENT'
  | 'INTERNAL';

export interface ScafolderErrorOptions {
  /** Actionable next step shown to the user below the message. */
  hint?: string;
  cause?: unknown;
}

/**
 * The only error type the CLI is allowed to surface to users. Anything else
 * reaching the top level is a bug and is reported as INTERNAL.
 */
export class ScafolderError extends Error {
  readonly code: ScafolderErrorCode;
  readonly hint: string | undefined;

  constructor(code: ScafolderErrorCode, message: string, options: ScafolderErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'ScafolderError';
    this.code = code;
    this.hint = options.hint;
  }
}

export function isScafolderError(error: unknown): error is ScafolderError {
  return error instanceof ScafolderError;
}

/** User aborted an interactive prompt. Surfaced with exit code 130, as with SIGINT. */
export function cancelled(message = 'Operation cancelled.'): ScafolderError {
  return new ScafolderError('CANCELLED', message);
}

/** Wraps an unknown thrown value into a reportable error. */
export function toScafolderError(error: unknown): ScafolderError {
  if (isScafolderError(error)) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new ScafolderError('INTERNAL', message, { cause: error });
}
