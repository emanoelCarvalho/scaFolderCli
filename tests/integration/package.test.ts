import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

  it('ships its templates', async () => {
    const templates = path.join(path.dirname(path.dirname(installedBin)), 'templates', 'ai');
    const entries = await fs.readdir(templates);
    expect(entries).toContain('ARCHITECTURE.md.eta');
  });

  it('does not ship development files', async () => {
    const root = path.dirname(path.dirname(installedBin));
    const entries = await fs.readdir(root);
    expect(entries).not.toContain('src');
    expect(entries).not.toContain('tests');
    expect(entries).not.toContain('tsconfig.json');
  });
});
