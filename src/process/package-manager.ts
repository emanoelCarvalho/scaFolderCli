import type { PackageManager } from '../config/schema.js';
import { runCommand, type RunCommandOptions, type CommandResult } from './exec.js';

export interface PackageManagerAdapter {
  readonly name: PackageManager;
  readonly lockfile: string;
  /** Installs everything declared in package.json. */
  install(options?: RunCommandOptions): Promise<CommandResult>;
  /** Runs a package.json script. */
  run(
    script: string,
    args?: readonly string[],
    options?: RunCommandOptions,
  ): Promise<CommandResult>;
  /** Executes a package binary without adding it as a dependency. */
  dlx(pkg: string, args: readonly string[], options?: RunCommandOptions): Promise<CommandResult>;
  /** Command a human (or a Dockerfile) would type, for docs and templates. */
  describe(action: 'install' | 'ci' | 'run'): string;
}

interface Spec {
  bin: string;
  lockfile: string;
  install: readonly string[];
  /** Reproducible install from the lockfile, used inside Docker builds. */
  ci: readonly string[];
  run: (script: string) => readonly string[];
  dlx: (pkg: string) => readonly string[];
}

const SPECS: Record<PackageManager, Spec> = {
  npm: {
    bin: 'npm',
    lockfile: 'package-lock.json',
    install: ['install'],
    ci: ['ci'],
    run: (script) => ['run', script],
    dlx: (pkg) => ['--yes', pkg],
  },
  pnpm: {
    bin: 'pnpm',
    lockfile: 'pnpm-lock.yaml',
    install: ['install'],
    ci: ['install', '--frozen-lockfile'],
    run: (script) => ['run', script],
    dlx: (pkg) => ['dlx', pkg],
  },
  yarn: {
    bin: 'yarn',
    lockfile: 'yarn.lock',
    install: ['install'],
    ci: ['install', '--immutable'],
    run: (script) => ['run', script],
    dlx: (pkg) => ['dlx', pkg],
  },
};

/** npm executes one-off binaries through `npx`, the others through their own bin. */
function dlxBin(name: PackageManager): string {
  return name === 'npm' ? 'npx' : SPECS[name].bin;
}

export function createPackageManager(
  name: PackageManager,
  defaults: RunCommandOptions = {},
): PackageManagerAdapter {
  const spec = SPECS[name];
  const merge = (options?: RunCommandOptions): RunCommandOptions => ({ ...defaults, ...options });

  return {
    name,
    lockfile: spec.lockfile,
    install: (options) => runCommand(spec.bin, spec.install, merge(options)),
    run: (script, args = [], options) =>
      runCommand(spec.bin, [...spec.run(script), ...args], merge(options)),
    dlx: (pkg, args, options) =>
      runCommand(dlxBin(name), [...spec.dlx(pkg), ...args], merge(options)),
    describe: (action) => {
      const args =
        action === 'install' ? spec.install : action === 'ci' ? spec.ci : spec.run('<script>');
      return [spec.bin, ...args].join(' ');
    },
  };
}

/** Command list used by generated Dockerfiles for a reproducible install. */
export function ciInstallCommand(name: PackageManager): string {
  return [SPECS[name].bin, ...SPECS[name].ci].join(' ');
}

/** Detects the package manager that invoked the CLI, for a sensible default. */
export function detectPackageManager(
  userAgent = process.env['npm_config_user_agent'],
): PackageManager {
  if (!userAgent) return 'npm';
  if (userAgent.startsWith('pnpm')) return 'pnpm';
  if (userAgent.startsWith('yarn')) return 'yarn';
  return 'npm';
}
