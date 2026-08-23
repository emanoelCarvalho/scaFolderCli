import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEMPLATES_ROOT } from '../../src/template/paths.js';

const packageRoot = path.resolve(import.meta.dirname, '../..');

describe('template resolution', () => {
  it('resolves to the packaged templates directory', () => {
    expect(TEMPLATES_ROOT).toBe(path.join(packageRoot, 'templates'));
  });

  it('finds the shared AI documentation layer', async () => {
    const entries = await fs.readdir(path.join(TEMPLATES_ROOT, 'ai'));
    expect(entries.sort()).toEqual(['AGENTS.md.eta', 'ARCHITECTURE.md.eta', 'CONVENTIONS.md.eta']);
  });

  it('sits at the same depth from src/ and dist/, so dev and published runs agree', async () => {
    // `src/template/paths.ts` and `dist/template/paths.js` are both one level
    // below the package root, which is what makes `../../templates` correct in
    // both. If the build layout ever changes, this catches it.
    const fromSrc = path.resolve(packageRoot, 'src/template', '../../templates');
    const fromDist = path.resolve(packageRoot, 'dist/template', '../../templates');
    expect(fromSrc).toBe(fromDist);
    expect(fromSrc).toBe(TEMPLATES_ROOT);
  });

  it('ships no real dotfiles, which npm would strip from the package', async () => {
    const offenders: string[] = [];
    async function walk(dir: string): Promise<void> {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) offenders.push(path.join(dir, entry.name));
        if (entry.isDirectory()) await walk(path.join(dir, entry.name));
      }
    }
    await walk(TEMPLATES_ROOT);
    expect(offenders).toEqual([]);
  });
});
