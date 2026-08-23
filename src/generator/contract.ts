import type { Framework } from '../config/schema.js';
import type { DocumentationFacts } from '../docs/facts.js';
import type { GenerationContext } from './context.js';

/**
 * The extension point of scafoldercli. Adding a framework means adding one
 * implementation of this interface and registering it — no core file changes.
 *
 * Lifecycle, in order:
 *
 *   validate    → cheap preconditions, may run before anything is written
 *   initialize  → delegate to the framework's official scaffolder (writes to disk)
 *   generate    → compose our template layers (buffered, then flushed)
 *   finalize    → post-install steps such as `prisma generate` (optional)
 */
export interface FrameworkGenerator {
  readonly framework: Framework;

  /**
   * Preconditions beyond the capability matrix, e.g. a required external CLI.
   * Must not modify anything.
   */
  validate(context: GenerationContext): Promise<void>;

  /**
   * Runs the ecosystem's own scaffolder. Writes straight to disk because an
   * external process owns the output; skipped in dry-run mode.
   */
  initialize(context: GenerationContext): Promise<void>;

  /** Composes template layers and patches package.json. Buffered writes only. */
  generate(context: GenerationContext): Promise<void>;

  /**
   * Facts about the project that was just described by `generate`. Required, so
   * that generated documentation can never drift into generic boilerplate.
   */
  documentation(context: GenerationContext): DocumentationFacts;

  /** Runs after dependencies are installed. */
  finalize?(context: GenerationContext): Promise<void>;

  /** Human-readable steps for `--dry-run`. */
  describePlan?(context: GenerationContext): string[];

  /** Shown at the end of a successful run. */
  nextSteps?(context: GenerationContext): string[];
}
