import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { applyFrameworkDefaults, assertCompatible } from '../config/capabilities.js';
import { findPreset, presetNames } from '../config/presets.js';
import {
  parseProjectConfig,
  type GenerationRequest,
  type PartialProjectConfig,
} from '../config/schema.js';
import { generateProject, type GenerationResult } from '../generator/pipeline.js';
import { detectPackageManager } from '../process/package-manager.js';
import { promptForConfig } from '../prompts/create.js';
import { ScafolderError } from '../util/errors.js';
import type { Logger } from '../util/logger.js';
import { assertProjectName, resolveTargetDir, suggestProjectName } from '../util/project-name.js';

/** Flags accepted by `scafoldercli create`. Undefined means "not answered yet". */
export interface CreateCommandOptions {
  preset?: string;
  framework?: string;
  projectType?: string;
  architecture?: string;
  database?: string;
  orm?: string;
  auth?: string;
  testing?: string;
  packageManager?: string;
  repository?: boolean;
  docker?: boolean;
  aiDocs?: boolean;
  install?: boolean;
  git?: boolean;
  dir?: string;
  dryRun?: boolean;
  force?: boolean;
  /** Skip all prompts and fail instead of asking. */
  yes?: boolean;
}

export interface CreateCommandDeps {
  logger: Logger;
  cwd: string;
  /** Interactive prompts are unavailable when stdin is not a TTY. */
  interactive: boolean;
}

export async function runCreateCommand(
  nameArgument: string | undefined,
  options: CreateCommandOptions,
  deps: CreateCommandDeps,
): Promise<GenerationResult> {
  const initial = buildInitialConfig(nameArgument, options);
  const nonInteractive = options.yes === true || !deps.interactive;

  const config = nonInteractive
    ? resolveNonInteractiveConfig(initial, deps)
    : await runInteractive(initial, deps);

  assertCompatible(config);

  const targetDir = resolveTargetDir(config.projectName, deps.cwd, options.dir);
  const request: GenerationRequest = {
    config,
    targetDir,
    install: options.install ?? true,
    git: options.git ?? true,
    dryRun: options.dryRun ?? false,
    force: options.force ?? false,
  };

  if (nonInteractive) {
    const result = await generateProject(request, { logger: deps.logger });
    reportNonInteractiveResult(result, deps);
    return result;
  }

  const spinner = p.spinner();
  spinner.start(request.dryRun ? 'Planning project' : 'Generating project');
  try {
    const result = await generateProject(request, { logger: deps.logger });
    spinner.stop(request.dryRun ? 'Plan ready' : 'Project generated');
    reportResult(result, deps);
    return result;
  } catch (error) {
    spinner.stop('Generation failed');
    throw error;
  }
}

async function runInteractive(initial: PartialProjectConfig, deps: CreateCommandDeps) {
  p.intro(pc.bgCyan(pc.black(' scafoldercli ')));
  const config = await promptForConfig({
    initial,
    defaultProjectName: suggestProjectName(deps.cwd),
  });
  return config;
}

/**
 * In non-interactive mode the framework's defaults fill everything the caller
 * left out. The framework itself can never be defaulted: guessing it would
 * silently produce the wrong project.
 */
function resolveNonInteractiveConfig(initial: PartialProjectConfig, deps: CreateCommandDeps) {
  if (!initial.framework) {
    throw new ScafolderError(
      'INVALID_CONFIG',
      'A framework is required when prompts are unavailable.',
      { hint: `Pass --framework <name> or --preset <${presetNames().join('|')}>.` },
    );
  }
  const withDefaults = applyFrameworkDefaults(initial);
  return parseProjectConfig({
    projectName: withDefaults.projectName ?? suggestProjectName(deps.cwd),
    packageManager: withDefaults.packageManager ?? detectPackageManager(),
    ...withDefaults,
  });
}

function buildInitialConfig(
  nameArgument: string | undefined,
  options: CreateCommandOptions,
): PartialProjectConfig {
  const fromPreset = resolvePreset(options.preset);
  const fromFlags = flagsToConfig(options);

  const initial: PartialProjectConfig = { ...fromPreset, ...fromFlags };
  if (nameArgument !== undefined) {
    assertProjectName(nameArgument);
    initial.projectName = nameArgument;
  }
  initial.packageManager = initial.packageManager ?? detectPackageManager();
  return initial;
}

function resolvePreset(name: string | undefined): PartialProjectConfig {
  if (!name) return {};
  const preset = findPreset(name);
  if (!preset) {
    throw new ScafolderError('INVALID_CONFIG', `Unknown preset "${name}".`, {
      hint: `Available presets: ${presetNames().join(', ')}.`,
    });
  }
  return { ...preset.config };
}

/**
 * Flags are copied verbatim; invalid values are rejected later by the schema so
 * that every entry point reports the same error.
 */
function flagsToConfig(options: CreateCommandOptions): PartialProjectConfig {
  const config: PartialProjectConfig = {};
  const assign = <K extends keyof PartialProjectConfig>(
    key: K,
    value: PartialProjectConfig[K] | undefined,
  ): void => {
    if (value !== undefined) config[key] = value;
  };

  assign('framework', options.framework as PartialProjectConfig['framework']);
  assign('projectType', options.projectType as PartialProjectConfig['projectType']);
  assign('architecture', options.architecture as PartialProjectConfig['architecture']);
  assign('database', options.database as PartialProjectConfig['database']);
  assign('orm', options.orm as PartialProjectConfig['orm']);
  assign('authentication', options.auth as PartialProjectConfig['authentication']);
  assign('testing', options.testing as PartialProjectConfig['testing']);
  assign('packageManager', options.packageManager as PartialProjectConfig['packageManager']);
  assign('repositoryPattern', options.repository);
  assign('docker', options.docker);
  assign('aiDocumentation', options.aiDocs);
  return config;
}

/** Plain, pipe-friendly output for CI and `--yes` runs. */
function reportNonInteractiveResult(result: GenerationResult, deps: CreateCommandDeps): void {
  const relative = path.relative(deps.cwd, result.targetDir) || '.';
  if (result.dryRun) {
    deps.logger.info(`Dry run — ${result.writtenFiles.length} file(s) would be written:`);
    for (const file of result.writtenFiles) deps.logger.print(`${relative}/${file}`);
    return;
  }
  deps.logger.success(`Project created in ${relative}/`);
  for (const step of result.nextSteps) deps.logger.info(`  ${step}`);
}

function reportResult(result: GenerationResult, deps: CreateCommandDeps): void {
  const relative = path.relative(deps.cwd, result.targetDir) || '.';

  if (result.dryRun) {
    p.note(
      [
        ...result.steps.map((step) => `• ${step}`),
        '',
        `${result.writtenFiles.length} file(s) would be written to ${relative}/`,
      ].join('\n'),
      'Dry run — nothing was written',
    );
    p.outro('Re-run without --dry-run to generate the project.');
    return;
  }

  if (result.nextSteps.length > 0) {
    p.note(result.nextSteps.join('\n'), 'Next steps');
  }
  p.outro(`${pc.green('Done.')} Project created in ${pc.cyan(`${relative}/`)}`);
}
