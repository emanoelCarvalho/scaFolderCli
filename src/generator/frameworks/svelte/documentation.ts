import type { DocumentationFacts, LayerFact } from '../../../docs/facts.js';
import type { GenerationContext } from '../../context.js';

/**
 * Facts about the project the Svelte generator just wrote. Everything here is
 * derived from the real configuration, so the generated documentation cannot
 * describe a project that was not produced.
 */
export function describeSvelteProject(context: GenerationContext): DocumentationFacts {
  const { data, packageManager } = context;
  const pm = packageManager.name;

  return {
    summary: `A SvelteKit web client${data.hasAuth ? ', authenticating against an external API through server actions so no token reaches the browser' : ''}.`,

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
  const lines = ['src/'];

  if (data.hasAuth) {
    lines.push('├── hooks.server.ts          reads the session cookie into event.locals');
  }

  lines.push(
    '├── lib/',
    '│   ├── server/              never bundled into client code',
    '│   │   ├── env.ts           validated configuration',
    '│   │   └── api.ts           the one place this app calls the API',
  );

  if (data.hasAuth) {
    lines.push(
      '│   │   ├── auth.ts          the API’s auth endpoints',
      '│   │   └── session.ts       httpOnly session cookies',
    );
  }

  lines.push('│   └── components/          button, fields, modal, toast, states', '└── routes/');

  if (data.hasAuth) {
    lines.push(
      '    ├── login/               +page.svelte and its form action',
      '    ├── register/            +page.svelte and its form action',
      '    ├── logout/              action only',
      '    └── dashboard/           requires a session',
    );
  }

  return lines.join('\n');
}

function buildLayers(context: GenerationContext): LayerFact[] {
  const { data } = context;
  const layers: LayerFact[] = [
    {
      name: 'Server library',
      path: 'src/lib/server',
      responsibility:
        'Configuration, the API client and session handling. SvelteKit refuses to import this into client code, which is what keeps secrets on the server.',
      mayDependOn: [],
    },
    {
      name: 'Components',
      path: 'src/lib/components',
      responsibility:
        'Presentational building blocks. They receive props and render; they never fetch and never read configuration.',
      mayDependOn: [],
    },
    {
      name: 'Routes',
      path: 'src/routes',
      responsibility:
        '`+page.server.ts` loads data and handles form actions; `+page.svelte` renders it. Business logic lives in neither — it belongs in the server library.',
      mayDependOn: ['Server library', 'Components'],
    },
  ];

  if (data.hasAuth) {
    layers.push({
      name: 'Request hook',
      path: 'src/hooks.server.ts',
      responsibility:
        'Reads the session once per request onto `event.locals`, and redirects signed-out visitors away from protected routes.',
      mayDependOn: ['Server library'],
    });
  }

  return layers;
}

function buildDependencyRules(context: GenerationContext): string[] {
  const { data } = context;
  const rules = [
    'Nothing outside src/lib/server/env.ts reads the environment.',
    'Only src/lib/server/api.ts talks to the external API. A component never calls it.',
    'Components take props. Loading data belongs in a `+page.server.ts`.',
    'Anything under $lib/server must never be imported from a `.svelte` file; SvelteKit will fail the build if it is.',
  ];

  if (data.hasAuth) {
    rules.push(
      'Tokens stay on the server. A load function returns the user, never the session.',
      'The hook’s redirect is a convenience, not the authorisation check. Every protected load re-reads the session.',
    );
  }

  return rules;
}

function buildConventions(context: GenerationContext): string[] {
  const { data } = context;
  const conventions = [
    'Svelte 5 runes throughout: `$props`, `$state`, `$derived`. No `export let`.',
    'Components are PascalCase files; everything else is kebab-case.',
    'Forms post to a server action and are enhanced with `use:enhance`, so they still work without JavaScript.',
    'Styling is Tailwind utility classes. There is no custom CSS system to learn.',
    'Formatting follows the config `sv` generated: tabs, single quotes, no trailing commas.',
  ];

  if (data.hasTests) {
    conventions.push('Specs sit next to the code they test and end in `.spec.ts`.');
  }

  return conventions;
}

function buildAgentRules(context: GenerationContext): string[] {
  const { data } = context;
  const rules = [
    'Add a route as a directory under src/routes with a `+page.svelte`.',
    'Load data in `+page.server.ts`, not with `onMount` and a fetch.',
    'Do not introduce a store library. Runes and load functions cover this app.',
    'Do not add a component library. Extend the existing components under $lib/components.',
  ];

  if (data.hasAuth) {
    rules.push(
      'Do not move tokens into localStorage or a readable cookie. The httpOnly design is deliberate.',
      'Do not return the session from a load function; return only what the page renders.',
      'Add a protected route prefix to PROTECTED_PREFIXES in src/hooks.server.ts.',
    );
  }

  return rules;
}

function buildAddFeatureSteps(context: GenerationContext): string[] {
  const { data } = context;
  const steps = [
    'Create `src/routes/<route>/+page.svelte`.',
    'Add a `+page.server.ts` whose `load` fetches through `$lib/server/api`.',
    'Render with the existing components; add a new one to `$lib/components` only if two routes need it.',
    'For a form, add an `actions` export and enhance the form with `use:enhance`.',
  ];

  if (data.hasAuth) {
    steps.push(
      'For a protected route, read `locals.session` at the top of the load and redirect when it is missing.',
    );
  }

  if (data.hasTests) {
    steps.push('Add a `.spec.ts` covering the behaviour you added.');
  }

  steps.push('Update ARCHITECTURE.md if the change introduces a new layer or dependency rule.');
  return steps;
}
