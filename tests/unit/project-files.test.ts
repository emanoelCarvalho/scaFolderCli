import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectFiles, deepMerge, sortObjectKeys } from '../../src/fs/project-files.js';
import { listFiles } from '../../src/fs/files.js';
import { isScafolderError } from '../../src/util/errors.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'scafolder-files-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('ProjectFiles', () => {
  it('buffers writes and applies them on flush', async () => {
    const files = new ProjectFiles(root);
    files.write('src/main.ts', 'export const x = 1;');

    expect(await listFiles(root)).toEqual([]);

    await files.flush();
    expect(await listFiles(root)).toEqual(['src/main.ts']);
  });

  it('writes nothing in dry-run mode but still reports the plan', async () => {
    const files = new ProjectFiles(root, { dryRun: true });
    files.write('a.txt', 'a');
    files.write('b/c.txt', 'c');

    expect(files.plannedWrites()).toEqual(['a.txt', 'b/c.txt']);
    await files.flush();
    expect(await listFiles(root)).toEqual([]);
  });

  it('always terminates files with a newline', async () => {
    const files = new ProjectFiles(root);
    files.write('a.txt', 'no newline');
    await files.flush();
    expect(await fs.readFile(path.join(root, 'a.txt'), 'utf8')).toBe('no newline\n');
  });

  it('reads back buffered content before it is flushed', async () => {
    const files = new ProjectFiles(root);
    files.write('pkg.json', '{"a":1}');
    expect(await files.readJson('pkg.json')).toEqual({ a: 1 });
  });

  it('falls through to disk for files written by an external scaffolder', async () => {
    await fs.writeFile(path.join(root, 'package.json'), '{"name":"external"}');
    const files = new ProjectFiles(root);
    expect(await files.readJson('package.json')).toEqual({ name: 'external' });
  });

  it('merges into a file produced by an external scaffolder', async () => {
    await fs.writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'external', scripts: { build: 'tsc' } }),
    );
    const files = new ProjectFiles(root);
    await files.mergeJson('package.json', { scripts: { test: 'vitest run' } });
    await files.flush();

    const merged = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    expect(merged).toEqual({ name: 'external', scripts: { build: 'tsc', test: 'vitest run' } });
  });

  it('creates the file when merging into something that does not exist', async () => {
    const files = new ProjectFiles(root);
    await files.mergeJson('tsconfig.json', { compilerOptions: { strict: true } });
    await files.flush();
    expect(JSON.parse(await fs.readFile(path.join(root, 'tsconfig.json'), 'utf8'))).toEqual({
      compilerOptions: { strict: true },
    });
  });

  it('deletes files created by an external scaffolder', async () => {
    await fs.writeFile(path.join(root, 'remove-me.txt'), 'x');
    const files = new ProjectFiles(root);
    files.delete('remove-me.txt');
    expect(files.plannedDeletions()).toEqual(['remove-me.txt']);
    await files.flush();
    expect(await listFiles(root)).toEqual([]);
  });

  it('lets a later write win over an earlier one, which is how layers override', async () => {
    const files = new ProjectFiles(root);
    files.write('a.txt', 'base');
    files.write('a.txt', 'override');
    await files.flush();
    expect(await fs.readFile(path.join(root, 'a.txt'), 'utf8')).toBe('override\n');
  });

  it('refuses to write outside the project directory', () => {
    const files = new ProjectFiles(root);
    expect(() => files.write('../escape.txt', 'x')).toThrow();
    try {
      files.write('../escape.txt', 'x');
    } catch (error) {
      expect(isScafolderError(error) && error.code).toBe('INTERNAL');
    }
  });

  it('refuses absolute paths', () => {
    const files = new ProjectFiles(root);
    expect(() => files.write('/etc/passwd', 'x')).toThrow();
  });
});

describe('deepMerge', () => {
  it('merges nested objects key by key', () => {
    expect(deepMerge({ a: { b: 1, c: 2 } }, { a: { c: 3, d: 4 } })).toEqual({
      a: { b: 1, c: 3, d: 4 },
    });
  });

  it('replaces arrays instead of concatenating them', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] });
  });

  it('does not mutate its inputs', () => {
    const base = { a: { b: 1 } };
    deepMerge(base, { a: { c: 2 } });
    expect(base).toEqual({ a: { b: 1 } });
  });
});

describe('sortObjectKeys', () => {
  it('sorts keys so generated manifests are reproducible', () => {
    expect(Object.keys(sortObjectKeys({ zod: '1', eta: '2', commander: '3' }))).toEqual([
      'commander',
      'eta',
      'zod',
    ]);
  });
});

describe('JSON formatting', () => {
  async function write(value: Record<string, unknown>): Promise<string> {
    const files = new ProjectFiles(root);
    files.writeJson('out.json', value as never);
    return (await files.read('out.json')) ?? '';
  }

  it('keeps a short array of primitives on one line, as Prettier does', async () => {
    expect(await write({ lib: ['dom', 'dom.iterable', 'esnext'] })).toContain(
      '"lib": ["dom", "dom.iterable", "esnext"]',
    );
  });

  it('collapses a nested short array too', async () => {
    const result = await write({ compilerOptions: { paths: { '@/*': ['./src/*'] } } });
    expect(result).toContain('"@/*": ["./src/*"]');
  });

  it('leaves a long array expanded', async () => {
    const long = Array.from({ length: 12 }, (_, i) => `a-fairly-long-entry-number-${i}`);
    const result = await write({ files: long });

    expect(result).not.toContain('"files": ["a-fairly-long-entry-number-0"');
    expect(result).toContain('\n    "a-fairly-long-entry-number-0",');
  });

  it('leaves an array of objects expanded', async () => {
    const result = await write({ plugins: [{ name: 'next' }] });
    expect(result).toContain('"plugins": [\n');
  });

  it('still produces valid JSON', async () => {
    const value = {
      name: 'x',
      lib: ['a', 'b'],
      nested: { deep: { list: [1, 2, 3], flag: true } },
      plugins: [{ name: 'next' }],
    };
    expect(JSON.parse(await write(value))).toEqual(value);
  });

  it('round-trips an empty array', async () => {
    expect(JSON.parse(await write({ items: [] }))).toEqual({ items: [] });
  });
});
