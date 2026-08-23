import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearGenerators,
  getGenerator,
  hasGenerator,
  implementedFrameworks,
  registerGenerator,
} from '../../src/generator/registry.js';
import type { FrameworkGenerator } from '../../src/generator/contract.js';

function stub(framework: FrameworkGenerator['framework']): FrameworkGenerator {
  return {
    framework,
    async validate() {},
    async initialize() {},
    async generate() {},
    documentation() {
      return {
        summary: '',
        directoryLayout: '',
        layers: [],
        dependencyRules: [],
        conventions: [],
        commands: [],
        agentRules: [],
        addFeatureSteps: [],
      };
    },
  };
}

beforeEach(() => clearGenerators());
afterEach(() => clearGenerators());

describe('registry', () => {
  it('reports nothing implemented when empty', () => {
    expect(implementedFrameworks()).toEqual([]);
    expect(hasGenerator('nestjs')).toBe(false);
  });

  it('resolves a registered generator', () => {
    registerGenerator(stub('nestjs'));
    expect(getGenerator('nestjs').framework).toBe('nestjs');
    expect(implementedFrameworks()).toEqual(['nestjs']);
  });

  it('explains what is available when a framework is missing', () => {
    registerGenerator(stub('nestjs'));
    try {
      getGenerator('svelte');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as { code: string }).code).toBe('GENERATOR_NOT_FOUND');
      expect((error as { hint: string }).hint).toContain('NestJS');
    }
  });

  it('the last registration for a framework wins, which is how plugins override', () => {
    registerGenerator(stub('nestjs'));
    const replacement = stub('nestjs');
    registerGenerator(replacement);
    expect(getGenerator('nestjs')).toBe(replacement);
  });
});
