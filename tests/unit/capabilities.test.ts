import { describe, expect, it } from 'vitest';
import {
  DATABASE_ORMS,
  FRAMEWORK_CAPABILITIES,
  applyFrameworkDefaults,
  assertCompatible,
  availableAuthentication,
  availableDatabases,
  availableOrms,
  findIncompatibilities,
  supportsRepositoryPattern,
} from '../../src/config/capabilities.js';
import { FRAMEWORKS, type ProjectConfig } from '../../src/config/schema.js';
import { isScafolderError } from '../../src/util/errors.js';

const base: ProjectConfig = {
  projectName: 'my-api',
  framework: 'nestjs',
  projectType: 'api',
  architecture: 'modular',
  database: 'postgresql',
  orm: 'prisma',
  authentication: 'jwt',
  repositoryPattern: true,
  testing: 'vitest',
  docker: true,
  aiDocumentation: true,
  packageManager: 'npm',
};

describe('matrix consistency', () => {
  it('every framework default is itself a valid configuration', () => {
    for (const framework of FRAMEWORKS) {
      const config = {
        ...base,
        framework,
        ...FRAMEWORK_CAPABILITIES[framework].defaults,
      } as ProjectConfig;
      expect(findIncompatibilities(config), framework).toEqual([]);
    }
  });

  it('every framework declares at least one usable ORM per offered database', () => {
    for (const framework of FRAMEWORKS) {
      for (const database of FRAMEWORK_CAPABILITIES[framework].databases) {
        expect(
          availableOrms(framework, database).length,
          `${framework}/${database}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('mongodb never offers a relational ORM', () => {
    expect(DATABASE_ORMS.mongodb).not.toContain('typeorm');
    expect(DATABASE_ORMS.mongodb).not.toContain('sequelize');
  });

  it('the "none" database only allows the "none" ORM', () => {
    expect(DATABASE_ORMS.none).toEqual(['none']);
  });
});

describe('option narrowing', () => {
  it('offers only ORMs valid for both the database and the framework', () => {
    // The engine itself supports three ORMs; the framework narrows it to one.
    expect(DATABASE_ORMS.postgresql.length).toBeGreaterThan(1);
    expect(availableOrms('nestjs', 'postgresql').map((o) => o.value)).toEqual(['prisma']);
  });

  it('offers only what the implemented NestJS generator actually produces', () => {
    expect(availableDatabases('nestjs').map((d) => d.value)).toEqual(['postgresql', 'none']);
    expect(availableOrms('nestjs', 'postgresql').map((o) => o.value)).toEqual(['prisma']);
  });

  it('hides JWT for an API without a database', () => {
    expect(availableAuthentication('nestjs', 'api', 'none').map((a) => a.value)).toEqual(['none']);
  });

  it('keeps JWT for a web client, which does not own the database', () => {
    expect(availableAuthentication('nextjs', 'web', 'none').map((a) => a.value)).toContain('jwt');
  });

  it('restricts frontend frameworks to no database', () => {
    expect(availableDatabases('svelte').map((d) => d.value)).toEqual(['none']);
  });

  it('disables the repository pattern without persistence', () => {
    expect(supportsRepositoryPattern('nestjs', 'none')).toBe(false);
    expect(supportsRepositoryPattern('nestjs', 'postgresql')).toBe(true);
    expect(supportsRepositoryPattern('nextjs', 'postgresql')).toBe(false);
  });
});

describe('findIncompatibilities', () => {
  it('accepts the golden path', () => {
    expect(findIncompatibilities(base)).toEqual([]);
  });

  it('rejects mongoose with postgresql', () => {
    const problems = findIncompatibilities({ ...base, orm: 'mongoose' });
    expect(problems.join(' ')).toContain('cannot be used with database "postgresql"');
  });

  it('rejects JWT for an API with no database', () => {
    const problems = findIncompatibilities({
      ...base,
      database: 'none',
      orm: 'none',
      repositoryPattern: false,
    });
    expect(problems.join(' ')).toContain('revocable server-side');
  });

  it('rejects the repository pattern without an ORM', () => {
    const problems = findIncompatibilities({
      ...base,
      database: 'none',
      orm: 'none',
      authentication: 'none',
    });
    expect(problems.join(' ')).toContain('repository pattern requires');
  });

  it('rejects a database on a frontend framework', () => {
    const problems = findIncompatibilities({
      ...base,
      framework: 'svelte',
      projectType: 'web',
      repositoryPattern: false,
    });
    expect(problems.length).toBeGreaterThan(0);
  });

  it('reports every problem at once instead of stopping at the first', () => {
    const problems = findIncompatibilities({
      ...base,
      framework: 'nextjs',
      projectType: 'api',
      architecture: 'clean',
    });
    expect(problems.length).toBeGreaterThan(1);
  });
});

describe('assertCompatible', () => {
  it('throws a typed error listing the reasons', () => {
    try {
      assertCompatible({ ...base, orm: 'mongoose' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isScafolderError(error)).toBe(true);
      if (isScafolderError(error)) {
        expect(error.code).toBe('INVALID_COMBINATION');
        expect(error.message).toContain('mongoose');
      }
    }
  });
});

describe('applyFrameworkDefaults', () => {
  it('fills unspecified fields only', () => {
    const result = applyFrameworkDefaults({ framework: 'nestjs', database: 'mongodb' });
    expect(result.database).toBe('mongodb');
    expect(result.architecture).toBe('modular');
  });

  it('is a no-op without a framework', () => {
    expect(applyFrameworkDefaults({ projectName: 'x' })).toEqual({ projectName: 'x' });
  });
});

describe('applyFrameworkDefaults with an explicit "none" database', () => {
  it('does not drag in an ORM, repository layer or JWT', () => {
    const result = applyFrameworkDefaults({ framework: 'nestjs', database: 'none' });
    expect(result.orm).toBe('none');
    expect(result.repositoryPattern).toBe(false);
    expect(result.authentication).toBe('none');
    expect(findIncompatibilities({ ...base, ...result } as never)).toEqual([]);
  });

  it('still honours an explicit contradicting choice so it can be reported', () => {
    const result = applyFrameworkDefaults({
      framework: 'nestjs',
      database: 'none',
      orm: 'prisma',
    });
    expect(result.orm).toBe('prisma');
    expect(findIncompatibilities({ ...base, ...result } as never).length).toBeGreaterThan(0);
  });
});
