import { describe, expect, it } from 'vitest';
import { parseProjectConfig } from '../../src/config/schema.js';
import { PRESETS, findPreset, presetNames } from '../../src/config/presets.js';
import { findIncompatibilities } from '../../src/config/capabilities.js';
import { isScafolderError } from '../../src/util/errors.js';

const valid = {
  projectName: 'my-api',
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
  packageManager: 'npm',
};

describe('parseProjectConfig', () => {
  it('accepts a complete configuration', () => {
    expect(parseProjectConfig(valid).projectName).toBe('my-api');
  });

  it('rejects an unknown enum value with the field path', () => {
    try {
      parseProjectConfig({ ...valid, framework: 'koa' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isScafolderError(error) && error.code).toBe('INVALID_CONFIG');
      expect((error as Error).message).toContain('framework');
    }
  });

  it('surfaces the specific reason a project name is invalid', () => {
    try {
      parseProjectConfig({ ...valid, projectName: 'My-App' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('lowercase');
    }
  });

  it('rejects a missing field rather than defaulting it', () => {
    const { docker: _docker, ...incomplete } = valid;
    expect(() => parseProjectConfig(incomplete)).toThrow();
  });
});

describe('presets', () => {
  it('exposes every preset by name', () => {
    expect(presetNames().sort()).toEqual(Object.keys(PRESETS).sort());
  });

  it('returns undefined for an unknown preset', () => {
    expect(findPreset('nope')).toBeUndefined();
  });

  it('every preset resolves to a valid configuration', () => {
    for (const preset of Object.values(PRESETS)) {
      const config = parseProjectConfig({
        projectName: 'my-app',
        packageManager: 'npm',
        ...preset.config,
      });
      expect(findIncompatibilities(config), preset.name).toEqual([]);
    }
  });

  it('presets never hard-code a project name', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(preset.config.projectName, preset.name).toBeUndefined();
    }
  });
});
