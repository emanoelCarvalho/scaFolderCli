import path from 'node:path';
import type { JsonObject } from '../../../fs/project-files.js';
import { sortObjectKeys } from '../../../fs/project-files.js';
import {
  ciInstallCommand,
  lockfileName,
  prodInstallCommand,
} from '../../../process/package-manager.js';
import { applyLayers, type Layer } from '../../../template/engine.js';
import { ScafolderError } from '../../../util/errors.js';
import type { GenerationContext } from '../../context.js';
import type { FrameworkGenerator } from '../../contract.js';
import { SV_ADDONS, resolveDependencies } from './dependencies.js';
import { describeSvelteProject } from './documentation.js';

/**
 * Pinned to a minor version: `sv` is pre-1.0, so its templates and add-on
 * options can change between releases. Upgrading is a deliberate act validated
 * by the golden-project test.
 */
const SV_CLI = 'sv@0.17';

/** Sample content `sv create` writes that our own routes and lib replace. */
const SCAFFOLD_FILES_TO_REMOVE = [
  'src/lib/index.ts',
  // The example suite ships with the vitest add-on and tests nothing of ours.
  'src/lib/vitest-examples',
];

export const svelteGenerator: FrameworkGenerator = {
  framework: 'svelte',
  // `sv` formats with tabs, and its Prettier config checks package.json too.
  jsonIndent: '\t',

  /**
   * Delegates the baseline to `sv create` rather than reimplementing it, so
   * generated projects match what the framework's own documentation describes.
   * Its official add-ons cover prettier, eslint, vitest, Tailwind and the Node
   * adapter, which is why this generator adds almost no tooling of its own.
   */
  async initialize(context) {
    const parent = path.dirname(context.targetDir);
    const folder = path.basename(context.targetDir);

    await context.run(
      'npx',
      [
        '--yes',
        SV_CLI,
        'create',
        folder,
        '--template',
        'minimal',
        '--types',
        'ts',
        // scafoldercli installs and initialises git itself, after composing.
        '--no-install',
        // The pipeline has already created the directory.
        '--no-dir-check',
        '--no-download-check',
        '--add',
        ...SV_ADDONS,
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
  },

  documentation(context) {
    return describeSvelteProject(context);
  },

  describePlan(context) {
    const steps = [
      `Scaffold a SvelteKit project with ${SV_CLI}`,
      'Add validated server-only configuration and an API client',
      'Add the base component set: button, fields, modal, toast, states',
    ];
    if (context.config.authentication === 'jwt') {
      steps.push('Add cookie-based authentication through server actions');
    }
    if (context.config.testing !== 'none') steps.push(`Configure ${context.config.testing}`);
    if (context.config.docker) steps.push('Add Dockerfile, compose file and .dockerignore');
    return steps;
  },

  nextSteps(context) {
    const pm = context.config.packageManager;
    return [
      `cd ${path.basename(context.targetDir)}`,
      'cp .env.example .env',
      'Set API_URL to the API this client should call',
      `${pm} run dev`,
    ];
  },
};

function buildLayers(context: GenerationContext): Layer[] {
  const { config, data } = context;
  return [
    { dir: 'base' },
    { dir: 'frameworks/svelte/base' },
    { dir: 'frameworks/svelte/auth', when: data.hasAuth },
    { dir: 'frameworks/svelte/specs/auth', when: data.hasTests && data.hasAuth },
    { dir: 'docker/svelte', when: config.docker },
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
 * `sv create` writes a package.json whose scripts assume the default port and
 * split linting from formatting differently from our other generators. This
 * aligns them without disturbing the versions the framework chose.
 */
async function patchPackageJson(context: GenerationContext): Promise<void> {
  // A dry run skips `initialize`, so there is no manifest from `sv` to patch.
  // Planning against an empty one still shows what would be written.
  const manifest =
    (await context.files.readJson('package.json')) ??
    (context.request.dryRun
      ? {}
      : (() => {
          throw new ScafolderError('INTERNAL', '`sv create` did not produce a package.json.');
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
    dev: `vite dev --port ${context.data.port}`,
    preview: `vite preview --port ${context.data.port}`,
    // The Node adapter takes its port from the environment, with no flag to
    // pass. `--env-file-if-exists` is Node's own dotenv, so `.env` supplies
    // PORT and ORIGIN locally, and a container that has no .env still starts
    // from the environment it was given.
    start: 'node --env-file-if-exists=.env build',
    // `sv` bundles the format check into `lint`; splitting them matches the
    // other generators and makes a CI failure say which one broke.
    lint: 'eslint .',
    format: 'prettier --write .',
    'format:check': 'prettier --check .',
    // `--fail-on-warnings` on purpose: svelte-check's warnings cover
    // accessibility and reactivity mistakes that are bugs, not style. A
    // generated project starts clean, and this is what keeps it clean.
    typecheck: 'svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --fail-on-warnings',
  };

  if (context.config.testing === 'vitest') {
    scripts['test'] = 'vitest run';
    scripts['test:watch'] = 'vitest';
  } else {
    scripts['test'] = 'echo "No test runner configured" && exit 1';
  }

  return scripts;
}
