import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseProjectConfig } from '../../src/config/schema.js';
import { nextjsGenerator } from '../../src/generator/frameworks/nextjs/index.js';
import { generateProject } from '../../src/generator/pipeline.js';
import { clearGenerators, registerGenerator } from '../../src/generator/registry.js';
import { commandExists, runCommand } from '../../src/process/exec.js';
import { MemoryLogger } from '../../src/util/logger.js';

/**
 * The golden project for the Next.js path.
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
  registerGenerator(nextjsGenerator);

  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'scafolder-nextjs-golden-'));
  projectDir = path.join(workspace, 'web-client');

  const config = parseProjectConfig({
    projectName: 'web-client',
    framework: 'nextjs',
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

describe('golden project — Next.js + JWT (BFF) + Vitest + Docker', () => {
  it('installs its dependencies', { timeout: TIMEOUT }, async () => {
    await expect(fs.access(path.join(projectDir, 'node_modules'))).resolves.toBeUndefined();
  });

  it('type-checks', { timeout: TIMEOUT }, async () => {
    await expect(npm(['run', 'typecheck'])).resolves.toBeTruthy();
  });

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

  it('builds every route, including the auth handlers', { timeout: TIMEOUT }, async () => {
    const output = await npm(['run', 'build']);

    for (const route of ['/login', '/register', '/dashboard', '/api/auth/login']) {
      expect(output, route).toContain(route);
    }
  });

  it('keeps the .gitignore create-next-app wrote', async () => {
    const gitignore = await fs.readFile(path.join(projectDir, '.gitignore'), 'utf8');

    // Losing these would commit the build output and the Vercel config.
    expect(gitignore).toContain('/.next/');
    expect(gitignore).toContain('.vercel');
    // Ours is appended, not substituted.
    expect(gitignore).toContain('!.env.example');
  });

  it('keeps the AGENTS.md block Next.js manages, and adds ours', async () => {
    const agents = await fs.readFile(path.join(projectDir, 'AGENTS.md'), 'utf8');

    expect(agents).toContain('nextjs-agent-rules');
    expect(agents).toContain('Operational rules for coding agents');
  });

  it('writes .env.local, which is the file Next.js reads', async () => {
    await expect(fs.access(path.join(projectDir, '.env.local'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(projectDir, '.env'))).rejects.toThrow();
  });

  it('contains no absolute path from the machine that generated it', async () => {
    for (const relative of ['Dockerfile', 'docker-compose.yml', 'package.json', 'README.md']) {
      const content = await fs.readFile(path.join(projectDir, relative), 'utf8');
      expect(content, relative).not.toContain(os.homedir());
    }
  });

  it.skipIf(!dockerAvailable)('builds a Docker image', { timeout: TIMEOUT }, async () => {
    await runCommand('docker', ['build', '-t', 'scafoldercli-nextjs-golden:test', '.'], {
      cwd: projectDir,
      timeout: TIMEOUT,
    });

    const { stdout } = await runCommand('docker', [
      'image',
      'inspect',
      'scafoldercli-nextjs-golden:test',
      '--format',
      '{{.Config.User}}',
    ]);
    expect(stdout.trim()).toBe('node');

    await runCommand('docker', ['image', 'rm', '-f', 'scafoldercli-nextjs-golden:test']).catch(
      () => undefined,
    );
  });
});
