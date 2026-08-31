import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FrameworkGenerator } from '../../src/generator/contract.js';
import { generateProject } from '../../src/generator/pipeline.js';
import { clearGenerators, registerGenerator } from '../../src/generator/registry.js';
import type { GenerationRequest, ProjectConfig } from '../../src/config/schema.js';
import { MemoryLogger } from '../../src/util/logger.js';
import { listFiles } from '../../src/fs/files.js';

const config: ProjectConfig = {
  projectName: 'my-api',
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
};

interface Recorded {
  calls: string[];
}

function fakeGenerator(recorded: Recorded, overrides: Partial<FrameworkGenerator> = {}) {
  const generator: FrameworkGenerator = {
    framework: 'nestjs',
    async validate() {
      recorded.calls.push('validate');
    },
    async initialize(context) {
      recorded.calls.push('initialize');
      // Mimics an official CLI writing straight to disk.
      await fs.mkdir(context.targetDir, { recursive: true });
      await fs.writeFile(
        path.join(context.targetDir, 'package.json'),
        JSON.stringify({ name: context.config.projectName, scripts: { build: 'tsc' } }),
      );
    },
    async generate(context) {
      recorded.calls.push('generate');
      context.files.write('src/main.ts', `// ${context.config.projectName}`);
      await context.files.mergeJson('package.json', { scripts: { test: 'vitest run' } });
    },
    documentation() {
      return {
        summary: 'A test project.',
        directoryLayout: 'src/\n  main.ts',
        layers: [
          {
            name: 'Modules',
            path: 'src/modules',
            responsibility: 'Features.',
            mayDependOn: ['shared'],
          },
        ],
        dependencyRules: ['Modules must not import each other.'],
        conventions: ['Files are kebab-case.'],
        commands: [{ label: 'Test', command: 'npm test' }],
        agentRules: ['Do not touch the Dockerfile.'],
        addFeatureSteps: ['Create a module.', 'Register it.'],
      };
    },
    async finalize() {
      recorded.calls.push('finalize');
    },
    describePlan() {
      return ['Scaffold with the fake generator'];
    },
    nextSteps() {
      return ['cd my-api'];
    },
    ...overrides,
  };
  return generator;
}

let workspace: string;
let recorded: Recorded;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'scafolder-pipeline-'));
  recorded = { calls: [] };
  clearGenerators();
});

afterEach(async () => {
  clearGenerators();
  await fs.rm(workspace, { recursive: true, force: true });
});

function request(overrides: Partial<GenerationRequest> = {}): GenerationRequest {
  return {
    config,
    targetDir: path.join(workspace, 'my-api'),
    install: false,
    git: false,
    dryRun: false,
    force: false,
    ...overrides,
  };
}

