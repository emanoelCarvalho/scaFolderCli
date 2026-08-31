import type { JsonObject } from '../../../fs/project-files.js';
import type { ProjectConfig } from '../../../config/schema.js';

/**
 * The single place package versions live for generated Next.js projects.
 *
 * `create-next-app` already supplies Next, React, TypeScript, ESLint and
 * Tailwind; this table covers only what scafoldercli adds on top. Caret ranges,
 * not exact pins: generated projects should receive patch and minor fixes.
 */
export const VERSIONS = {
  zod: '^4.5.4',
  'server-only': '^0.0.1',

  prettier: '^3.9.6',

  vitest: '^4.1.11',
  '@vitest/coverage-v8': '^4.1.11',
  '@vitejs/plugin-react': '^6.1.1',
  '@testing-library/react': '^16.3.3',
  '@testing-library/user-event': '^14.6.6',
  '@testing-library/jest-dom': '^7.0.1',
  jsdom: '^30.0.1',
} as const satisfies Record<string, string>;

type PackageName = keyof typeof VERSIONS;

function pick(...names: PackageName[]): JsonObject {
  return Object.fromEntries(names.map((name) => [name, VERSIONS[name]]));
}

export interface DependencySet {
  dependencies: JsonObject;
  devDependencies: JsonObject;
}

export function resolveDependencies(config: ProjectConfig): DependencySet {
  // `server-only` is a build-time guard: importing a module marked with it from
  // a client component fails the build instead of shipping a secret.
  const dependencies: JsonObject = pick('zod', 'server-only');
  const devDependencies: JsonObject = pick('prettier');

  if (config.testing === 'vitest') {
    Object.assign(
      devDependencies,
      pick(
        'vitest',
        '@vitest/coverage-v8',
        '@vitejs/plugin-react',
        '@testing-library/react',
        '@testing-library/user-event',
        '@testing-library/jest-dom',
        'jsdom',
      ),
    );
  }

  return { dependencies, devDependencies };
}
