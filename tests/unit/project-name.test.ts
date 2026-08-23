import { describe, expect, it } from 'vitest';
import {
  checkProjectName,
  directoryNameFor,
  resolveTargetDir,
  suggestProjectName,
} from '../../src/util/project-name.js';

describe('checkProjectName', () => {
  it.each(['my-api', 'app', 'a', 'my.app', 'my_app', '@acme/billing-api'])('accepts %s', (name) => {
    expect(checkProjectName(name).valid).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['My-App', 'uppercase'],
    ['.hidden', 'leading dot'],
    ['_private', 'leading underscore'],
    ['my app', 'whitespace'],
    ['my/app', 'unscoped slash'],
    ['node_modules', 'reserved npm name'],
    ['con', 'reserved on Windows'],
    ['lpt1', 'reserved on Windows'],
    ['@acme/', 'incomplete scope'],
    ['a'.repeat(215), 'too long'],
  ])('rejects %s (%s)', (name) => {
    const result = checkProjectName(name);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('rejects a scoped name whose directory part is reserved', () => {
    expect(checkProjectName('@acme/nul').valid).toBe(false);
  });
});

describe('directoryNameFor', () => {
  it('strips the scope', () => {
    expect(directoryNameFor('@acme/billing-api')).toBe('billing-api');
  });

  it('passes unscoped names through', () => {
    expect(directoryNameFor('billing-api')).toBe('billing-api');
  });
});

describe('resolveTargetDir', () => {
  it('defaults to the directory name under cwd', () => {
    expect(resolveTargetDir('@acme/api', '/work')).toBe('/work/api');
  });

  it('honours an explicit directory', () => {
    expect(resolveTargetDir('api', '/work', 'services/api')).toBe('/work/services/api');
  });

  it('supports scaffolding into the current directory', () => {
    expect(resolveTargetDir('api', '/work', '.')).toBe('/work');
  });
});

describe('suggestProjectName', () => {
  it('derives a valid name from a folder', () => {
    expect(suggestProjectName('/work/My Project')).toBe('my-project');
  });

  it('falls back to app when nothing usable remains', () => {
    expect(suggestProjectName('/work/___')).toBe('app');
  });
});
