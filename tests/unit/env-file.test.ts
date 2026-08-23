import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectFiles } from '../../src/fs/project-files.js';
import { writeLocalEnvFile } from '../../src/generator/env-file.js';

function render(example: string): string {
  const files = new ProjectFiles(path.join(os.tmpdir(), 'scafolder-env'), { dryRun: true });
  writeLocalEnvFile(files, example);
  return files.plannedContents().get('.env') ?? '';
}

describe('writeLocalEnvFile', () => {
  it('replaces a placeholder secret with a generated value', () => {
    const result = render('JWT_ACCESS_SECRET=replace-me-with-a-long-random-value\n');

    expect(result).not.toContain('replace-me');
    const value = result.split('=')[1]?.trim() ?? '';
    expect(value.length).toBeGreaterThanOrEqual(32);
  });

  it('generates a different secret every time', () => {
    const example = 'JWT_ACCESS_SECRET=replace-me-now\n';
    expect(render(example)).not.toBe(render(example));
  });

  it('leaves every other variable untouched', () => {
    const example = [
      '# A comment',
      'NODE_ENV=development',
      'PORT=3000',
      'DATABASE_URL=postgresql://app:app@localhost:5432/app?schema=public',
      'JWT_ACCESS_SECRET=replace-me-with-a-long-random-value',
      'JWT_ACCESS_TTL=15m',
      '',
    ].join('\n');

    const result = render(example);

    expect(result).toContain('# A comment');
    expect(result).toContain('NODE_ENV=development');
    expect(result).toContain('DATABASE_URL=postgresql://app:app@localhost:5432/app?schema=public');
    expect(result).toContain('JWT_ACCESS_TTL=15m');
  });

  it('replaces every placeholder, not just the first', () => {
    const result = render('A_SECRET=replace-me-one\nB_KEY=replace-me-two\n');
    expect(result).not.toContain('replace-me');
  });

  it('produces a URL-safe secret, so quoting is never needed', () => {
    const value = render('JWT_ACCESS_SECRET=replace-me\n').split('=')[1]?.trim() ?? '';
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('ignores a variable that is not a secret', () => {
    expect(render('SOME_URL=replace-me-later\n')).toContain('SOME_URL=replace-me-later');
  });
});
