import {
  type Architecture,
  type Authentication,
  type Database,
  type Framework,
  type Orm,
  type PartialProjectConfig,
  type ProjectConfig,
  type ProjectType,
  type TestRunner,
} from './schema.js';
import { ScafolderError } from '../util/errors.js';

export interface Choice<T> {
  value: T;
  label: string;
  hint?: string;
}

/**
 * What a framework is allowed to be combined with. This table is the single
 * source of truth for both prompt narrowing and validation, so adding a
 * framework never requires touching the core.
 */
export interface FrameworkCapability {
  label: string;
  hint: string;
  projectTypes: readonly ProjectType[];
  architectures: readonly Architecture[];
  databases: readonly Database[];
  orms: readonly Orm[];
  authentication: readonly Authentication[];
  testing: readonly TestRunner[];
  repositoryPattern: boolean;
  docker: boolean;
  /** Applied only to fields the caller left unspecified. */
  defaults: PartialProjectConfig;
}

/**
 * v1 stance: backend frameworks own persistence; frontend frameworks are
 * clients of an API and therefore carry no database, ORM or repository layer.
 * See docs/adr/0005-frontend-scope.md.
 */
export const FRAMEWORK_CAPABILITIES: Readonly<Record<Framework, FrameworkCapability>> = {
  // Implemented. This row states exactly what the generator produces today;
  // every entry is covered by a golden-project smoke test. Widening it without
  // widening the generator would offer combinations we cannot deliver.
  nestjs: {
    label: 'NestJS',
    hint: 'Opinionated Node.js framework, module-first, built on its own CLI',
    projectTypes: ['api'],
    architectures: ['modular'],
    databases: ['postgresql', 'none'],
    orms: ['prisma', 'none'],
    authentication: ['jwt', 'none'],
    testing: ['vitest', 'jest', 'none'],
    repositoryPattern: true,
    docker: true,
    defaults: {
      projectType: 'api',
      architecture: 'modular',
      database: 'postgresql',
      orm: 'prisma',
      authentication: 'jwt',
      repositoryPattern: true,
      testing: 'vitest',
      docker: true,
      aiDocumentation: true,
    },
  },
  // Implemented. Like the NestJS row, this states exactly what is generated.
  express: {
    label: 'Express',
    hint: 'Minimal HTTP framework, structure supplied by scafoldercli',
    projectTypes: ['api'],
    architectures: ['modular'],
    databases: ['postgresql', 'none'],
    orms: ['prisma', 'none'],
    authentication: ['jwt', 'none'],
    // Jest under ESM needs its own configuration and its own validated run;
    // until that exists it is not offered.
    testing: ['vitest', 'none'],
    repositoryPattern: true,
    docker: true,
    defaults: {
      projectType: 'api',
      architecture: 'modular',
      database: 'postgresql',
      orm: 'prisma',
      authentication: 'jwt',
      repositoryPattern: true,
      testing: 'vitest',
      docker: true,
      aiDocumentation: true,
    },
  },
  // Planned. Rows for unimplemented frameworks describe the intended scope;
  // nothing is offered to users until a generator is registered.
  nextjs: {
    label: 'Next.js',
    hint: 'React web client generated through create-next-app',
    projectTypes: ['web'],
    architectures: ['modular', 'layered'],
    databases: ['none'],
    orms: ['none'],
    authentication: ['jwt', 'none'],
    testing: ['vitest', 'jest', 'none'],
    repositoryPattern: false,
    docker: true,
    defaults: {
      projectType: 'web',
      architecture: 'modular',
      database: 'none',
      orm: 'none',
      authentication: 'jwt',
      repositoryPattern: false,
      testing: 'vitest',
      docker: true,
      aiDocumentation: true,
    },
  },
  svelte: {
    label: 'Svelte',
    hint: 'SvelteKit web client generated through its official scaffolder',
    projectTypes: ['web'],
    architectures: ['modular', 'layered'],
    databases: ['none'],
    orms: ['none'],
    authentication: ['jwt', 'none'],
    testing: ['vitest', 'none'],
    repositoryPattern: false,
    docker: true,
    defaults: {
      projectType: 'web',
      architecture: 'modular',
      database: 'none',
      orm: 'none',
      authentication: 'jwt',
      repositoryPattern: false,
      testing: 'vitest',
      docker: true,
      aiDocumentation: true,
    },
  },
};

