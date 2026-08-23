import os from 'node:os';
import path from 'node:path';
import prettier from 'prettier';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  GenerationRequest,
  PartialProjectConfig,
  ProjectConfig,
} from '../../src/config/schema.js';
import { parseProjectConfig } from '../../src/config/schema.js';
import { generateProject, type GenerationResult } from '../../src/generator/pipeline.js';
import { clearGenerators, registerGenerator } from '../../src/generator/registry.js';
import { nestjsGenerator } from '../../src/generator/frameworks/nestjs/index.js';
import { MemoryLogger } from '../../src/util/logger.js';

/**
 * These tests render the real templates in dry-run mode. No install, no network,
 * no disk — so template regressions surface in milliseconds instead of only in
 * the golden-project smoke test.
 */
const GOLDEN: ProjectConfig = parseProjectConfig({
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

async function render(overrides: PartialProjectConfig = {}): Promise<GenerationResult> {
  const config = parseProjectConfig({ ...GOLDEN, ...overrides });
  const request: GenerationRequest = {
    config,
    targetDir: path.join(os.tmpdir(), 'scafolder-render', config.projectName),
    install: false,
    git: false,
    dryRun: true,
    force: false,
  };
  return generateProject(request, { logger: new MemoryLogger() });
}

beforeEach(() => {
  clearGenerators();
  registerGenerator(nestjsGenerator);
});

describe('nestjs generator — golden path', () => {
  it('renders the expected project shape', async () => {
    const { writtenFiles } = await render();

    for (const expected of [
      'src/main.ts',
      'src/app.module.ts',
      'src/config/env.ts',
      'src/database/prisma.service.ts',
      'src/shared/errors/domain-error.ts',
      'src/shared/http/domain-exception.filter.ts',
      'src/modules/health/health.controller.ts',
      'src/modules/users/users.service.ts',
      'src/modules/users/users.repository.ts',
      'src/modules/users/infrastructure/prisma-users.repository.ts',
      'src/modules/auth/auth.controller.ts',
      'src/modules/auth/auth.service.ts',
      'src/modules/auth/tokens.service.ts',
      'src/modules/auth/jwt-auth.guard.ts',
      'src/modules/auth/refresh-token.repository.ts',
      'prisma/schema.prisma',
      'prisma.config.ts',
      'Dockerfile',
      'docker-compose.yml',
      '.dockerignore',
      '.gitignore',
      '.editorconfig',
      '.env.example',
      'vitest.config.mts',
      'ARCHITECTURE.md',
      'CONVENTIONS.md',
      'AGENTS.md',
    ]) {
      expect(writtenFiles, expected).toContain(expected);
    }
  });

  it("produces Prettier-clean TypeScript, matching the project's own config", async () => {
    const { renderedFiles } = await render();
    const options = {
      parser: 'typescript' as const,
      singleQuote: true,
      trailingComma: 'all' as const,
      printWidth: 100,
    };

    const unformatted: string[] = [];
    for (const [file, content] of renderedFiles) {
      if (!file.endsWith('.ts') && !file.endsWith('.mts')) continue;
      if (!(await prettier.check(content, { ...options, filepath: file }))) unformatted.push(file);
    }

    expect(unformatted).toEqual([]);
  });

  it('keeps placeholders in .env.example and a generated secret in .env', async () => {
    const { writtenFiles, renderedFiles } = await render();

    expect(writtenFiles).toContain('.env.example');
    expect(writtenFiles).toContain('.env');

    const example = renderedFiles.get('.env.example') ?? '';
    expect(example).toContain('JWT_ACCESS_SECRET=replace-me');

    const env = renderedFiles.get('.env') ?? '';
    expect(env).not.toContain('replace-me');
    expect(renderedFiles.get('.gitignore')).toContain('.env');

    for (const [file, content] of renderedFiles) {
      expect(content, `${file} must not embed a generator-side absolute path`).not.toContain(
        '/Users/',
      );
    }
  });

  it('documents the configuration that was actually generated', async () => {
    const { renderedFiles } = await render();
    const architecture = renderedFiles.get('ARCHITECTURE.md') ?? '';

    expect(architecture).toContain('| Database | postgresql |');
    expect(architecture).toContain('| Repository pattern | enabled |');
    expect(architecture).toContain('prisma is imported only inside src/database');

    const agents = renderedFiles.get('AGENTS.md') ?? '';
    expect(agents).toContain('rotated on use, and reuse revokes the family');
  });
});

describe('nestjs generator — configuration drives the output', () => {
  it('omits auth, users and rate limiting when authentication is off', async () => {
    const { writtenFiles, renderedFiles } = await render({ authentication: 'none' });

    expect(writtenFiles.filter((f) => f.includes('/auth/'))).toEqual([]);
    expect(writtenFiles.filter((f) => f.includes('/users/'))).toEqual([]);
    expect(renderedFiles.get('src/app.module.ts')).not.toContain('ThrottlerModule');
    expect(renderedFiles.get('.env.example')).not.toContain('JWT_ACCESS_SECRET');
  });

  it('omits the repository interfaces when the pattern is disabled', async () => {
    const { writtenFiles, renderedFiles } = await render({ repositoryPattern: false });

    expect(writtenFiles).not.toContain('src/modules/users/users.repository.ts');
    expect(writtenFiles).toContain('src/modules/users/infrastructure/prisma-users.repository.ts');
    // No token indirection is generated when there is no interface to bind.
    expect(renderedFiles.get('src/modules/users/users.module.ts')).not.toContain(
      'USERS_REPOSITORY',
    );
  });

  it('omits every database file when there is no database', async () => {
    const { writtenFiles } = await render({
      database: 'none',
      orm: 'none',
      authentication: 'none',
      repositoryPattern: false,
    });

    expect(writtenFiles.filter((f) => f.startsWith('src/database/'))).toEqual([]);
    expect(writtenFiles).not.toContain('prisma/schema.prisma');
    expect(writtenFiles).not.toContain('prisma.config.ts');
  });

  it('omits Docker files when Docker is disabled', async () => {
    const { writtenFiles } = await render({ docker: false });
    expect(writtenFiles).not.toContain('Dockerfile');
    expect(writtenFiles).not.toContain('docker-compose.yml');
  });

  it('omits specs and the Vitest config when there is no test runner', async () => {
    const { writtenFiles } = await render({ testing: 'none' });
    expect(writtenFiles.filter((f) => f.endsWith('.spec.ts'))).toEqual([]);
    expect(writtenFiles).not.toContain('vitest.config.mts');
  });

  it('keeps specs but drops the Vitest config under Jest', async () => {
    const { writtenFiles } = await render({ testing: 'jest' });
    expect(writtenFiles).toContain('src/modules/auth/auth.service.spec.ts');
    expect(writtenFiles).not.toContain('vitest.config.mts');
  });

  it('omits AI documentation when it was not requested', async () => {
    const { writtenFiles } = await render({ aiDocumentation: false });
    expect(writtenFiles).not.toContain('ARCHITECTURE.md');
  });

  it('uses the chosen package manager in the Dockerfile', async () => {
    const { renderedFiles } = await render({ packageManager: 'pnpm' });
    const dockerfile = renderedFiles.get('Dockerfile') ?? '';

    expect(dockerfile).toContain('pnpm install --frozen-lockfile');
    expect(dockerfile).toContain('pnpm-lock.yaml');
    expect(dockerfile).not.toContain('npm ci');
  });
});

describe('nestjs generator — security defaults', () => {
  it('runs the container as a non-root user', async () => {
    const { renderedFiles } = await render();
    expect(renderedFiles.get('Dockerfile')).toContain('USER node');
  });

  it('stores only the hash of a refresh token', async () => {
    const { renderedFiles } = await render();
    const schema = renderedFiles.get('prisma/schema.prisma') ?? '';

    expect(schema).toContain('tokenHash  String    @unique');
    expect(schema).not.toMatch(/^\s*token\s+String/m);
  });

  it('requires a long JWT secret', async () => {
    const { renderedFiles } = await render();
    expect(renderedFiles.get('src/config/env.ts')).toContain('@MinLength(32)');
  });

  it('rejects unknown request properties globally', async () => {
    const { renderedFiles } = await render();
    const main = renderedFiles.get('src/main.ts') ?? '';

    expect(main).toContain('whitelist: true');
    expect(main).toContain('forbidNonWhitelisted: true');
  });

  it('binds to 0.0.0.0 so the container is reachable', async () => {
    const { renderedFiles } = await render();
    expect(renderedFiles.get('src/main.ts')).toContain("listen(port, '0.0.0.0')");
  });
});
