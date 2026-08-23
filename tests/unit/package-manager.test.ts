import { describe, expect, it } from 'vitest';
import {
  ciInstallCommand,
  createPackageManager,
  detectPackageManager,
} from '../../src/process/package-manager.js';
import { PACKAGE_MANAGERS } from '../../src/config/schema.js';

describe('createPackageManager', () => {
  it('exposes the right lockfile for each manager', () => {
    expect(createPackageManager('npm').lockfile).toBe('package-lock.json');
    expect(createPackageManager('pnpm').lockfile).toBe('pnpm-lock.yaml');
    expect(createPackageManager('yarn').lockfile).toBe('yarn.lock');
  });

  it('describes the install command a human would type', () => {
    expect(createPackageManager('pnpm').describe('install')).toBe('pnpm install');
  });
});

describe('ciInstallCommand', () => {
  it('uses a reproducible install for every manager', () => {
    expect(ciInstallCommand('npm')).toBe('npm ci');
    expect(ciInstallCommand('pnpm')).toBe('pnpm install --frozen-lockfile');
    expect(ciInstallCommand('yarn')).toBe('yarn install --immutable');
  });

  it('never falls back to a plain install, which would ignore the lockfile', () => {
    for (const manager of PACKAGE_MANAGERS) {
      expect(ciInstallCommand(manager)).not.toBe(`${manager} install`);
    }
  });
});

describe('detectPackageManager', () => {
  it.each([
    ['pnpm/9.0.0 npm/? node/v22.0.0', 'pnpm'],
    ['yarn/4.1.0 npm/? node/v22.0.0', 'yarn'],
    ['npm/10.5.0 node/v22.0.0', 'npm'],
  ])('detects %s', (userAgent, expected) => {
    expect(detectPackageManager(userAgent)).toBe(expected);
  });

  it('defaults to npm when the user agent is absent', () => {
    expect(detectPackageManager(undefined)).toBe('npm');
  });
});
