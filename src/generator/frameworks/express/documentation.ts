import type { DocumentationFacts, LayerFact } from '../../../docs/facts.js';
import type { GenerationContext } from '../../context.js';

/**
 * Facts about the project the Express generator just wrote. Everything here is
 * derived from the real configuration, so the generated documentation cannot
 * describe a project that was not produced.
 */
export function describeExpressProject(context: GenerationContext): DocumentationFacts {
  const { config, data, packageManager } = context;
  const pm = packageManager.name;

  return {
    summary: `An Express REST API${data.hasDatabase ? ` backed by ${config.database} through ${config.orm}` : ''}${data.hasAuth ? ', with JWT authentication using rotating, revocable refresh tokens' : ''}.`,

    directoryLayout: buildLayout(context),
    layers: buildLayers(context),
    dependencyRules: buildDependencyRules(context),
    conventions: buildConventions(context),

    commands: [
      { label: 'Install', command: packageManager.describe('install') },
      { label: 'Run in development', command: `${pm} run dev` },
      { label: 'Build', command: `${pm} run build` },
      { label: 'Run the build', command: `${pm} run start` },
      { label: 'Type-check', command: `${pm} run typecheck` },
      { label: 'Lint', command: `${pm} run lint` },
      ...(data.hasTests ? [{ label: 'Test', command: `${pm} run test` }] : []),
      ...(data.isPrisma
        ? [
            { label: 'Create a migration', command: `${pm} run db:migrate` },
            { label: 'Apply migrations', command: `${pm} run db:deploy` },
          ]
        : []),
      ...(data.hasDocker ? [{ label: 'Run in Docker', command: 'docker compose up --build' }] : []),
    ],

    agentRules: buildAgentRules(context),
    addFeatureSteps: buildAddFeatureSteps(context),
  };
}

function buildLayout(context: GenerationContext): string {
  const { data } = context;
  const lines = [
    'src/',
    '├── main.ts                      (process lifecycle, graceful shutdown)',
    '├── app.ts                       (builds the Express app from a container)',
    '├── container.ts                 (composition root: all wiring lives here)',
    '├── config/',
    '│   └── env.ts',
  ];

  if (data.hasDatabase) lines.push('├── database/', '│   └── prisma.ts');

  lines.push(
    '├── shared/',
    '│   ├── errors/domain-error.ts',
    '│   ├── http/error-handler.ts',
    '│   ├── http/validate.ts',
    '│   └── logging/logger.ts',
    '└── modules/',
    '    ├── health/',
  );

  if (data.hasAuth) {
    lines.push(
      '    ├── users/',
      '    │   ├── user.ts                       (domain model)',
      ...(data.hasRepository ? ['    │   ├── users.repository.ts            (interface)'] : []),
      '    │   ├── users.service.ts',
      '    │   └── infrastructure/',
      '    │       └── prisma-users.repository.ts',
      '    └── auth/',
      '        ├── auth.routes.ts',
      '        ├── auth.schemas.ts               (zod request schemas)',
      '        ├── auth.service.ts',
      '        ├── tokens.service.ts',
      '        ├── require-auth.ts',
      ...(data.hasRepository ? ['        ├── refresh-token.repository.ts    (interface)'] : []),
      '        └── infrastructure/',
      '            └── prisma-refresh-token.repository.ts',
    );
  }

  return lines.join('\n');
}

function buildLayers(context: GenerationContext): LayerFact[] {
  const { data } = context;
  const layers: LayerFact[] = [
    {
      name: 'Composition root',
      path: 'src/container.ts',
      responsibility:
        'Chooses concrete implementations and wires them together. The only place `new` is called on a service.',
      mayDependOn: ['every module', 'Configuration', 'Database'],
    },
    {
      name: 'Configuration',
      path: 'src/config',
      responsibility:
        'Declares and validates every environment variable. The only code that reads process.env.',
      mayDependOn: [],
    },
    {
      name: 'Shared',
      path: 'src/shared',
      responsibility:
        'Domain error types, their HTTP translation, request validation and the logger.',
      mayDependOn: ['Configuration'],
    },
  ];

  if (data.hasDatabase) {
    layers.push({
      name: 'Database',
      path: 'src/database',
      responsibility: `Creates the ${context.config.orm} client. Owns no business logic.`,
      mayDependOn: ['Configuration'],
    });
  }

  layers.push({
    name: 'Modules',
    path: 'src/modules',
    responsibility:
      'One directory per feature: routes translate HTTP, a service holds the behaviour.',
    mayDependOn: ['Configuration', 'Shared', ...(data.hasDatabase ? ['Database'] : [])],
  });

  if (data.hasRepository) {
    layers.push({
      name: 'Module infrastructure',
      path: 'src/modules/*/infrastructure',
      responsibility: `The only place ${context.config.orm} types appear. Implements the module's repository interfaces.`,
      mayDependOn: ['Database', 'the repository interface it implements'],
    });
  }

  return layers;
}

