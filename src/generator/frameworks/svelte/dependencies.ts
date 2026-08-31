import type { JsonObject } from '../../../fs/project-files.js';
import type { ProjectConfig } from '../../../config/schema.js';

/**
 * The single place package versions live for generated SvelteKit projects.
 *
 * `sv create` already supplies Svelte, SvelteKit, Vite, TypeScript, ESLint,
 * Prettier, Tailwind, Vitest and the Node adapter through its add-ons; this
 * table covers only what scafoldercli adds on top.
 */
export const VERSIONS = {
  zod: '^4.5.4',
} as const satisfies Record<string, string>;

type PackageName = keyof typeof VERSIONS;

function pick(...names: PackageName[]): JsonObject {
  return Object.fromEntries(names.map((name) => [name, VERSIONS[name]]));
}

export interface DependencySet {
  dependencies: JsonObject;
  devDependencies: JsonObject;
}

export function resolveDependencies(_config: ProjectConfig): DependencySet {
  return { dependencies: pick('zod'), devDependencies: {} };
}

/**
 * Add-ons passed to `sv create`. Every option is set explicitly, because `sv`
 * prompts for anything left unspecified and a prompt would hang generation.
 *
 * `vitest=usages:unit` deliberately excludes component testing: that mode runs
 * through Playwright, which would download a browser during generation and in
 * CI. Component tests are a follow-up, not a default.
 */
export const SV_ADDONS = [
  'prettier',
  'eslint',
  'vitest=usages:unit',
  'tailwindcss=plugins:none',
  'sveltekit-adapter=adapter:node',
] as const;
