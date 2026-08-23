import type { DocumentationFacts, LayerFact } from '../../../docs/facts.js';
import type { GenerationContext } from '../../context.js';

/**
 * Facts about the project the NestJS generator just wrote. Everything here is
 * derived from the real configuration, so the generated documentation cannot
 * describe a project that was not produced.
 */
export function describeNestjsProject(context: GenerationContext): DocumentationFacts {
  const { config, data, packageManager } = context;
  const pm = packageManager.name;

  return {
    summary: `A NestJS REST API${data.hasDatabase ? ` backed by ${config.database} through ${config.orm}` : ''}${data.hasAuth ? ', with JWT authentication using rotating, revocable refresh tokens' : ''}.`,

    directoryLayout: buildLayout(context),
    layers: buildLayers(context),
    dependencyRules: buildDependencyRules(context),
    conventions: buildConventions(context),

    commands: [
      { label: 'Install', command: packageManager.describe('install') },
      { label: 'Run in development', command: `${pm} run start:dev` },
      { label: 'Build', command: `${pm} run build` },
      { label: 'Run the build', command: `${pm} run start:prod` },
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
  const lines = ['src/', '├── main.ts', '├── app.module.ts', '├── config/', '│   └── env.ts'];

  if (data.hasDatabase) {
    lines.push('├── database/', '│   ├── database.module.ts', '│   └── prisma.service.ts');
  }

  lines.push(
    '├── shared/',
    '│   ├── errors/domain-error.ts',
    '│   └── http/domain-exception.filter.ts',
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
      '        ├── auth.controller.ts',
      '        ├── auth.service.ts',
      '        ├── tokens.service.ts',
      '        ├── jwt-auth.guard.ts',
      '        ├── dto/',
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
        'Domain error types and the HTTP translation of them. Contains nothing feature-specific.',
      mayDependOn: [],
    },
  ];

  if (data.hasDatabase) {
    layers.push({
      name: 'Database',
      path: 'src/database',
      responsibility: `Owns the ${context.config.orm} connection and its lifecycle.`,
      mayDependOn: ['Configuration'],
    });
  }

  layers.push({
    name: 'Modules',
    path: 'src/modules',
    responsibility:
      'One directory per feature. A module exposes a service and a controller; everything else is internal to it.',
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
    "A module never imports another module's internal files. Import the module's service through its module.",
    'src/shared and src/config depend on nothing inside src/modules.',
    'Controllers contain no business logic; they translate HTTP to a service call and back.',
    'Domain errors are thrown by services. Only the exception filter knows about HTTP status codes.',
  ];

  if (data.hasRepository) {
    rules.push(
      `${config.orm} is imported only inside src/database and src/modules/*/infrastructure.`,
      'Services depend on repository interfaces, never on their implementations.',
      'A repository interface is bound to an implementation in exactly one place: the module definition.',
    );
  } else if (data.hasDatabase) {
    rules.push(
      `${config.orm} is used inside src/database and the module data-access classes, not in controllers.`,
    );
  }

  return rules;
}

function buildConventions(context: GenerationContext): string[] {
  const { data } = context;
  const conventions = [
    'Files are kebab-case and named after what they export: `auth.service.ts` exports `AuthService`.',
    'DTOs live in `dto/` and are validated by class-validator through the global ValidationPipe.',
    'Configuration is read through ConfigService with `{ infer: true }`, never from process.env.',
  ];

  if (data.hasTests) {
    conventions.push(
      'Specs sit next to the code they test and end in `.spec.ts`.',
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
    'Add a feature as a new directory under src/modules, registered in app.module.ts.',
    'Do not add a global module. Import what you need explicitly.',
    'Do not read process.env outside src/config/env.ts. Add the variable to the Env class instead.',
  ];

  if (data.hasAuth) {
    rules.push(
      'Do not weaken the refresh-token design: tokens are stored hashed, rotated on use, and reuse revokes the family.',
      'Do not add a password rule that shortens the minimum length.',
      'Protect a route with @UseGuards(JwtAuthGuard) and read the caller with @CurrentUser().',
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
    'Create `src/modules/<feature>/` with `<feature>.module.ts`, `<feature>.service.ts` and `<feature>.controller.ts`.',
    'Put request shapes in `dto/` with class-validator decorators.',
  ];

  if (data.hasDatabase) {
    if (data.hasRepository) {
      steps.push(
        'Declare what the feature needs from storage as an interface plus an injection token.',
        'Implement that interface in `infrastructure/prisma-<feature>.repository.ts`.',
        'Bind the token to the implementation in the module definition.',
      );
    } else {
      steps.push(
        'Add a data-access class in `infrastructure/` that uses PrismaService, and provide it in the module.',
      );
    }
    steps.push('Add any new models to `prisma/schema.prisma` and run the migration script.');
  }

  steps.push('Register the module in `app.module.ts`.');

  if (data.hasTests) {
    steps.push('Add a `.spec.ts` next to the service covering the behaviour you added.');
  }

  steps.push('Update ARCHITECTURE.md if the change introduces a new layer or dependency rule.');
  return steps;
}
