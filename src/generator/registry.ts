import type { Framework } from '../config/schema.js';
import { FRAMEWORK_CAPABILITIES } from '../config/capabilities.js';
import { ScafolderError } from '../util/errors.js';
import type { FrameworkGenerator } from './contract.js';

const generators = new Map<Framework, FrameworkGenerator>();

export function registerGenerator(generator: FrameworkGenerator): void {
  generators.set(generator.framework, generator);
}

export function hasGenerator(framework: Framework): boolean {
  return generators.has(framework);
}

/** Frameworks that can actually be generated right now, in declaration order. */
export function implementedFrameworks(): Framework[] {
  return (Object.keys(FRAMEWORK_CAPABILITIES) as Framework[]).filter((f) => generators.has(f));
}

export function getGenerator(framework: Framework): FrameworkGenerator {
  const generator = generators.get(framework);
  if (!generator) {
    const available = implementedFrameworks();
    throw new ScafolderError(
      'GENERATOR_NOT_FOUND',
      `${FRAMEWORK_CAPABILITIES[framework].label} is not implemented yet.`,
      {
        hint:
          available.length > 0
            ? `Available today: ${available.map((f) => FRAMEWORK_CAPABILITIES[f].label).join(', ')}.`
            : 'No framework generators are registered.',
      },
    );
  }
  return generator;
}

/** Test-only: restores an empty registry. */
export function clearGenerators(): void {
  generators.clear();
}
