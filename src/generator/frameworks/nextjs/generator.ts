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
import { describeNextjsProject } from './documentation.js';

/**
 * Pinned to a major version: a new major of create-next-app can change the
 * baseline this generator composes on top of, so upgrading is a deliberate act
 * validated by the golden-project test.
 */
const CREATE_NEXT_APP = 'create-next-app@16';

/** Sample content create-next-app writes that our own pages replace. */
const SCAFFOLD_FILES_TO_REMOVE = [
  'src/app/page.module.css',
  'public/next.svg',
  'public/vercel.svg',
  'public/file.svg',
  'public/globe.svg',
  'public/window.svg',
];

export const nextjsGenerator: FrameworkGenerator = {
  framework: 'nextjs',
  // Next.js loads `.env.local` and gitignores it; `.env` is for committed defaults.
  localEnvFile: '.env.local',

  async validate(context) {
    const manager = context.config.packageManager;
    if (!(await commandExists(manager))) {
      throw new ScafolderError('UNSUPPORTED_ENVIRONMENT', `"${manager}" is not available.`, {
        hint: `Install ${manager}, or choose another one with --package-manager.`,
      });
    }
  },

  /**
   * Delegates the baseline to create-next-app rather than reimplementing it, so
   * generated projects match what the framework's own documentation describes.
   */
  async initialize(context) {
    const parent = path.dirname(context.targetDir);
    const folder = path.basename(context.targetDir);

    await context.run(
      'npx',
      [
        '--yes',
        CREATE_NEXT_APP,
        folder,
        '--ts',
        '--app',
        '--eslint',
        '--tailwind',
        '--src-dir',
        `--use-${context.config.packageManager}`,
        // scafoldercli installs and initialises git itself, after composing.
        '--skip-install',
        '--disable-git',
        '--yes',
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
    writePrettierConfig(context);
  },

  documentation(context) {
    return describeNextjsProject(context);
  },

  describePlan(context) {
    const steps = [
      `Scaffold a Next.js project with ${CREATE_NEXT_APP}`,
      'Add validated server-only configuration and an API client',
      'Add the base component set: button, fields, modal, toast, states',
    ];
    if (context.config.authentication === 'jwt') {
      steps.push('Add cookie-based authentication through route handlers (BFF)');
    }
    if (context.config.testing !== 'none') steps.push(`Configure ${context.config.testing}`);
    if (context.config.docker) steps.push('Add Dockerfile, compose file and .dockerignore');
    return steps;
  },

  nextSteps(context) {
    const pm = context.config.packageManager;
    return [
      `cd ${path.basename(context.targetDir)}`,
      'cp .env.example .env.local',
      'Set API_URL to the API this client should call',
      `${pm} run dev`,
    ];
  },
};

function buildLayers(context: GenerationContext): Layer[] {
  const { config, data } = context;
  return [
    { dir: 'base' },
    { dir: 'frameworks/nextjs/base' },
    { dir: 'frameworks/nextjs/auth', when: data.hasAuth },
    { dir: 'frameworks/nextjs/testing/vitest', when: config.testing === 'vitest' },
    { dir: 'frameworks/nextjs/specs/base', when: data.hasTests },
    { dir: 'frameworks/nextjs/specs/auth', when: data.hasTests && data.hasAuth },
    { dir: 'docker/nextjs', when: config.docker },
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
 * `create-next-app` writes a package.json with four scripts and no test setup.
 * This adds what scafoldercli composed on top, without disturbing the versions
 * the framework chose for itself.
 */
async function patchPackageJson(context: GenerationContext): Promise<void> {
  // A dry run skips `initialize`, so there is no manifest from create-next-app
  // to patch. Planning against an empty one still shows what would be written.
  const manifest =
    (await context.files.readJson('package.json')) ??
    (context.request.dryRun
      ? {}
      : (() => {
          throw new ScafolderError('INTERNAL', 'create-next-app did not produce a package.json.');
        })());

  const { dependencies, devDependencies } = resolveDependencies(context.config);

  manifest['name'] = context.config.projectName;
  manifest['description'] = `${context.config.projectName} — generated with scafoldercli`;
  manifest['private'] = true;
  manifest['engines'] = { node: `>=${context.data.nodeVersion}` };

  manifest['dependencies'] = sortObjectKeys({
    ...((manifest['dependencies'] as JsonObject | undefined) ?? {}),
    ...dependencies,
  });
  manifest['devDependencies'] = sortObjectKeys({
    ...((manifest['devDependencies'] as JsonObject | undefined) ?? {}),
    ...devDependencies,
  });
  manifest['scripts'] = sortObjectKeys({
    ...((manifest['scripts'] as JsonObject | undefined) ?? {}),
    ...buildScripts(context),
  });

  context.files.writeJson('package.json', manifest);
}

function buildScripts(context: GenerationContext): JsonObject {
  const scripts: JsonObject = {
    // The client runs alongside an API on 3000, so it takes the next port.
    dev: `next dev --port ${context.data.port}`,
    start: `next start --port ${context.data.port}`,
    typecheck: 'tsc --noEmit',
    format: 'prettier --write .',
    'format:check': 'prettier --check .',
  };

  if (context.config.testing === 'vitest') {
    scripts['test'] = 'vitest run';
    scripts['test:watch'] = 'vitest';
    scripts['test:cov'] = 'vitest run --coverage';
  } else {
    scripts['test'] = 'echo "No test runner configured" && exit 1';
  }

  return scripts;
}

/**
 * create-next-app's tsconfig is already strict. What it lacks are the checks
 * that catch real bugs in a codebase that will grow, turned on now while the
 * project is empty and it costs nothing.
 */
async function patchTsConfig(context: GenerationContext): Promise<void> {
  const compilerOptions: JsonObject = {
    noUncheckedIndexedAccess: true,
    noImplicitOverride: true,
    noFallthroughCasesInSwitch: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
  };

  if (context.config.testing === 'vitest') {
    // Vitest exposes describe/it/expect as globals. They are not an `@types`
    // package, so they have to be listed; `node` is listed alongside because
    // naming `types` at all turns off automatic inclusion.
    compilerOptions['types'] = ['node', 'vitest/globals'];
  }

  await context.files.mergeJson('tsconfig.json', { compilerOptions });
}

/** Keeps generated sources and the project's formatter in agreement. */
function writePrettierConfig(context: GenerationContext): void {
  context.files.writeJson('.prettierrc', {
    semi: true,
    singleQuote: true,
    printWidth: 100,
    trailingComma: 'all',
    endOfLine: 'lf',
  });
}