describe('generateProject', () => {
  it('runs the lifecycle in order and writes the composed project', async () => {
    registerGenerator(fakeGenerator(recorded));
    const result = await generateProject(request(), { logger: new MemoryLogger() });

    expect(recorded.calls).toEqual(['validate', 'initialize', 'generate', 'finalize']);

    const written = await listFiles(result.targetDir);
    expect(written).toContain('src/main.ts');
    expect(written).toContain('ARCHITECTURE.md');
    expect(written).toContain('CONVENTIONS.md');
    expect(written).toContain('AGENTS.md');

    const pkg = JSON.parse(await fs.readFile(path.join(result.targetDir, 'package.json'), 'utf8'));
    expect(pkg.scripts).toEqual({ build: 'tsc', test: 'vitest run' });
  });

  it('renders documentation from the generator facts, not from a generic template', async () => {
    registerGenerator(fakeGenerator(recorded));
    const result = await generateProject(request(), { logger: new MemoryLogger() });

    const architecture = await fs.readFile(path.join(result.targetDir, 'ARCHITECTURE.md'), 'utf8');
    expect(architecture).toContain('A test project.');
    expect(architecture).toContain('Modules must not import each other.');
    expect(architecture).toContain('| Framework | nestjs |');

    const agents = await fs.readFile(path.join(result.targetDir, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('Do not touch the Dockerfile.');
    expect(agents).toContain('Do not import prisma outside the infrastructure layer.');
  });

  it('omits documentation when it was not requested', async () => {
    registerGenerator(fakeGenerator(recorded));
    const result = await generateProject(
      request({ config: { ...config, aiDocumentation: false } }),
      { logger: new MemoryLogger() },
    );
    expect(await listFiles(result.targetDir)).not.toContain('ARCHITECTURE.md');
  });

  it('writes nothing and skips the external scaffolder in dry-run mode', async () => {
    registerGenerator(fakeGenerator(recorded));
    const result = await generateProject(request({ dryRun: true }), {
      logger: new MemoryLogger(),
    });

    expect(recorded.calls).toEqual(['validate', 'generate']);
    expect(result.dryRun).toBe(true);
    expect(result.writtenFiles).toContain('src/main.ts');
    await expect(fs.access(result.targetDir)).rejects.toThrow();
  });

  it('rejects an incompatible configuration before touching the filesystem', async () => {
    registerGenerator(fakeGenerator(recorded));
    await expect(
      generateProject(request({ config: { ...config, orm: 'mongoose' } }), {
        logger: new MemoryLogger(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_COMBINATION' });
    expect(recorded.calls).toEqual([]);
  });

  it('refuses to write into a non-empty directory', async () => {
    registerGenerator(fakeGenerator(recorded));
    const targetDir = path.join(workspace, 'my-api');
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, 'existing.txt'), 'x');

    await expect(
      generateProject(request({ targetDir }), { logger: new MemoryLogger() }),
    ).rejects.toMatchObject({ code: 'TARGET_NOT_EMPTY' });
  });

  it('writes into a non-empty directory when forced', async () => {
    registerGenerator(fakeGenerator(recorded));
    const targetDir = path.join(workspace, 'my-api');
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, 'existing.txt'), 'x');

    const result = await generateProject(request({ targetDir, force: true }), {
      logger: new MemoryLogger(),
    });
    expect(await listFiles(result.targetDir)).toContain('existing.txt');
  });

  it('ignores a pre-existing .git directory when checking emptiness', async () => {
    registerGenerator(fakeGenerator(recorded));
    const targetDir = path.join(workspace, 'my-api');
    await fs.mkdir(path.join(targetDir, '.git'), { recursive: true });

    await expect(
      generateProject(request({ targetDir }), { logger: new MemoryLogger() }),
    ).resolves.toBeTruthy();
  });

  it('removes a directory it created when generation fails', async () => {
    registerGenerator(
      fakeGenerator(recorded, {
        async generate() {
          throw new Error('boom');
        },
      }),
    );
    const targetDir = path.join(workspace, 'my-api');
    await expect(
      generateProject(request({ targetDir }), { logger: new MemoryLogger() }),
    ).rejects.toThrow('boom');
    await expect(fs.access(targetDir)).rejects.toThrow();
  });

  it('keeps a pre-existing directory when generation fails', async () => {
    registerGenerator(
      fakeGenerator(recorded, {
        async generate() {
          throw new Error('boom');
        },
      }),
    );
    const targetDir = path.join(workspace, 'my-api');
    await fs.mkdir(targetDir, { recursive: true });

    await expect(
      generateProject(request({ targetDir }), { logger: new MemoryLogger() }),
    ).rejects.toThrow('boom');
    await expect(fs.access(targetDir)).resolves.toBeUndefined();
  });

  it('reports a clear error when the framework has no generator', async () => {
    await expect(generateProject(request(), { logger: new MemoryLogger() })).rejects.toMatchObject({
      code: 'GENERATOR_NOT_FOUND',
    });
  });
});

describe('AI documentation and framework-owned files', () => {
  it('appends to files the framework CLI already wrote, instead of replacing them', async () => {
    registerGenerator(
      fakeGenerator(recorded, {
        async initialize(context) {
          await fs.mkdir(context.targetDir, { recursive: true });
          // Next.js writes a managed block here and re-inserts it on every run.
          await fs.writeFile(
            path.join(context.targetDir, 'AGENTS.md'),
            '<!-- BEGIN:framework-rules -->\nFramework instructions.\n<!-- END:framework-rules -->\n',
          );
          // A framework .gitignore carries entries our shared one knows nothing
          // about; losing them would commit the build output.
          await fs.writeFile(path.join(context.targetDir, '.gitignore'), '/.next/\n.vercel\n');
          await fs.writeFile(
            path.join(context.targetDir, 'package.json'),
            JSON.stringify({ name: 'my-api' }),
          );
        },
        async generate(context) {
          context.files.write('src/main.ts', '// x');
          context.files.write('.gitignore', 'node_modules/\n.env\n!.env.example\n');
          await context.files.mergeJson('package.json', { scripts: { test: 'vitest run' } });
        },
      }),
    );

    const result = await generateProject(request(), { logger: new MemoryLogger() });
    const agents = await fs.readFile(path.join(result.targetDir, 'AGENTS.md'), 'utf8');
    const gitignore = await fs.readFile(path.join(result.targetDir, '.gitignore'), 'utf8');

    expect(gitignore).toContain('/.next/');
    expect(gitignore).toContain('.vercel');
    expect(gitignore).toContain('node_modules/');
    // Ours comes last, so a negation of ours overrides an earlier pattern.
    expect(gitignore.indexOf('.vercel')).toBeLessThan(gitignore.indexOf('!.env.example'));

    expect(agents).toContain('<!-- BEGIN:framework-rules -->');
    expect(agents).toContain('Framework instructions.');
    // Ours follows, so both sets of rules survive.
    expect(agents).toContain('Do not touch the Dockerfile.');
    expect(agents.indexOf('Framework instructions.')).toBeLessThan(
      agents.indexOf('Do not touch the Dockerfile.'),
    );
  });

  it('writes AGENTS.md normally when the framework left none', async () => {
    registerGenerator(fakeGenerator(recorded));
    const result = await generateProject(request(), { logger: new MemoryLogger() });
    const agents = await fs.readFile(path.join(result.targetDir, 'AGENTS.md'), 'utf8');

    expect(agents.startsWith('# Agents')).toBe(true);
  });
});
