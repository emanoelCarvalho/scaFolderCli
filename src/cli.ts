#!/usr/bin/env node
import { Command, CommanderError } from 'commander';
import pc from 'picocolors';
import { runCreateCommand, type CreateCommandOptions } from './commands/create.js';
import { runListCommand } from './commands/list.js';
import { registerBuiltInGenerators } from './generator/builtins.js';
import { presetNames } from './config/presets.js';
import {
  ARCHITECTURES,
  AUTHENTICATIONS,
  DATABASES,
  FRAMEWORKS,
  ORMS,
  PACKAGE_MANAGERS,
  PROJECT_TYPES,
  TEST_RUNNERS,
} from './config/schema.js';
import { isScafolderError, toScafolderError } from './util/errors.js';
import { ConsoleLogger } from './util/logger.js';
import { readPackageVersion } from './version.js';

const EXIT_ERROR = 1;
const EXIT_CANCELLED = 130;

function list(values: readonly string[]): string {
  return values.join('|');
}

export function buildProgram(logger: ConsoleLogger): Command {
  const program = new Command();

  // Never call process.exit() from inside commander: `main` owns the exit code
  // so the CLI stays testable and composable.
  program.exitOverride();

  program
    .name('scafoldercli')
    .description('Opinionated project scaffolder for Node.js and TypeScript.')
    .version(readPackageVersion(), '-v, --version')
    .option('--verbose', 'print the output of every command that runs')
    .option('--silent', 'suppress all output except errors')
    .hook('preAction', (thisCommand) => {
      const globals = thisCommand.opts<{ verbose?: boolean; silent?: boolean }>();
      if (globals.verbose) logger.setLevel('debug');
      if (globals.silent) logger.setLevel('error');
    });

  program
    .command('create', { isDefault: true })
    .description('Generate a new project')
    .argument('[name]', 'project name (npm-compatible, lowercase)')
    .option('-p, --preset <preset>', `start from a preset (${list(presetNames())})`)
    .option('-f, --framework <framework>', `framework (${list(FRAMEWORKS)})`)
    .option('--project-type <type>', `project type (${list(PROJECT_TYPES)})`)
    .option('--architecture <architecture>', `architecture (${list(ARCHITECTURES)})`)
    .option('--database <database>', `database (${list(DATABASES)})`)
    .option('--orm <orm>', `ORM (${list(ORMS)})`)
    .option('--auth <auth>', `authentication (${list(AUTHENTICATIONS)})`)
    .option('--testing <runner>', `test runner (${list(TEST_RUNNERS)})`)
    .option('--package-manager <manager>', `package manager (${list(PACKAGE_MANAGERS)})`)
    .option('--repository', 'use the repository pattern')
    .option('--no-repository', 'do not use the repository pattern')
    .option('--docker', 'generate Docker files')
    .option('--no-docker', 'skip Docker files')
    .option('--ai-docs', 'generate ARCHITECTURE.md, CONVENTIONS.md and AGENTS.md')
    .option('--no-ai-docs', 'skip AI documentation')
    .option('--install', 'install dependencies after generating (default)')
    .option('--no-install', 'skip dependency installation')
    .option('--git', 'initialize a git repository (default)')
    .option('--no-git', 'skip git initialization')
    .option('-d, --dir <path>', 'target directory (defaults to ./<name>)')
    .option('--dry-run', 'show what would be generated without writing anything')
    .option('--force', 'write into a non-empty directory')
    .option('-y, --yes', 'never prompt; use presets, flags and framework defaults')
    .action(async (name: string | undefined, options: CreateCommandOptions) => {
      await runCreateCommand(name, options, {
        logger,
        cwd: process.cwd(),
        interactive: process.stdin.isTTY === true && process.stdout.isTTY === true,
      });
    });

  program
    .command('list')
    .description('Show supported frameworks, presets and valid combinations')
    .action(() => runListCommand(logger));

  return program;
}

export async function main(argv: readonly string[] = process.argv): Promise<number> {
  const logger = new ConsoleLogger();
  registerBuiltInGenerators();

  try {
    await buildProgram(logger).parseAsync([...argv]);
    return 0;
  } catch (error) {
    // Commander already reported --help and --version through its own output.
    if (error instanceof CommanderError) {
      return error.exitCode === 0 ? 0 : EXIT_ERROR;
    }

    const failure = toScafolderError(error);
    if (failure.code === 'CANCELLED') {
      logger.info(pc.yellow('Cancelled.'));
      return EXIT_CANCELLED;
    }

    logger.error(failure.message);
    if (failure.hint) logger.info(pc.dim(`  ${failure.hint}`));
    if (!isScafolderError(error)) {
      logger.debug(error instanceof Error ? (error.stack ?? error.message) : String(error));
    }
    return EXIT_ERROR;
  }
}

process.exitCode = await main();
