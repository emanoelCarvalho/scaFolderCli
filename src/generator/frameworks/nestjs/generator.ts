import path from 'node:path';
import type { JsonObject } from '../../../fs/project-files.js';
import { sortObjectKeys } from '../../../fs/project-files.js';
import { commandExists } from '../../../process/exec.js';
import {
  ciInstallCommand,
  lockfileName,
  prodInstallCommand,
} from '../../../process/package-manager.js';
import { applyLayers, type Layer } from '../../../template/engine.js';
import { ScafolderError } from '../../../util/errors.js';
import { directoryNameFor } from '../../../util/project-name.js';
import type { GenerationContext } from '../../context.js';
import type { FrameworkGenerator } from '../../contract.js';
import { JEST_PACKAGES, resolveDependencies } from './dependencies.js';
import { describeNestjsProject } from './documentation.js';

/**
 * Pinned to a major version: a new major of the Nest CLI can change the
 * baseline this generator composes on top of, so upgrading is a deliberate act
 * validated by the golden-project test.
 */
const NEST_CLI = '@nestjs/cli@11';

/** Sample files `nest new` creates that our own structure replaces. */
const SCAFFOLD_FILES_TO_REMOVE = [
  'src/app.controller.ts',
  'src/app.service.ts',
  'src/app.controller.spec.ts',
  // The generated e2e suite is wired to Jest specifically; we own the test
  // setup, so it is removed rather than left half-configured.
  'test',
];

export const nestjsGenerator: FrameworkGenerator = {
  framework: 'nestjs',

  async validate(context) {
    const manager = context.config.packageManager;
    if (!(await commandExists(manager))) {
      throw new ScafolderError('UNSUPPORTED_ENVIRONMENT', `"${manager}" is not available.`, {
        hint: `Install ${manager}, or choose another one with --package-manager.`,
      });
    }
  },

  /**
   * Delegates the baseline to the Nest CLI rather than reimplementing it, so
   * generated projects match what the framework's own documentation describes.
   */
  async initialize(context) {
    const parent = path.dirname(context.targetDir);
    const folder = path.basename(context.targetDir);

    await context.run(
      'npx',
      [
        '--yes',
        NEST_CLI,
        'new',
        directoryNameFor(context.config.projectName),
        '--directory',
        folder,
        '--package-manager',
        context.config.packageManager,
        '--language',
        'TS',
        // scafoldercli installs and initialises git itself, after composing.
        '--skip-install',
        '--skip-git',
      ],
      { cwd: parent },
    );
  },

  async generate(context) {
    for (const file of SCAFFOLD_FILES_TO_REMOVE) {
      context.files.delete(file);
    }

    await applyLayers(context.files, buildLayers(context), buildScope(context));
    await patchPackageJson(context);
    await patchTsConfig(context);
    await patchBuildTsConfig(context);
    await patchPrettierConfig(context);
  },

  documentation(context) {
    return describeNestjsProject(context);
  },

  /**
   * Runs after dependencies are installed: the Prisma client is generated from
   * the schema, so it cannot exist before `node_modules` does.
   */
  async finalize(context) {
    if (context.config.orm !== 'prisma' || !context.request.install) return;
    context.logger.debug('Generating the Prisma client');
    await context.run('npx', ['--yes', 'prisma', 'generate']);
  },

  describePlan(context) {
    const steps = [
      `Scaffold a NestJS project with ${NEST_CLI}`,
      'Compose the modular API structure',
    ];
    if (context.config.orm === 'prisma') steps.push('Add Prisma schema, service and scripts');
    if (context.config.authentication === 'jwt') {
      steps.push('Add JWT authentication with rotating, revocable refresh tokens');
    }
    if (context.config.repositoryPattern) steps.push('Add repository interfaces and bindings');
    if (context.config.testing !== 'none') steps.push(`Configure ${context.config.testing}`);
    if (context.config.docker) steps.push('Add Dockerfile, compose file and .dockerignore');
    return steps;
  },

  nextSteps(context) {
    const pm = context.config.packageManager;
    const folder = path.basename(context.targetDir);
    const steps = [`cd ${folder}`, 'cp .env.example .env'];

    if (context.config.authentication === 'jwt') {
      steps.push('Set JWT_ACCESS_SECRET in .env  (openssl rand -base64 48)');
    }
    if (context.config.docker && context.config.database !== 'none') {
      steps.push(`docker compose up -d ${context.config.database}`);
    }
    if (context.config.orm === 'prisma') {
      steps.push(`${pm} run db:migrate`);
    }
    steps.push(`${pm} run start:dev`);
    return steps;
  },
};

function buildLayers(context: GenerationContext): Layer[] {
  const { config, data } = context;
  return [
    { dir: 'base' },
    { dir: 'frameworks/nestjs/base' },
    { dir: 'frameworks/nestjs/prisma', when: data.isPrisma },
    { dir: 'frameworks/nestjs/auth', when: data.hasAuth },
    { dir: 'frameworks/nestjs/auth-repository', when: data.hasAuth && data.hasRepository },
    { dir: 'frameworks/nestjs/testing/vitest', when: config.testing === 'vitest' },
    { dir: 'frameworks/nestjs/specs/base', when: data.hasTests },
    { dir: 'frameworks/nestjs/specs/auth', when: data.hasTests && data.hasAuth },
    { dir: 'docker/node', when: config.docker },
  ];
}

