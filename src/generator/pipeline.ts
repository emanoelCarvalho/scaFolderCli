import path from 'node:path';
import { assertCompatible } from '../config/capabilities.js';
import {
  parseProjectConfig,
  type GenerationRequest,
  type ProjectConfig,
} from '../config/schema.js';
import { writeAiDocumentation } from '../docs/ai-docs.js';
import { writeLocalEnvFile } from './env-file.js';
import { restoreFrameworkFiles, snapshotFrameworkFiles } from './framework-files.js';
import { isDirectoryEmpty, ensureDir, pathExists, removeDir } from '../fs/files.js';
import { ProjectFiles } from '../fs/project-files.js';
import { runCommand } from '../process/exec.js';
import { createPackageManager } from '../process/package-manager.js';
import { buildTemplateData } from '../template/data.js';
import { ScafolderError } from '../util/errors.js';
import { SILENT_LOGGER, type Logger } from '../util/logger.js';
import type { GenerationContext } from './context.js';
import { getGenerator } from './registry.js';

export interface GenerationResult {
  config: ProjectConfig;
  targetDir: string;
  dryRun: boolean;
  /** Paths written by scafoldercli, relative to the project root. */
  writtenFiles: string[];
  /** The same files with their contents, so a run can be inspected in memory. */
  renderedFiles: ReadonlyMap<string, string>;
  /** Ordered, human-readable description of what ran (or would run). */
  steps: string[];
  nextSteps: string[];
}

export interface GenerateProjectDeps {
  logger?: Logger;
}

/**
 * The single entry point for generation. The CLI is a thin shell around this
 * function so the same behaviour is reachable programmatically and from tests.
 */
export async function generateProject(
  request: GenerationRequest,
  deps: GenerateProjectDeps = {},
): Promise<GenerationResult> {
  const logger = deps.logger ?? SILENT_LOGGER;
  const config = parseProjectConfig(request.config);
  assertCompatible(config);

  const generator = getGenerator(config.framework);
  const targetDir = path.resolve(request.targetDir);
  await assertTargetUsable(targetDir, request.force);

  const files = new ProjectFiles(targetDir, { dryRun: request.dryRun });
  const context: GenerationContext = {
    config,
    request: { ...request, config, targetDir },
    targetDir,
    files,
    data: buildTemplateData(config),
    logger,
    packageManager: createPackageManager(config.packageManager, { cwd: targetDir }),
    run: (command, args, options) =>
      runCommand(command, args, { cwd: targetDir, ...options, onOutput: logOutput(logger) }),
  };

  await generator.validate(context);

  const steps: string[] = [];
  const rootExistedBefore = await pathExists(targetDir);

  try {
    if (!request.dryRun) {
      await ensureDir(targetDir);
      logger.debug(`Scaffolding with the ${config.framework} generator`);
      await generator.initialize(context);
    }
    steps.push(...(generator.describePlan?.(context) ?? []));

    // Recorded before our layers run, so files the framework CLI owns can be
    // extended rather than overwritten.
    const frameworkFiles = await snapshotFrameworkFiles(files);

    await generator.generate(context);

    // A generated project must be runnable straight away, which means the
    // environment file has to exist before any post-install tooling reads it.
    const envFile = generator.localEnvFile ?? '.env';
    const envExample = await files.read('.env.example');
    if (envExample !== null && !(await files.exists(envFile))) {
      writeLocalEnvFile(files, envExample, envFile);
      steps.push(`Write a local ${envFile} with generated secrets`);
    }

    if (config.aiDocumentation) {
      await writeAiDocumentation(context, generator.documentation(context));
      steps.push('Write ARCHITECTURE.md, CONVENTIONS.md and AGENTS.md');
    }

    await restoreFrameworkFiles(files, frameworkFiles);

    const writtenFiles = files.plannedWrites();
    const renderedFiles = files.plannedContents();
    await files.flush();

    if (request.dryRun) {
      return { config, targetDir, dryRun: true, writtenFiles, renderedFiles, steps, nextSteps: [] };
    }

    if (request.install) {
      logger.debug(`Installing dependencies with ${config.packageManager}`);
      await context.packageManager.install();
      steps.push(`Install dependencies (${config.packageManager})`);
    }

    await generator.finalize?.(context);

    if (request.git) {
      await initGitRepository(context);
      steps.push('Initialize a git repository');
    }

    return {
      config,
      targetDir,
      dryRun: false,
      writtenFiles,
      renderedFiles,
      steps,
      nextSteps: generator.nextSteps?.(context) ?? [],
    };
  } catch (error) {
    // Only clean up directories this run created, never a pre-existing one.
    if (!request.dryRun && !rootExistedBefore) {
      await removeDir(targetDir).catch(() => undefined);
    }
    throw error;
  }
}

async function assertTargetUsable(targetDir: string, force: boolean): Promise<void> {
  if (force) return;
  if (await isDirectoryEmpty(targetDir)) return;
  throw new ScafolderError('TARGET_NOT_EMPTY', `Directory "${targetDir}" is not empty.`, {
    hint: 'Choose another name, remove the directory, or pass --force to write into it anyway.',
  });
}

/**
 * Creates the repository but never commits: the first commit is the user's
 * decision, not ours.
 */
async function initGitRepository(context: GenerationContext): Promise<void> {
  try {
    await context.run('git', ['init', '--initial-branch=main']);
  } catch {
    context.logger.warn('Could not initialize a git repository; continuing without it.');
  }
}

function logOutput(logger: Logger): (chunk: string) => void {
  return (chunk) => {
    for (const line of chunk.split('\n')) {
      if (line.trim().length > 0) logger.debug(line.trimEnd());
    }
  };
}
