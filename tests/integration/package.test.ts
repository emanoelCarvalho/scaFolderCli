import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listFiles } from '../../src/fs/files.js';
import { runCommand } from '../../src/process/exec.js';

/**
 * Proves the *published artifact* works, not just the repository. A tool that
 * passes its own tests but ships a tarball missing its templates is broken.
 */
const packageRoot = path.resolve(import.meta.dirname, '../..');

let workspace: string;
let installedBin: string;

beforeAll(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'scafolder-pack-'));

  // `npm pack` triggers `prepack`, which cleans and rebuilds.
  const { stdout } = await runCommand('npm', ['pack', '--pack-destination', workspace], {
    cwd: packageRoot,
    timeout: 300_000,
  });
  const tarball = path.join(workspace, stdout.trim().split('\n').at(-1) ?? '');

  const consumer = path.join(workspace, 'consumer');
  await fs.mkdir(consumer, { recursive: true });
  await fs.writeFile(
    path.join(consumer, 'package.json'),
    JSON.stringify({ name: 'consumer', version: '1.0.0', private: true }),
  );
  await runCommand('npm', ['install', tarball, '--no-audit', '--no-fund'], {
    cwd: consumer,
    timeout: 300_000,
  });

  installedBin = path.join(consumer, 'node_modules', 'scafoldercli', 'dist', 'cli.js');
}, 360_000);

afterAll(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe('published package', () => {
  it('installs and exposes a working bin', async () => {
    const { stdout } = await runCommand(process.execPath, [installedBin, '--version']);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('runs without any file from the repository being present', async () => {
    const { stdout } = await runCommand(process.execPath, [installedBin, 'list']);
    expect(stdout).toContain('Frameworks');
    expect(stdout).toContain('Presets');
  });

  it('ships every template the generators need', async () => {
    const root = path.dirname(path.dirname(installedBin));
    const templates = path.join(root, 'templates');

    expect(await fs.readdir(path.join(templates, 'ai'))).toContain('ARCHITECTURE.md.eta');

    // The published tarball must carry the whole template tree, not just the
    // top level: a missing layer only surfaces when a user runs `create`.
    const packaged = await listFiles(templates);
    const source = await listFiles(path.resolve(packageRoot, 'templates'));
    expect(packaged).toEqual(source);
  });

  it('generates a real project from the installed package', async () => {
    const target = path.join(workspace, 'from-tarball');
    await fs.mkdir(target, { recursive: true });

    // --dry-run so the check stays fast: it proves template resolution works
    // from inside node_modules, which is the failure this test exists for.
    const { stdout } = await runCommand(
      process.execPath,
      [installedBin, 'create', 'tarball-api', '--yes', '--preset', 'nestjs-api', '--dry-run'],
      { cwd: target, timeout: 120_000 },
    );

    expect(stdout).toContain('src/modules/auth/auth.service.ts');
    expect(stdout).toContain('Dockerfile');
    expect(stdout).toContain('ARCHITECTURE.md');
  });

  it('does not ship development files', async () => {
    const root = path.dirname(path.dirname(installedBin));
    const entries = await fs.readdir(root);
    expect(entries).not.toContain('src');
    expect(entries).not.toContain('tests');
    expect(entries).not.toContain('tsconfig.json');
  });
});
