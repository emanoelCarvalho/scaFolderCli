import type { PartialProjectConfig } from './schema.js';

export interface Preset {
  name: string;
  label: string;
  description: string;
  /** Never a full config: the project name always comes from the user. */
  config: PartialProjectConfig;
}

/**
 * Presets are data only. They exist so that common answers can be skipped, not
 * so that generators can be duplicated: a preset resolves to the exact same
 * ProjectConfig an interactive run would produce.
 */
export const PRESETS: Readonly<Record<string, Preset>> = {
  'nestjs-api': {
    name: 'nestjs-api',
    label: 'NestJS REST API',
    description: 'NestJS + PostgreSQL + Prisma + JWT + repository pattern + Vitest + Docker',
    config: {
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
    },
  },
  'express-api': {
    name: 'express-api',
    label: 'Express REST API',
    description: 'Express + PostgreSQL + Prisma + JWT + repository pattern + Vitest + Docker',
    config: {
      framework: 'express',
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
  'nextjs-web': {
    name: 'nextjs-web',
    label: 'Next.js web application',
    description: 'Next.js web client with JWT auth against an external API',
    config: {
      framework: 'nextjs',
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
  'svelte-web': {
    name: 'svelte-web',
    label: 'SvelteKit web application',
    description: 'SvelteKit web client with JWT auth against an external API',
    config: {
      framework: 'svelte',
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

export function presetNames(): string[] {
  return Object.keys(PRESETS);
}

export function findPreset(name: string): Preset | undefined {
  return PRESETS[name];
}