/** Which ORMs can actually talk to which database engine. */
export const DATABASE_ORMS: Readonly<Record<Database, readonly Orm[]>> = {
  postgresql: ['prisma', 'typeorm', 'sequelize'],
  mysql: ['prisma', 'typeorm', 'sequelize'],
  mongodb: ['prisma', 'mongoose'],
  sqlite: ['prisma', 'typeorm', 'sequelize'],
  none: ['none'],
};

export const PROJECT_TYPE_LABELS: Record<ProjectType, Choice<ProjectType>> = {
  api: { value: 'api', label: 'REST API', hint: 'HTTP backend service' },
  web: { value: 'web', label: 'Web application', hint: 'Browser-facing client' },
};

export const ARCHITECTURE_LABELS: Record<Architecture, Choice<Architecture>> = {
  modular: { value: 'modular', label: 'Modular', hint: 'Feature modules, framework-native' },
  layered: { value: 'layered', label: 'Layered', hint: 'Controller / service / repository' },
  clean: {
    value: 'clean',
    label: 'Clean',
    hint: 'domain / application / infrastructure / presentation',
  },
};

export const DATABASE_LABELS: Record<Database, Choice<Database>> = {
  postgresql: { value: 'postgresql', label: 'PostgreSQL' },
  mysql: { value: 'mysql', label: 'MySQL' },
  mongodb: { value: 'mongodb', label: 'MongoDB' },
  sqlite: { value: 'sqlite', label: 'SQLite', hint: 'File-based, no container needed' },
  none: { value: 'none', label: 'None' },
};

export const ORM_LABELS: Record<Orm, Choice<Orm>> = {
  prisma: { value: 'prisma', label: 'Prisma' },
  typeorm: { value: 'typeorm', label: 'TypeORM' },
  sequelize: { value: 'sequelize', label: 'Sequelize' },
  mongoose: { value: 'mongoose', label: 'Mongoose' },
  none: { value: 'none', label: 'None' },
};

export const AUTHENTICATION_LABELS: Record<Authentication, Choice<Authentication>> = {
  jwt: { value: 'jwt', label: 'JWT', hint: 'Access + rotating refresh tokens with revocation' },
  none: { value: 'none', label: 'None' },
};

export const TEST_RUNNER_LABELS: Record<TestRunner, Choice<TestRunner>> = {
  vitest: { value: 'vitest', label: 'Vitest' },
  jest: { value: 'jest', label: 'Jest' },
  none: { value: 'none', label: 'None', hint: 'Not recommended' },
};

function intersect<T>(a: readonly T[], b: readonly T[]): T[] {
  return a.filter((value) => b.includes(value));
}

export function availableProjectTypes(framework: Framework): Choice<ProjectType>[] {
  return FRAMEWORK_CAPABILITIES[framework].projectTypes.map((t) => PROJECT_TYPE_LABELS[t]);
}

export function availableArchitectures(framework: Framework): Choice<Architecture>[] {
  return FRAMEWORK_CAPABILITIES[framework].architectures.map((a) => ARCHITECTURE_LABELS[a]);
}

export function availableDatabases(framework: Framework): Choice<Database>[] {
  return FRAMEWORK_CAPABILITIES[framework].databases.map((d) => DATABASE_LABELS[d]);
}

/** ORMs that are valid for the database engine AND supported by the framework. */
export function availableOrms(framework: Framework, database: Database): Choice<Orm>[] {
  return intersect(DATABASE_ORMS[database], FRAMEWORK_CAPABILITIES[framework].orms).map(
    (o) => ORM_LABELS[o],
  );
}

/**
 * JWT is only offered for an API when there is somewhere to store and revoke
 * refresh tokens. Web clients hold tokens issued by someone else's API.
 */
export function availableAuthentication(
  framework: Framework,
  projectType: ProjectType,
  database: Database,
): Choice<Authentication>[] {
  const supported = FRAMEWORK_CAPABILITIES[framework].authentication;
  if (projectType === 'api' && database === 'none') {
    return intersect(supported, ['none'] as const).map((a) => AUTHENTICATION_LABELS[a]);
  }
  return supported.map((a) => AUTHENTICATION_LABELS[a]);
}

export function availableTestRunners(framework: Framework): Choice<TestRunner>[] {
  return FRAMEWORK_CAPABILITIES[framework].testing.map((t) => TEST_RUNNER_LABELS[t]);
}

export function supportsRepositoryPattern(framework: Framework, database: Database): boolean {
  return FRAMEWORK_CAPABILITIES[framework].repositoryPattern && database !== 'none';
}

interface CompatibilityRule {
  id: string;
  check(config: ProjectConfig): string | null;
}

/**
 * Each rule returns a human-readable reason when the combination is invalid.
 * Adding a rule never requires changing the validator itself.
 */
