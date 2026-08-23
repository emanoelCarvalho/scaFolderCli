import type { ProjectConfig } from '../../../config/schema.js';
import type { JsonObject } from '../../../fs/project-files.js';

/**
 * The single place package versions live. `nest new` already supplies the Nest
 * core, TypeScript, ESLint and Prettier; this table covers only what
 * scafoldercli adds on top.
 *
 * Caret ranges, not exact pins: generated projects should receive patch and
 * minor fixes. Majors are upgraded here deliberately, with a golden-project run.
 */
export const VERSIONS = {
  '@nestjs/config': '^4.0.4',
  '@nestjs/jwt': '^11.0.2',
  'class-transformer': '^0.5.1',
  'class-validator': '^0.15.1',
  '@node-rs/argon2': '^2.1.0',
  helmet: '^8.3.0',
  '@nestjs/throttler': '^6.5.0',

  '@prisma/client': '^7.9.1',
  '@prisma/adapter-pg': '^7.9.1',
  prisma: '^7.9.1',
  dotenv: '^17.4.2',

  vitest: '^4.1.11',
  '@vitest/coverage-v8': '^4.1.11',
  'unplugin-swc': '^1.5.11',
  '@swc/core': '^1.16.1',
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
  const dependencies: JsonObject = pick(
    '@nestjs/config',
    'class-validator',
    'class-transformer',
    'helmet',
  );
  const devDependencies: JsonObject = {};

  if (config.orm === 'prisma') {
    Object.assign(dependencies, pick('@prisma/client'));
    Object.assign(devDependencies, pick('prisma', 'dotenv'));

    const adapter = PRISMA_ADAPTERS[config.database];
    if (adapter) Object.assign(dependencies, pick(adapter));
  }

  if (config.authentication === 'jwt') {
    // Rate limiting is only pulled in when there are credentials worth brute-forcing.
    Object.assign(dependencies, pick('@nestjs/jwt', '@node-rs/argon2', '@nestjs/throttler'));
  }

  if (config.testing === 'vitest') {
    Object.assign(
      devDependencies,
      pick('vitest', '@vitest/coverage-v8', 'unplugin-swc', '@swc/core'),
    );
  }

  return { dependencies, devDependencies };
}

/**
 * Removes the dependencies of the test runner `nest new` installed but the user
 * did not choose, so the generated project has exactly one test stack.
 */
export const JEST_PACKAGES = [
  'jest',
  'ts-jest',
  '@types/jest',
  'supertest',
  '@types/supertest',
] as const;