function buildDependencyRules(context: GenerationContext): string[] {
  const { config, data } = context;
  const rules = [
    'Services are constructed in src/container.ts and nowhere else. A module never imports the container.',
    'Route handlers contain no business logic; they translate HTTP to a service call and back.',
    'Domain errors are thrown by services. Only src/shared/http/error-handler.ts knows about status codes.',
    'Nothing outside src/config/env.ts reads process.env.',
  ];

  if (data.hasRepository) {
    rules.push(
      `${config.orm} is imported only inside src/database and src/modules/*/infrastructure.`,
      'Services depend on repository interfaces, never on their implementations.',
    );
  } else if (data.hasDatabase) {
    rules.push(
      `${config.orm} is used inside src/database and the module data-access classes, not in route handlers.`,
    );
  }

  return rules;
}

function buildConventions(context: GenerationContext): string[] {
  const { data } = context;
  const conventions = [
    'ESM only. Every relative import ends in `.js`, even from a `.ts` source.',
    "The `dev` and `start` scripts load `.env` through Node's own `--env-file-if-exists`; there is no dotenv dependency at runtime.",
    'Files are kebab-case and named after what they export.',
    'Request bodies are validated with zod through `validateBody`, which replaces req.body with the parsed value.',
    'Express 5 forwards rejected promises to the error handler, so async route handlers need no wrapper.',
  ];

  if (data.hasTests) {
    conventions.push(
      'Specs sit next to the code they test and end in `.spec.ts`.',
      'HTTP behaviour is tested through supertest against a real app instance; services are tested directly.',
      'Tests use hand-written in-memory doubles rather than a mocking library.',
    );
  }

  if (data.hasAuth) {
    conventions.push(
      'Authentication failures return one message for every cause, so the endpoint cannot be used to discover which accounts exist.',
    );
  }

  return conventions;
}

function buildAgentRules(context: GenerationContext): string[] {
  const { data } = context;
  const rules = [
    'Add a feature as a new directory under src/modules, wired in src/container.ts and mounted in src/app.ts.',
    'Do not introduce a dependency-injection container. Wiring by hand is the design, not an omission.',
    'Do not read process.env outside src/config/env.ts. Add the variable to the schema instead.',
    'Register new middleware in src/app.ts, keeping the 404 handler and the error handler last.',
  ];

  if (data.hasAuth) {
    rules.push(
      'Do not weaken the refresh-token design: tokens are stored hashed, rotated on use, and reuse revokes the family.',
      'Do not add a password rule that shortens the minimum length.',
      'Protect a route by putting `requireAuth(tokens)` before its handler.',
    );
  }

  if (data.isPrisma) {
    rules.push(
      'Schema changes go through `prisma migrate dev`. Never edit a generated migration that has been applied.',
    );
  }

  return rules;
}

function buildAddFeatureSteps(context: GenerationContext): string[] {
  const { data } = context;
  const steps = [
    'Create `src/modules/<feature>/` with `<feature>.routes.ts` and `<feature>.service.ts`.',
    'Put request shapes in `<feature>.schemas.ts` as zod schemas, applied with `validateBody`.',
  ];

  if (data.hasDatabase) {
    if (data.hasRepository) {
      steps.push(
        'Declare what the feature needs from storage as an interface in the module.',
        'Implement it in `infrastructure/prisma-<feature>.repository.ts`.',
      );
    } else {
      steps.push('Add a data-access class in `infrastructure/` that takes the PrismaClient.');
    }
    steps.push('Add any new models to `prisma/schema.prisma` and run the migration script.');
  }

  steps.push(
    'Construct the service in `src/container.ts` and expose it on the Container interface.',
    'Mount the router in `src/app.ts`, before the 404 handler.',
  );

  if (data.hasTests) {
    steps.push('Add a `.spec.ts` next to the service covering the behaviour you added.');
  }

  steps.push('Update ARCHITECTURE.md if the change introduces a new layer or dependency rule.');
  return steps;
}
