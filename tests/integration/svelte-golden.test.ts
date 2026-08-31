import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseProjectConfig } from '../../src/config/schema.js';
import { svelteGenerator } from '../../src/generator/frameworks/svelte/index.js';
import { generateProject } from '../../src/generator/pipeline.js';
import { clearGenerators, registerGenerator } from '../../src/generator/registry.js';
import { commandExists, runCommand } from '../../src/process/exec.js';
import { MemoryLogger } from '../../src/util/logger.js';

/**
 * The golden project for the SvelteKit path.
 *
 * Testing the CLI alone would be the central mistake — the product is the
 * project it produces. This generates the reference configuration for real and
 * proves it installs, type-checks, lints, tests and builds.
 */
const TIMEOUT = 20 * 60_000;

let projectDir: string;
let workspace: string;

const dockerAvailable = await isDockerRunning();

beforeAll(async () => {
  clearGenerators();
  registerGenerator(svelteGenerator);

  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'scafolder-svelte-golden-'));
  projectDir = path.join(workspace, 'svelte-client');

  const config = parseProjectConfig({
    projectName: 'svelte-client',
    framework: 'svelte',
    projectType: 'web',
    architecture: 'modular',
    database: 'none',
    orm: 'none',
    authentication: 'jwt',
    repositoryPattern: false,
    testing: 'vitest',
    docker: true,
    aiDocumentation: true,
    packageManager: 'npm',
  });

  await generateProject(
    { config, targetDir: projectDir, install: true, git: false, dryRun: false, force: false },
    { logger: new MemoryLogger() },
  );
}, TIMEOUT);

afterAll(async () => {
  clearGenerators();
  await fs.rm(workspace, { recursive: true, force: true });
});

async function npm(args: string[]): Promise<string> {
  const { stdout, stderr } = await runCommand('npm', args, {
    cwd: projectDir,
    timeout: TIMEOUT,
    // The production build needs a value; the real URL arrives at run time.
    env: { API_URL: 'http://localhost:3000' },
  });
  return stdout + stderr;
}

async function isDockerRunning(): Promise<boolean> {
  if (!(await commandExists('docker'))) return false;
  try {
    await runCommand('docker', ['info'], { timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

describe('golden project — SvelteKit + JWT (server actions) + Vitest + Docker', () => {
  it('installs its dependencies', { timeout: TIMEOUT }, async () => {
    await expect(fs.access(path.join(projectDir, 'node_modules'))).resolves.toBeUndefined();
  });

  it(
    'type-checks, with svelte-check warnings treated as failures',
    { timeout: TIMEOUT },
    async () => {
      await expect(npm(['run', 'typecheck'])).resolves.toBeTruthy();
    },
  );

  it('passes its own lint with no errors', { timeout: TIMEOUT }, async () => {
    await expect(npm(['run', 'lint'])).resolves.toBeTruthy();
  });

  it('passes its own format check', { timeout: TIMEOUT }, async () => {
    await expect(npm(['run', 'format:check'])).resolves.toBeTruthy();
  });

  it('passes its own test suite', { timeout: TIMEOUT }, async () => {
    const output = await npm(['test']);
    expect(output).not.toMatch(/\bfailed\b/i);
  });

  it('builds to the Node adapter output that start and the Dockerfile expect', async () => {
    await npm(['run', 'build']);
    await expect(fs.access(path.join(projectDir, 'build', 'index.js'))).resolves.toBeUndefined();
  });

  it('keeps the .gitignore `sv create` wrote', async () => {
    const gitignore = await fs.readFile(path.join(projectDir, '.gitignore'), 'utf8');

    // Losing these would commit the build output.
    expect(gitignore).toContain('.svelte-kit');
    // Ours is appended, not substituted.
    expect(gitignore).toContain('!.env.example');
  });

  it('writes our AGENTS.md', async () => {
    const agents = await fs.readFile(path.join(projectDir, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('Operational rules for coding agents');
  });

  it('writes a .env carrying the port and origin the Node adapter needs', async () => {
    const env = await fs.readFile(path.join(projectDir, '.env'), 'utf8');

    // Without these, `npm start` binds to 3000 — where the API runs — and
    // rejects form posts whose origin it cannot verify.
    expect(env).toContain('PORT=3001');
    expect(env).toContain('ORIGIN=http://localhost:3001');
  });

  it('contains no absolute path from the machine that generated it', async () => {
    for (const relative of ['Dockerfile', 'docker-compose.yml', 'package.json', 'README.md']) {
      const content = await fs.readFile(path.join(projectDir, relative), 'utf8');
      expect(content, relative).not.toContain(os.homedir());
    }
  });

  it.skipIf(!dockerAvailable)('builds a Docker image', { timeout: TIMEOUT }, async () => {
    await runCommand('docker', ['build', '-t', 'scafoldercli-svelte-golden:test', '.'], {
      cwd: projectDir,
      timeout: TIMEOUT,
    });

    const { stdout } = await runCommand('docker', [
      'image',
      'inspect',
      'scafoldercli-svelte-golden:test',
      '--format',
      '{{.Config.User}}',
    ]);
    expect(stdout.trim()).toBe('node');

    await runCommand('docker', ['image', 'rm', '-f', 'scafoldercli-svelte-golden:test']).catch(
      () => undefined,
    );
  });
});