/** Template data plus the values only this generator can supply. */
function buildScope(context: GenerationContext): object {
  const manager = context.config.packageManager;
  return {
    ...context.data,
    lockfile: lockfileName(manager),
    ciInstall: ciInstallCommand(manager),
    prodInstall: prodInstallCommand(manager),
    buildCommand: `${manager} run build`,
  };
}

/**
 * `nest new` writes a package.json for a Jest project called after the folder.
 * This rewrites it to match the chosen configuration, adding dependencies and
 * removing the ones for a test runner the user did not pick.
 */
async function patchPackageJson(context: GenerationContext): Promise<void> {
  // A dry run skips `initialize`, so there is no manifest from the Nest CLI to
  // patch. Planning against an empty one still shows what would be written.
  const manifest =
    (await context.files.readJson('package.json')) ??
    (context.request.dryRun
      ? {}
      : (() => {
          throw new ScafolderError('INTERNAL', 'The Nest CLI did not produce a package.json.');
        })());

  const { dependencies, devDependencies } = resolveDependencies(context.config);
  const scripts = { ...((manifest['scripts'] as JsonObject | undefined) ?? {}) };

  manifest['name'] = context.config.projectName;
  manifest['description'] = `${context.config.projectName} — generated with scafoldercli`;
  manifest['license'] = 'UNLICENSED';
  manifest['engines'] = { node: `>=${context.data.nodeVersion}` };

  manifest['dependencies'] = sortObjectKeys({
    ...((manifest['dependencies'] as JsonObject | undefined) ?? {}),
    ...dependencies,
  });

  const dev: JsonObject = {
    ...((manifest['devDependencies'] as JsonObject | undefined) ?? {}),
    ...devDependencies,
  };

  if (context.config.testing !== 'jest') {
    for (const name of JEST_PACKAGES) delete dev[name];
    // Nest keeps its Jest configuration inline; leaving it behind would
    // configure a runner the project no longer has.
    delete manifest['jest'];
    delete scripts['test:debug'];
    delete scripts['test:e2e'];
  }

  manifest['devDependencies'] = sortObjectKeys(dev);
  manifest['scripts'] = sortObjectKeys({ ...scripts, ...buildScripts(context) });

  context.files.writeJson('package.json', manifest);
}

function buildScripts(context: GenerationContext): JsonObject {
  const { config } = context;
  const scripts: JsonObject = {};

  if (config.testing === 'vitest') {
    scripts['test'] = 'vitest run';
    scripts['test:watch'] = 'vitest';
    scripts['test:cov'] = 'vitest run --coverage';
  } else if (config.testing === 'none') {
    scripts['test'] = 'echo "No test runner configured" && exit 1';
  }

  if (config.orm === 'prisma') {
    scripts['db:migrate'] = 'prisma migrate dev';
    scripts['db:deploy'] = 'prisma migrate deploy';
    scripts['db:generate'] = 'prisma generate';
    scripts['db:studio'] = 'prisma studio';
  }

  return scripts;
}

/**
 * The Nest CLI ships a deliberately permissive tsconfig. A scaffolder's
 * defaults become the project's defaults, so strictness is turned on now, while
 * the codebase is empty and it costs nothing.
 */
async function patchTsConfig(context: GenerationContext): Promise<void> {
  const compilerOptions: JsonObject = {
    strict: true,
    noImplicitAny: true,
    strictNullChecks: true,
    strictBindCallApply: true,
    noFallthroughCasesInSwitch: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    forceConsistentCasingInFileNames: true,
  };

  if (context.config.testing === 'vitest') {
    // Vitest exposes describe/it/expect as globals; without their types every
    // assertion is `any`, and the type-aware lint rules reject the whole suite.
    compilerOptions['types'] = ['node', 'vitest/globals'];
  }

  await context.files.mergeJson('tsconfig.json', { compilerOptions });
}

/**
 * Restricts the production build to `src`.
 *
 * The Nest CLI's build config has no `include`, so root-level TypeScript such as
 * `prisma.config.ts` and `vitest.config.mts` widens the inferred root directory
 * and the entry point lands at `dist/src/main.js`. That silently breaks
 * `start:prod` and the Dockerfile's CMD, so the boundary is made explicit.
 */
async function patchBuildTsConfig(context: GenerationContext): Promise<void> {
  await context.files.mergeJson('tsconfig.build.json', {
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist', '**/*.spec.ts'],
  });
}

/** Keeps generated sources and the project's formatter in agreement. */
async function patchPrettierConfig(context: GenerationContext): Promise<void> {
  await context.files.mergeJson('.prettierrc', {
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 100,
  });
}
