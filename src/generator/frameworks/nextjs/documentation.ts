import type { DocumentationFacts, LayerFact } from '../../../docs/facts.js';
import type { GenerationContext } from '../../context.js';

/**
 * Facts about the project the Next.js generator just wrote. Everything here is
 * derived from the real configuration, so the generated documentation cannot
 * describe a project that was not produced.
 */
export function describeNextjsProject(context: GenerationContext): DocumentationFacts {
  const { data, packageManager } = context;
  const pm = packageManager.name;

  return {
    summary: `A Next.js web client built on the App Router${data.hasAuth ? ', authenticating against an external API through its own route handlers so no token reaches the browser' : ''}.`,

    directoryLayout: buildLayout(context),
    layers: buildLayers(context),
    dependencyRules: buildDependencyRules(context),
    conventions: buildConventions(context),

    commands: [
      { label: 'Install', command: packageManager.describe('install') },
      { label: 'Run in development', command: `${pm} run dev` },
      { label: 'Build', command: `${pm} run build` },
      { label: 'Serve the build', command: `${pm} run start` },
      { label: 'Type-check', command: `${pm} run typecheck` },
      { label: 'Lint', command: `${pm} run lint` },
      ...(data.hasTests ? [{ label: 'Test', command: `${pm} run test` }] : []),
      ...(data.hasDocker ? [{ label: 'Run in Docker', command: 'docker compose up --build' }] : []),
    ],

    agentRules: buildAgentRules(context),
    addFeatureSteps: buildAddFeatureSteps(context),
  };
}

function buildLayout(context: GenerationContext): string {
  const { data } = context;
  const lines = ['src/', '├── app/                     routes (App Router)'];

  if (data.hasAuth) {
    lines.push(
      '│   ├── (auth)/              sign-in and sign-up',
      '│   ├── (app)/               routes that require a session',
      '│   └── api/auth/            route handlers that hold the tokens',
    );
  }

  lines.push(
    '├── components/',
    '│   ├── ui/                  button, fields, modal, toast, spinner',
    '│   └── states/              loading, empty and error states',
    '└── lib/',
    '    ├── env.ts               validated, server-only configuration',
    '    ├── api/                 the one place this app calls the API',
  );

  if (data.hasAuth) lines.push('    └── auth/                session cookies and auth calls');

  return lines.join('\n');
}

function buildLayers(context: GenerationContext): LayerFact[] {
  const { data } = context;
  const layers: LayerFact[] = [
    {
      name: 'Configuration',
      path: 'src/lib/env.ts',
      responsibility:
        'Declares and validates every environment variable. Marked `server-only`, so importing it from a client component is a build error.',
      mayDependOn: [],
    },
    {
      name: 'API access',
      path: 'src/lib/api',
      responsibility:
        'The only code that calls the external API. Server-only; browser code goes through this app’s own route handlers.',
      mayDependOn: ['Configuration'],
    },
    {
      name: 'Components',
      path: 'src/components',
      responsibility:
        'Presentational building blocks. They receive data and callbacks; they never fetch and never read configuration.',
      mayDependOn: [],
    },
    {
      name: 'Routes',
      path: 'src/app',
      responsibility:
        'Server Components load data and pass it down. Client Components handle interaction. Route handlers expose this app’s own API.',
      mayDependOn: ['API access', 'Components', ...(data.hasAuth ? ['Session'] : [])],
    },
  ];

  if (data.hasAuth) {
    layers.push({
      name: 'Session',
      path: 'src/lib/auth',
      responsibility:
        'Reads and writes the httpOnly session cookies and calls the API’s auth endpoints. Server-only.',
      mayDependOn: ['Configuration', 'API access'],
    });
  }

  return layers;
}

function buildDependencyRules(context: GenerationContext): string[] {
  const { data } = context;
  const rules = [
    'Nothing outside src/lib/env.ts reads process.env.',
    'Only src/lib/api talks to the external API. A component never calls it directly.',
    'Components take data as props. Fetching belongs in a Server Component or a route handler.',
    "Add 'use client' only where interaction requires it; the default is a Server Component.",
  ];

  if (data.hasAuth) {
    rules.push(
      'Tokens never leave the server. Client code calls /api/auth/* and gets back a user, never a token.',
      'src/lib/auth/session.ts is server-only. Importing it from a client component must stay a build error.',
      'The middleware is a redirect convenience, not an authorisation check. Every protected page re-reads the session.',
    );
  }

  return rules;
}

function buildConventions(context: GenerationContext): string[] {
  const { data } = context;
  const conventions = [
    'Imports use the `@/` alias for anything under src/, and relative paths within a folder.',
    'Files are kebab-case; components are PascalCase named exports.',
    'Styling is Tailwind utility classes. There is no custom CSS system to learn.',
    'Every form control is rendered through TextField or PasswordField, which wire up label, hint and error ids.',
  ];

  if (data.hasTests) {
    conventions.push(
      'Specs sit next to the code they test and end in `.spec.tsx`.',
      'Tests query by role and label, the way a user finds things, never by test id or class name.',
    );
  }

  return conventions;
}

function buildAgentRules(context: GenerationContext): string[] {
  const { data } = context;
  const rules = [
    'Add a route as a directory under src/app with a page.tsx.',
    'Do not fetch from a client component when a Server Component can load the data.',
    "Do not add 'use client' to a file just to silence an error; understand which side the code belongs on.",
    'Do not introduce a state-management library. Server Components plus local state cover this app.',
    'Do not add a component library. Extend the existing components under src/components/ui.',
  ];

  if (data.hasAuth) {
    rules.push(
      'Do not move tokens into localStorage or a readable cookie. The httpOnly design is deliberate.',
      'Do not add NEXT_PUBLIC_ variables for anything sensitive; that prefix ships the value to the browser.',
    );
  }

  return rules;
}

function buildAddFeatureSteps(context: GenerationContext): string[] {
  const { data } = context;
  const steps = [
    'Create `src/app/<route>/page.tsx` as a Server Component.',
    'Load its data through a function in `src/lib/api`, never with a bare fetch in the page.',
    'Render with the existing components; add a new one to `src/components/ui` only if two routes need it.',
    "Split out a 'use client' component for the interactive part only.",
  ];

  if (data.hasAuth) {
    steps.push(
      'For a protected route, read the session at the top of the page and redirect when it is missing.',
      'Add the route prefix to PROTECTED_PREFIXES in src/middleware.ts.',
    );
  }

  if (data.hasTests) {
    steps.push('Add a `.spec.tsx` covering what the user can see and do.');
  }

  steps.push('Update ARCHITECTURE.md if the change introduces a new layer or dependency rule.');
  return steps;
}
