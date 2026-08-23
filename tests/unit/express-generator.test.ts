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
import { expressGenerator } from '../../src/generator/frameworks/express/index.js';
import { MemoryLogger } from '../../src/util/logger.js';

/**
 * Renders the real templates in dry-run mode: no install, no network, no disk.
 * Template regressions surface in milliseconds instead of only in the
 * golden-project smoke test.
 */
const GOLDEN: ProjectConfig = parseProjectConfig({
  projectName: 'express-api',
  framework: 'express',
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
    targetDir: path.join(os.tmpdir(), 'scafolder-render-express', config.projectName),
    install: false,
    git: false,
    dryRun: true,
    force: false,
  };
  return generateProject(request, { logger: new MemoryLogger() });
}

beforeEach(() => {
  clearGenerators();
  registerGenerator(expressGenerator);
});

describe('express generator — golden path', () => {
  it('renders the expected project shape', async () => {
    const { writtenFiles } = await render();

    for (const expected of [
      'package.json',
      'tsconfig.json',
      'tsconfig.build.json',
      'eslint.config.mjs',
      '.prettierrc',
      'src/main.ts',
      'src/app.ts',
      'src/container.ts',
      'src/config/env.ts',
      'src/database/prisma.ts',
      'src/shared/errors/domain-error.ts',
      'src/shared/http/error-handler.ts',
      'src/shared/http/validate.ts',
      'src/shared/logging/logger.ts',
      'src/modules/health/health.routes.ts',
      'src/modules/users/users.service.ts',
      'src/modules/users/users.repository.ts',
      'src/modules/auth/auth.routes.ts',
      'src/modules/auth/auth.service.ts',
      'src/modules/auth/auth.schemas.ts',
      'src/modules/auth/tokens.service.ts',
      'src/modules/auth/require-auth.ts',
      'prisma/schema.prisma',
      'prisma.config.ts',
      'Dockerfile',
      'vitest.config.ts',
      'ARCHITECTURE.md',
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

  it('generates a package.json with matching scripts and dependencies', async () => {
    const { renderedFiles } = await render();
    const manifest = JSON.parse(renderedFiles.get('package.json') ?? '{}') as {
      type?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
    };

    expect(manifest.type).toBe('module');
    // Node's own dotenv, so nothing is added to the runtime dependency list.
    expect(manifest.scripts?.['start']).toContain('--env-file-if-exists=.env');
    expect(manifest.scripts?.['dev']).toContain('--env-file-if-exists=.env');
    expect(manifest.dependencies).not.toHaveProperty('dotenv');
    expect(manifest.dependencies).toHaveProperty('express');
    expect(manifest.dependencies).toHaveProperty('@prisma/adapter-pg');
  });

  it('imports with .js extensions, as ESM requires', async () => {
    const { renderedFiles } = await render();
    const main = renderedFiles.get('src/main.ts') ?? '';

    expect(main).toContain("from './app.js'");
    expect(main).not.toMatch(/from '\.\/[a-z-]+';/);
  });
});

describe('express generator — configuration drives the output', () => {
  it('omits auth, users and rate limiting when authentication is off', async () => {
    const { writtenFiles, renderedFiles } = await render({ authentication: 'none' });

    expect(writtenFiles.filter((f) => f.includes('/auth/'))).toEqual([]);
    expect(writtenFiles.filter((f) => f.includes('/users/'))).toEqual([]);
    expect(renderedFiles.get('src/app.ts')).not.toContain('authRoutes');

    const manifest = JSON.parse(renderedFiles.get('package.json') ?? '{}') as {
      dependencies?: Record<string, string>;
    };
    expect(manifest.dependencies).not.toHaveProperty('jose');
    expect(manifest.dependencies).not.toHaveProperty('express-rate-limit');
  });

  it('omits the repository interfaces when the pattern is disabled', async () => {
    const { writtenFiles } = await render({ repositoryPattern: false });

    expect(writtenFiles).not.toContain('src/modules/users/users.repository.ts');
    expect(writtenFiles).toContain('src/modules/users/infrastructure/prisma-users.repository.ts');
  });

  it('omits every database file when there is no database', async () => {
    const { writtenFiles, renderedFiles } = await render({
      database: 'none',
      orm: 'none',
      authentication: 'none',
      repositoryPattern: false,
    });

    expect(writtenFiles.filter((f) => f.startsWith('src/database/'))).toEqual([]);
    expect(writtenFiles).not.toContain('prisma.config.ts');
    expect(renderedFiles.get('src/container.ts')).not.toContain('createPrismaClient');
  });

  it('omits specs and the Vitest config when there is no test runner', async () => {
    const { writtenFiles } = await render({ testing: 'none' });
    expect(writtenFiles.filter((f) => f.endsWith('.spec.ts'))).toEqual([]);
    expect(writtenFiles).not.toContain('vitest.config.ts');
  });
});

describe('express generator — security defaults', () => {
  it('rejects unknown request properties instead of dropping them', async () => {
    const { renderedFiles } = await render();
    expect(renderedFiles.get('src/modules/auth/auth.schemas.ts')).toContain('.strict()');
  });

  it('limits the request body size', async () => {
    const { renderedFiles } = await render();
    expect(renderedFiles.get('src/app.ts')).toContain("limit: '100kb'");
  });

  it('does not advertise the framework', async () => {
    const { renderedFiles } = await render();
    expect(renderedFiles.get('src/app.ts')).toContain("app.disable('x-powered-by')");
  });

  it('redacts credentials from logs', async () => {
    const { renderedFiles } = await render();
    const logger = renderedFiles.get('src/shared/logging/logger.ts') ?? '';

    expect(logger).toContain('req.headers.authorization');
    expect(logger).toContain('passwordHash');
    expect(logger).toContain('refreshToken');
  });

  it('binds to 0.0.0.0 so the container is reachable', async () => {
    const { renderedFiles } = await render();
    expect(renderedFiles.get('src/main.ts')).toContain("app.listen(env.PORT, '0.0.0.0'");
  });

  it('keeps placeholders in .env.example and a generated secret in .env', async () => {
    const { renderedFiles } = await render();

    expect(renderedFiles.get('.env.example')).toContain('JWT_ACCESS_SECRET=replace-me');
    expect(renderedFiles.get('.env')).not.toContain('replace-me');
    expect(renderedFiles.get('.gitignore')).toContain('.env');
  });
});
