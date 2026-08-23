import type { GenerationRequest, ProjectConfig } from '../config/schema.js';
import type { ProjectFiles } from '../fs/project-files.js';
import type { PackageManagerAdapter } from '../process/package-manager.js';
import type { CommandResult, RunCommandOptions } from '../process/exec.js';
import type { TemplateData } from '../template/data.js';
import type { Logger } from '../util/logger.js';

/**
 * Everything a generator is allowed to touch. Generators never import the
 * filesystem or child_process directly, which is what keeps them unit-testable
 * and keeps `--dry-run` honest.
 */
export interface GenerationContext {
  readonly config: ProjectConfig;
  readonly request: GenerationRequest;
  readonly targetDir: string;
  readonly files: ProjectFiles;
  readonly data: TemplateData;
  readonly logger: Logger;
  readonly packageManager: PackageManagerAdapter;
  /** Runs a command inside the target directory. */
  run(
    command: string,
    args: readonly string[],
    options?: RunCommandOptions,
  ): Promise<CommandResult>;
}
