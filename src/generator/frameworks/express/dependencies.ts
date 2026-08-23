import type { ProjectConfig } from '../../../config/schema.js';
import type { JsonObject } from '../../../fs/project-files.js';

/**
 * The single place package versions live for generated Express projects.
 *
 * Express ships no scaffolder, so unlike NestJS every dependency here is one
 * scafoldercli chose. Caret ranges, not exact pins: generated projects should
 * receive patch and minor fixes. Majors are upgraded here deliberately, with a
 * golden-project run.
 */
export const VERSIONS = {
  express: '^5.2.1',
  helmet: '^8.3.0',
  cors: '^2.8.6',
  pino: '^10.3.1',
  'pino-http': '^11.0.0',
  zod: '^4.4.3',

  jose: '^6.2.10',
  '@node-rs/argon2': '^2.1.0',
  'express-rate-limit': '^8.6.2',

  '@prisma/client': '^7.9.1',
  '@prisma/adapter-pg': '^7.9.1',
  prisma: '^7.9.1',
  dotenv: '^17.4.2',

  typescript: '^5.9.3',
  tsx: '^4.23.12',
  '@types/node': '^24.10.1',
  '@types/express': '^5.0.6',
  '@types/cors': '^2.8.19',

  eslint: '^9.39.1',
  '@eslint/js': '^9.39.1',
  'typescript-eslint': '^8.67.0',
  'eslint-config-prettier': '^10.1.8',
  prettier: '^3.9.6',
  globals: '^16.5.0',

  vitest: '^4.1.11',
  '@vitest/coverage-v8': '^4.1.11',
  supertest: '^7.2.2',
  '@types/supertest': '^7.2.1',
} as const satisfies Record<string, string>;

type PackageName = keyof typeof VERSIONS;

function pick(...names: PackageName[]): JsonObject {
  return Object.fromEntries(names.map((name) => [name, VERSIONS[name]]));
}

export interface DependencySet {
  dependencies: JsonObject;
  devDependencies: JsonObject;
}

/**
 * Prisma 7 talks to the database through a driver adapter chosen per engine, so
 * the runtime dependency follows the database, not the ORM.
 */
const PRISMA_ADAPTERS: Partial<Record<ProjectConfig['database'], PackageName>> = {
  postgresql: '@prisma/adapter-pg',
};

export function resolveDependencies(config: ProjectConfig): DependencySet {
  const dependencies: JsonObject = pick('express', 'helmet', 'cors', 'pino', 'pino-http', 'zod');
  const devDependencies: JsonObject = pick(
    'typescript',
    'tsx',
    '@types/node',
    '@types/express',
    '@types/cors',
    'eslint',
    '@eslint/js',
    'typescript-eslint',
    'eslint-config-prettier',
    'prettier',
    'globals',
  );

  if (config.orm === 'prisma') {
    Object.assign(dependencies, pick('@prisma/client'));
    Object.assign(devDependencies, pick('prisma', 'dotenv'));

    const adapter = PRISMA_ADAPTERS[config.database];
    if (adapter) Object.assign(dependencies, pick(adapter));
  }

  if (config.authentication === 'jwt') {
    // Rate limiting is only pulled in when there are credentials worth brute-forcing.
    Object.assign(dependencies, pick('jose', '@node-rs/argon2', 'express-rate-limit'));
  }

  if (config.testing === 'vitest') {
    Object.assign(
      devDependencies,
      pick('vitest', '@vitest/coverage-v8', 'supertest', '@types/supertest'),
    );
  }

  return { dependencies, devDependencies };
}
