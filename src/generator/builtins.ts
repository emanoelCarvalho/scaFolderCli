import type { FrameworkGenerator } from './contract.js';
import { expressGenerator } from './frameworks/express/index.js';
import { nestjsGenerator } from './frameworks/nestjs/index.js';
import { nextjsGenerator } from './frameworks/nextjs/index.js';
import { svelteGenerator } from './frameworks/svelte/index.js';
import { registerGenerator } from './registry.js';

/**
 * Every generator that ships with the CLI. This is the only file that changes
 * when a framework is added; the core never enumerates frameworks.
 */
const BUILT_INS: readonly FrameworkGenerator[] = [
  nestjsGenerator,
  expressGenerator,
  nextjsGenerator,
  svelteGenerator,
];

export function registerBuiltInGenerators(): void {
  for (const generator of BUILT_INS) registerGenerator(generator);
}
