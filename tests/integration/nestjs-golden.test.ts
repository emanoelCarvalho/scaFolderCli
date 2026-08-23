import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateProject } from '../../src/generator/pipeline.js';
import { clearGenerators, registerGenerator } from '../../src/generator/registry.js';
import { nestjsGenerator } from '../../src/generator/frameworks/nestjs/index.js';
import { parseProjectConfig } from '../../src/config/schema.js';
import { commandExists, runCommand } from '../../src/process/exec.js';
import { MemoryLogger } from '../../src/util/logger.js';

/**
 * The golden project: the contract for the NestJS path.
 *
 * Testing the CLI alone would be the central mistake — the product is the
 * project it produces. This generates the reference configuration for real and
 * proves it installs, lints, tests and builds. If it breaks, work stops.
 */
const TIMEOUT = 15 * 60_000;

let projectDir: string;
let workspace: string;

/**
 * Resolved at collection time so the Docker test can be reported as skipped
 * rather than passing without building anything. Having the CLI is not enough;
 * the daemon has to be reachable.
 */
const dockerAvailable = await isDockerRunning();

beforeAll(async () => {
  clearGenerators();
  registerGenerator(nestjsGenerator);

  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'scafolder-golden-'));
  projectDir = path.join(workspace, 'golden-api');

  const config = parseProjectConfig({
    projectName: 'golden-api',
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
  });

  await generateProject(
    {
      config,
      targetDir: projectDir,
      install: true,
      git: false,
      dryRun: false,
      force: false,
    },
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

describe('golden project — NestJS + PostgreSQL + Prisma + JWT + repository + Vitest + Docker', () => {
  it('installs its dependencies', { timeout: TIMEOUT }, async () => {
    // `install: true` above already ran the install; this asserts the result.
    await expect(fs.access(path.join(projectDir, 'node_modules'))).resolves.toBeUndefined();
  });

  it('generates the Prisma client during finalize', { timeout: TIMEOUT }, async () => {
    await expect(
      fs.access(path.join(projectDir, 'node_modules', '.prisma', 'client')),
    ).resolves.toBeUndefined();
  });

  it('passes its own lint with no errors', { timeout: TIMEOUT }, async () => {
    // Without --fix, so a formatting regression in a template fails here.
    await expect(
      runCommand('npx', ['eslint', '{src,apps,libs,test}/**/*.ts'], {
        cwd: projectDir,
        timeout: TIMEOUT,
      }),
    ).resolves.toBeTruthy();
  });

  it('passes its own test suite', { timeout: TIMEOUT }, async () => {
    const output = await npm(['test']);
    expect(output).not.toMatch(/\bfailed\b/i);
  });

  it('builds to dist/main.js, where start:prod and the Dockerfile expect it', async () => {
    await npm(['run', 'build']);
    await expect(fs.access(path.join(projectDir, 'dist', 'main.js'))).resolves.toBeUndefined();
  });

  it('ships a committed .env.example with placeholders only', async () => {
    const example = await fs.readFile(path.join(projectDir, '.env.example'), 'utf8');
    expect(example).toContain('JWT_ACCESS_SECRET=replace-me');
  });

  it('writes a local .env with a generated secret, and gitignores it', async () => {
    const env = await fs.readFile(path.join(projectDir, '.env'), 'utf8');
    expect(env).not.toContain('replace-me');

    const secret = /JWT_ACCESS_SECRET=(.+)/.exec(env)?.[1]?.trim() ?? '';
    expect(secret.length).toBeGreaterThanOrEqual(32);

    const gitignore = await fs.readFile(path.join(projectDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.env');
  });

  it('contains no absolute path from the machine that generated it', async () => {
    for (const relative of ['Dockerfile', 'docker-compose.yml', 'package.json', 'README.md']) {
      const content = await fs.readFile(path.join(projectDir, relative), 'utf8');
      expect(content, relative).not.toContain(os.homedir());
    }
  });

  it.skipIf(!dockerAvailable)('builds a Docker image', { timeout: TIMEOUT }, async () => {
    await runCommand('docker', ['build', '-t', 'scafoldercli-golden:test', '.'], {
      cwd: projectDir,
      timeout: TIMEOUT,
    });

    const { stdout } = await runCommand('docker', [
      'image',
      'inspect',
      'scafoldercli-golden:test',
      '--format',
      '{{.Config.User}}',
    ]);
    expect(stdout.trim()).toBe('node');

    await runCommand('docker', ['image', 'rm', '-f', 'scafoldercli-golden:test']).catch(
      () => undefined,
    );
  });
});
