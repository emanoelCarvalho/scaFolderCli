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
import type { GenerationContext } from '../../context.js';
import type { FrameworkGenerator } from '../../contract.js';
import { resolveDependencies } from './dependencies.js';
import { describeExpressProject } from './documentation.js';

export const expressGenerator: FrameworkGenerator = {
  framework: 'express',

  async validate(context) {
    const manager = context.config.packageManager;
    if (!(await commandExists(manager))) {
      throw new ScafolderError('UNSUPPORTED_ENVIRONMENT', `"${manager}" is not available.`, {
        hint: `Install ${manager}, or choose another one with --package-manager.`,
      });
    }
  },

  /**
   * Express ships no official scaffolder and has no opinion about project
   * layout, so there is nothing to delegate to: every file comes from our
   * layers. That is the difference from the NestJS generator, not an omission.
   */
  async initialize() {
    await Promise.resolve();
  },

  async generate(context) {
    await applyLayers(context.files, buildLayers(context), buildScope(context));
    writePackageJson(context);
  },

  documentation(context) {
    return describeExpressProject(context);
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
    const steps = ['Compose a modular Express API in TypeScript (ESM)'];
    if (context.config.orm === 'prisma') steps.push('Add Prisma schema, client and scripts');
    if (context.config.authentication === 'jwt') {
      steps.push('Add JWT authentication with rotating, revocable refresh tokens');
    }
    if (context.config.repositoryPattern) steps.push('Add repository interfaces');
    if (context.config.testing !== 'none') steps.push(`Configure ${context.config.testing}`);
    if (context.config.docker) steps.push('Add Dockerfile, compose file and .dockerignore');
    return steps;
  },

  nextSteps(context) {
    const pm = context.config.packageManager;
    const steps = [`cd ${path.basename(context.targetDir)}`];

    if (context.config.docker && context.config.database !== 'none') {
      steps.push(`docker compose up -d ${context.config.database}`);
    }
    if (context.config.orm === 'prisma') steps.push(`${pm} run db:migrate`);
    steps.push(`${pm} run dev`);
    return steps;
  },
};

function buildLayers(context: GenerationContext): Layer[] {
  const { config, data } = context;
  return [
    { dir: 'base' },
    { dir: 'frameworks/express/base' },
    { dir: 'frameworks/express/prisma', when: data.isPrisma },
    { dir: 'frameworks/express/auth', when: data.hasAuth },
    { dir: 'frameworks/express/auth-repository', when: data.hasAuth && data.hasRepository },
    { dir: 'frameworks/express/testing/vitest', when: config.testing === 'vitest' },
    { dir: 'frameworks/express/specs/base', when: data.hasTests },
    { dir: 'frameworks/express/specs/auth', when: data.hasTests && data.hasAuth },
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
 * Written in code rather than as a template: dependency resolution already
 * lives in `dependencies.ts`, and generating the manifest from the same data
 * keeps the two from drifting apart.
 */
function writePackageJson(context: GenerationContext): void {
  const { dependencies, devDependencies } = resolveDependencies(context.config);

  context.files.writeJson('package.json', {
    name: context.config.projectName,
    version: '0.1.0',
    description: `${context.config.projectName} — generated with scafoldercli`,
    private: true,
    license: 'UNLICENSED',
    // ESM: Node's module system, and what `module: nodenext` compiles to.
    type: 'module',
    engines: { node: `>=${context.data.nodeVersion}` },
    main: 'dist/main.js',
    scripts: sortObjectKeys(buildScripts(context)),
    dependencies: sortObjectKeys(dependencies),
    devDependencies: sortObjectKeys(devDependencies),
  });
}

function buildScripts(context: GenerationContext): JsonObject {
  const { config } = context;
  const scripts: JsonObject = {
    // `--env-file-if-exists` is Node's own dotenv, so the project reads .env in
    // development without a runtime dependency, and starts fine in a container
    // where no .env exists and configuration comes from the environment.
    dev: 'tsx watch --env-file-if-exists=.env src/main.ts',
    build: 'tsc -p tsconfig.build.json',
    start: 'node --env-file-if-exists=.env dist/main.js',
    typecheck: 'tsc -p tsconfig.json --noEmit',
    lint: 'eslint .',
    'lint:fix': 'eslint . --fix',
    format: 'prettier --write .',
    'format:check': 'prettier --check .',
  };

  if (config.testing === 'vitest') {
    scripts['test'] = 'vitest run';
    scripts['test:watch'] = 'vitest';
    scripts['test:cov'] = 'vitest run --coverage';
  } else {
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