const RULES: readonly CompatibilityRule[] = [
  {
    id: 'framework-supports-project-type',
    check: (c) =>
      FRAMEWORK_CAPABILITIES[c.framework].projectTypes.includes(c.projectType)
        ? null
        : `${FRAMEWORK_CAPABILITIES[c.framework].label} does not support project type "${c.projectType}".`,
  },
  {
    id: 'framework-supports-architecture',
    check: (c) =>
      FRAMEWORK_CAPABILITIES[c.framework].architectures.includes(c.architecture)
        ? null
        : `${FRAMEWORK_CAPABILITIES[c.framework].label} does not support the "${c.architecture}" architecture.`,
  },
  {
    id: 'framework-supports-database',
    check: (c) =>
      FRAMEWORK_CAPABILITIES[c.framework].databases.includes(c.database)
        ? null
        : `${FRAMEWORK_CAPABILITIES[c.framework].label} does not support the "${c.database}" database.`,
  },
  {
    id: 'orm-supports-database',
    check: (c) =>
      DATABASE_ORMS[c.database].includes(c.orm)
        ? null
        : `ORM "${c.orm}" cannot be used with database "${c.database}". Valid options: ${DATABASE_ORMS[c.database].join(', ')}.`,
  },
  {
    id: 'framework-supports-orm',
    check: (c) =>
      FRAMEWORK_CAPABILITIES[c.framework].orms.includes(c.orm)
        ? null
        : `${FRAMEWORK_CAPABILITIES[c.framework].label} does not support ORM "${c.orm}".`,
  },
  {
    id: 'framework-supports-test-runner',
    check: (c) =>
      FRAMEWORK_CAPABILITIES[c.framework].testing.includes(c.testing)
        ? null
        : `${FRAMEWORK_CAPABILITIES[c.framework].label} does not support test runner "${c.testing}".`,
  },
  {
    id: 'api-jwt-requires-database',
    check: (c) =>
      c.projectType === 'api' && c.authentication === 'jwt' && c.database === 'none'
        ? 'JWT authentication for an API requires a database: refresh tokens must be revocable server-side.'
        : null,
  },
  {
    id: 'repository-requires-persistence',
    check: (c) =>
      c.repositoryPattern && (c.database === 'none' || c.orm === 'none')
        ? 'The repository pattern requires a database and an ORM; there is nothing to abstract otherwise.'
        : null,
  },
  {
    id: 'repository-supported-by-framework',
    check: (c) =>
      c.repositoryPattern && !FRAMEWORK_CAPABILITIES[c.framework].repositoryPattern
        ? `${FRAMEWORK_CAPABILITIES[c.framework].label} projects do not own persistence, so the repository pattern does not apply.`
        : null,
  },
  {
    id: 'docker-supported-by-framework',
    check: (c) =>
      c.docker && !FRAMEWORK_CAPABILITIES[c.framework].docker
        ? `${FRAMEWORK_CAPABILITIES[c.framework].label} projects cannot be containerized by scafoldercli yet.`
        : null,
  },
];

/** Returns every reason the combination is invalid, empty when it is valid. */
export function findIncompatibilities(config: ProjectConfig): string[] {
  return RULES.map((rule) => rule.check(config)).filter((reason): reason is string =>
    Boolean(reason),
  );
}

export function assertCompatible(config: ProjectConfig): void {
  const problems = findIncompatibilities(config);
  if (problems.length === 0) return;
  throw new ScafolderError(
    'INVALID_COMBINATION',
    `Incompatible configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    { hint: 'Run `scafoldercli create` interactively to see only valid combinations.' },
  );
}

/**
 * Fills unspecified fields from the framework's opinionated defaults. Values the
 * caller supplied are never overwritten: contradictions between explicit
 * choices are reported by `assertCompatible`, not silently repaired.
 *
 * Defaults that only make sense with persistence follow an explicit
 * `--database none`, so that opting out of a database does not drag in an ORM,
 * a repository layer and JWT the caller never asked for.
 */
export function applyFrameworkDefaults(partial: PartialProjectConfig): PartialProjectConfig {
  if (!partial.framework) return { ...partial };

  const merged: PartialProjectConfig = {
    ...FRAMEWORK_CAPABILITIES[partial.framework].defaults,
    ...partial,
  };

  if (partial.database === 'none') {
    merged.orm = partial.orm ?? 'none';
    merged.repositoryPattern = partial.repositoryPattern ?? false;
    if (merged.projectType === 'api') {
      merged.authentication = partial.authentication ?? 'none';
    }
  }

  return merged;
}
